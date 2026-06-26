import {
  Injectable, NotFoundException, BadRequestException, ConflictException
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

// Valid state transitions — key is current status, value is allowed next statuses
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ['confirmed', 'cancelled'],
  confirmed:  ['in_kitchen', 'cancelled'],
  in_kitchen: ['ready'],
  ready:      ['completed'],
  completed:  [],  // terminal state
  cancelled:  [],  // terminal state
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto, customerId: string) {
    // 1. Validate all products exist and belong to the branch
    const productIds = dto.items.map(i => i.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        branchId: dto.branchId,
        isAvailable: true,
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'One or more products are unavailable or do not belong to this branch'
      );
    }

    // 2. Build a map for quick price lookup
    const productMap = new Map(products.map(p => [p.id, p]));

    // 3. Calculate total — server-side, never trust client-sent totals
    let totalAmount = 0;
    const itemsData = dto.items.map(item => {
      const product = productMap.get(item.productId)!;
      const unitPrice = Number(product.price);
      totalAmount += unitPrice * item.quantity;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price, // snapshot the price right now
        notes: item.notes,
      };
    });

    // 4. Generate human-readable order number
    const count = await this.prisma.order.count();
    const orderNumber = `ORD-${String(count + 1).padStart(4, '0')}`;

    // 5. Create order + items in a single transaction
    // A transaction means: either ALL of this succeeds, or NONE of it does
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          branchId: dto.branchId,
          type: dto.type ?? 'dine_in',
          tableNumber: dto.tableNumber,
          notes: dto.notes,
          totalAmount,
          items: { create: itemsData },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true } } } },
          customer: { select: { id: true, email: true } },
        },
      });

      return order;
    });
  }

  findAll(branchId?: string, status?: string) {
    return this.prisma.order.findMany({
      where: {
        ...(branchId && { branchId }),
        ...(status && { status: status as any }),
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, price: true } } } },
        customer: { select: { id: true, email: true } },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, email: true } },
        payment: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.findOne(id);

    // Enforce the state machine — reject invalid transitions
    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Cannot transition order from "${order.status}" to "${dto.status}". ` +
        `Allowed: ${allowed.length ? allowed.join(', ') : 'none (terminal state)'}`
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: dto.status as any },
      include: { items: true },
    });
  }
}