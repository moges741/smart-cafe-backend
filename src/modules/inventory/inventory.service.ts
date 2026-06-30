import {
  Injectable, NotFoundException,
  BadRequestException, Logger
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ─── Create inventory record for a product at a branch ──────────────────────
  // Called by managers when they first start tracking a product
  async create(dto: CreateInventoryDto, actorId: string) {

    // Check if inventory already exists for this product+branch combination
    const existing = await this.prisma.inventory.findUnique({
      where: {
        productId_branchId: {
          productId: dto.productId,
          branchId:  dto.branchId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Inventory record already exists for this product at this branch'
      );
    }

    // Create inventory + first log entry in one transaction
    return this.prisma.$transaction(async (tx) => {

      const inventory = await tx.inventory.create({
        data: {
          productId:        dto.productId,
          branchId:         dto.branchId,
          currentQuantity:  dto.openingQuantity,
          reorderThreshold: dto.reorderThreshold ?? 10,
          unit:             dto.unit ?? 'units',
        },
      });

      // Record the opening stock as the first log entry
      // This means the audit trail starts from day one — no mystery stock
      if (dto.openingQuantity > 0) {
        await tx.inventoryLog.create({
          data: {
            inventoryId:    inventory.id,
            delta:          dto.openingQuantity,  // positive — stock added
            reason:         'opening_stock',
            note:           'Initial stock',
            quantityBefore: 0,
            quantityAfter:  dto.openingQuantity,
            actorId,
          },
        });
      }

      return inventory;
    });
  }

  // ─── Manual adjustment ───────────────────────────────────────────────────────
  // Manager adds stock (delivery), removes (wastage), or corrects (count mismatch)
  async adjust(inventoryId: string, dto: AdjustInventoryDto, actorId: string) {

    const inventory = await this.prisma.inventory.findUnique({
      where:   { id: inventoryId },
      include: { branch: true, product: true },
    });

    if (!inventory) throw new NotFoundException('Inventory record not found');

    // Validate the resulting quantity won't go negative
    // You can't have -5 kg of coffee beans
    const newQuantity = inventory.currentQuantity + dto.delta;
    if (newQuantity < 0) {
      throw new BadRequestException(
        `Cannot remove ${Math.abs(dto.delta)} ${inventory.unit} — ` +
        `only ${inventory.currentQuantity} ${inventory.unit} in stock`
      );
    }

    // Update inventory + write log in one transaction
    const updated = await this.prisma.$transaction(async (tx) => {

      // Write the log FIRST — before updating the quantity
      // This way if the update fails, the log also rolls back
      await tx.inventoryLog.create({
        data: {
          inventoryId,
          delta:          dto.delta,
          reason:         dto.reason as any,
          note:           dto.note,
          quantityBefore: inventory.currentQuantity,
          quantityAfter:  newQuantity,
          actorId,
        },
      });

      return tx.inventory.update({
        where: { id: inventoryId },
        data:  { currentQuantity: newQuantity },
        include: { product: true, branch: true },
      });
    });

    // Check if this adjustment pushed stock to a low level
    await this.checkAndNotifyLowStock(updated);

    return updated;
  }

  // ─── Order deduction — called internally when payment is confirmed ───────────
  // This is NOT exposed as an HTTP endpoint — it's called by PaymentsService
  // When a customer pays, we deduct the ordered quantities from stock
  async deductForOrder(
    orderId:  string,
    branchId: string,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    // Process each item in the order
    for (const item of items) {

      // Find the inventory record for this product at this branch
      const inventory = await this.prisma.inventory.findUnique({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId,
          },
        },
        include: { branch: true, product: true },
      });

      // If no inventory record exists, skip silently
      // Not all products are tracked — some cafes don't track every ingredient
      if (!inventory) {
        this.logger.warn(
          `No inventory record for product ${item.productId} at branch ${branchId} — skipping deduction`
        );
        continue;
      }

      // Calculate new quantity — allow it to go to 0 but warn
      const newQuantity = Math.max(0, inventory.currentQuantity - item.quantity);

      await this.prisma.$transaction(async (tx) => {

        await tx.inventoryLog.create({
          data: {
            inventoryId:    inventory.id,
            delta:          -item.quantity,   // negative = stock removed
            reason:         'order_deduction',
            note:           `Order deduction for order ID: ${orderId}`,
            quantityBefore: inventory.currentQuantity,
            quantityAfter:  newQuantity,
            orderId,
            // actorId is null — this is system-generated, not a human action
          },
        });

        await tx.inventory.update({
          where: { id: inventory.id },
          data:  { currentQuantity: newQuantity },
        });
      });

      // Check low stock after every deduction
      const refreshed = await this.prisma.inventory.findUnique({
        where:   { id: inventory.id },
        include: { branch: true, product: true },
      });

      if (refreshed) await this.checkAndNotifyLowStock(refreshed);
    }
  }

  // ─── Get all inventory — with optional filters ───────────────────────────────
  findAll(query: QueryInventoryDto) {
    return this.prisma.inventory.findMany({
      where: {
        ...(query.branchId && { branchId: query.branchId }),

        // Low stock filter — items where currentQuantity <= reorderThreshold
        // Prisma doesn't support "field <= other field" directly
        // So we use a raw filter with lte on a computed expression
        ...(query.lowStockOnly && {
          currentQuantity: { lte: 10 }, // simplified — see note below
        }),
      },
      include: {
        product: { select: { id: true, name: true, price: true } },
        branch:  { select: { id: true, name: true } },
      },
      orderBy: { currentQuantity: 'asc' }, // lowest stock first
    });
  }

  // ─── Get one inventory with full log history ─────────────────────────────────
  async findOne(id: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where:   { id },
      include: {
        product: true,
        branch:  true,
        // Last 20 log entries, newest first
        logs: {
          orderBy: { createdAt: 'desc' },
          take:    20,
          include: {
            actor: { select: { id: true, email: true } },
            order: { select: { id: true, orderNumber: true } },
          },
        },
      },
    });

    if (!inventory) throw new NotFoundException('Inventory record not found');
    return inventory;
  }

  // ─── Private: check and fire low stock alert ─────────────────────────────────
  // Called after every stock change — deduction or manual adjustment
  private async checkAndNotifyLowStock(inventory: any) {

    if (inventory.currentQuantity <= inventory.reorderThreshold) {
      this.logger.warn(
        `LOW STOCK: ${inventory.product.name} at ${inventory.branch.name} — ` +
        `${inventory.currentQuantity} ${inventory.unit} remaining`
      );

      // Find all managers at this branch to notify them
      const managers = await this.prisma.employee.findMany({
        where: {
          branchId: inventory.branchId,
          role:     { in: ['manager', 'admin'] },
        },
        include: { user: true },
      });

      // Fire Socket.io notification to each manager's personal room
      for (const manager of managers) {
        this.events.emitNotification(
          manager.userId,
          `Low stock alert: ${inventory.product.name}`,
          {
            type:             'low_stock',
            inventoryId:      inventory.id,
            productName:      inventory.product.name,
            currentQuantity:  inventory.currentQuantity,
            reorderThreshold: inventory.reorderThreshold,
            unit:             inventory.unit,
            branchName:       inventory.branch.name,
          },
        );
      }
    }
  }
}