import {
  Injectable, NotFoundException,
  BadRequestException, ConflictException
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:    ['confirmed', 'in_kitchen', 'cancelled'],
  confirmed:  ['in_kitchen', 'cancelled'],
  in_kitchen: ['ready'],
  ready:      ['completed'],
  completed:  [],
  cancelled:  [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService, // injected here
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateOrderDto, customerId: string) {
    const productIds = dto.items.map(i => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, branchId: dto.branchId, isAvailable: true },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'One or more products are unavailable or do not belong to this branch'
      );
    }

    const productMap = new Map(products.map(p => [p.id, p]));

    let totalAmount = 0;
    const itemsData = dto.items.map(item => {
      const product = productMap.get(item.productId)!;
      totalAmount += Number(product.price) * item.quantity;
      return {
        productId: item.productId,
        quantity:  item.quantity,
        unitPrice: product.price,
        notes:     item.notes,
      };
    });

    const count = await this.prisma.order.count();
    const orderNumber = `ORD-${String(count + 1).padStart(4, '0')}`;

    const order = await this.prisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          orderNumber,
          customerId,
          branchId:    dto.branchId,
          type:        dto.type ?? 'dine_in',
          tableNumber: dto.tableNumber,
          notes:       dto.notes,
          totalAmount,
          items: { create: itemsData },
        },
        include: {
          items: {
            include: { product: { select: { id: true, name: true } } }
          },
          customer: { select: { id: true, email: true } },
        },
      });
    });

    // 🔴 Fire real-time event — kitchen sees this order instantly
    this.eventsService.emitNewOrder(order);

    // 🔴 Fire background event for asynchronous email notifications
    this.eventEmitter.emit('order.created', order);

    return order;
  }

  findAll(branchId?: string, status?: string, days?: number) {
    const whereClause: any = {
      ...(branchId && { branchId }),
      ...(status && { status: status as any }),
    };

    if (days) {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);
      whereClause.createdAt = { gte: dateLimit };
    }

    return this.prisma.order.findMany({
      where: whereClause,
      include: {
        items: {
          include: { product: { select: { id: true, name: true, price: true, categoryId: true } } }
        },
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

    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Cannot transition from "${order.status}" to "${dto.status}". ` +
        `Allowed: ${allowed.length ? allowed.join(', ') : 'none — terminal state'}`
      );
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: dto.status as any },
      include: { items: true },
    });

    // 🔴 Fire real-time event — kitchen + customer tracking both update instantly
    this.eventsService.emitOrderStatusUpdate(updated);

    return updated;
  }
}