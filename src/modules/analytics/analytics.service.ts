import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsQueryDto, AnalyticsPeriod } from './dto/analytics-query.dto';
import { getDateRange } from '../../common/utils/date-range.util';
import { Parser } from 'json2csv';
import { query } from 'node_modules/axios/index.cjs';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Helper: build the date filter Prisma WHERE clause ──────────────────────
  // Used by every query below — extracted so we don't repeat it 5 times
  private buildDateFilter(period: AnalyticsPeriod, branchId?: string) {
    const { from, to } = getDateRange(period);

    return {
      // createdAt between from and to
      createdAt: { gte: from, lte: to },
      // Only include this branch if branchId was provided
      ...(branchId && { branchId }),
    };
  }

  // ─── 1. Sales Summary ───────────────────────────────────────────────────────
  // Returns: total revenue, total orders, average order value, completed vs cancelled
  async getSalesSummary(query: AnalyticsQueryDto) {
    const where = this.buildDateFilter(
      query.period ?? AnalyticsPeriod.THIS_MONTH,
      query.branchId,
    );

    // aggregate() runs SQL functions like SUM, COUNT, AVG on a column
    // This single query returns all three at once — one DB round trip
    const [aggregate, statusBreakdown] = await Promise.all([

      // SUM of totalAmount for completed orders + COUNT of all orders
      this.prisma.order.aggregate({
        where: { ...where, status: 'completed' },
        _sum:   { totalAmount: true },  // SUM(totalAmount)
        _count: { id: true },           // COUNT(id)
        _avg:   { totalAmount: true },  // AVG(totalAmount)
      }),

      // GROUP BY status — how many orders in each status
      // e.g. { status: 'completed', _count: 45 }, { status: 'cancelled', _count: 3 }
      this.prisma.order.groupBy({
        by:    ['status'],
        where,
        _count: { id: true },
      }),
    ]);

    return {
      period:          query.period,
      branchId:        query.branchId ?? 'all branches',
      totalRevenue:    Number(aggregate._sum.totalAmount ?? 0),
      totalOrders:     aggregate._count.id,
      averageOrder:    Number(aggregate._avg.totalAmount ?? 0).toFixed(2),
      // Transform the groupBy result into a readable object
      // { completed: 45, cancelled: 3, pending: 2, ... }
      ordersByStatus:  Object.fromEntries(
        statusBreakdown.map(s => [s.status, s._count.id])
      ),
    };
  }

  // ─── 2. Top Selling Products ────────────────────────────────────────────────
  // Returns: products ranked by units sold and revenue generated
  async getTopProducts(query: AnalyticsQueryDto) {
    const { from, to } = getDateRange(
      query.period ?? AnalyticsPeriod.THIS_MONTH
    );

    // OrderItem doesn't have createdAt on the order level
    // so we filter through the order's createdAt
    const orderItems = await this.prisma.orderItem.groupBy({
      by:    ['productId'],
      where: {
        order: {
          createdAt: { gte: from, lte: to },
          status:    'completed',
          ...(query.branchId && { branchId: query.branchId }),
        },
      },
      // Count how many times each product was ordered
      _sum:   { quantity: true },      // total units sold
      _count: { id: true },            // number of order lines
      orderBy: { _sum: { quantity: 'desc' } }, // highest volume first
      take:  10,                        // top 10 only
    });

    // groupBy only returns IDs — we need product names
    // Fetch the product details for all returned IDs in one query
    const productIds = orderItems.map(i => i.productId);
    const products   = await this.prisma.product.findMany({
      where:  { id: { in: productIds } },
      select: { id: true, name: true, price: true },
    });

    // Build a lookup map for O(1) access: { uuid: { name, price } }
    const productMap = new Map(products.map(p => [p.id, p]));

    // Combine groupBy results with product names
    return orderItems.map((item, index) => {
      const product  = productMap.get(item.productId);
      const unitsSold = item._sum.quantity ?? 0;
      const revenue  = unitsSold * Number(product?.price ?? 0);

      return {
        rank:      index + 1,
        productId: item.productId,
        name:      product?.name ?? 'Unknown',
        unitsSold,
        revenue:   Number(revenue.toFixed(2)),
      };
    });
  }

  
async getOrderVolume(query: AnalyticsQueryDto) {
  const { from, to } = getDateRange(
    query.period ?? AnalyticsPeriod.THIS_MONTH
  );

  const where = {
    createdAt: { gte: from, lte: to },
    ...(query.branchId && { branchId: query.branchId }),
  };

  // Group by status — pure Prisma, no raw SQL
  const byStatus = await this.prisma.order.groupBy({
    by:     ['status'],
    where,
    _count: { id: true },
  });

  // Get all orders in period — we'll group by day in JavaScript
  // instead of raw SQL DATE() grouping
  const orders = await this.prisma.order.findMany({
    where,
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by date string in JavaScript — no raw SQL needed
  // "2026-07-04" → count of orders on that day
  const dailyMap = new Map<string, number>();

  for (const order of orders) {
    // toISOString() gives "2026-07-04T09:55:47.000Z"
    // slice(0, 10) extracts just "2026-07-04"
    const dateKey = order.createdAt.toISOString().slice(0, 10);
    dailyMap.set(dateKey, (dailyMap.get(dateKey) ?? 0) + 1);
  }

  // Convert map to sorted array of { date, count }
  const byDay = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    byStatus: Object.fromEntries(
      byStatus.map(s => [s.status, s._count.id])
    ),
    byDay,
  };
}

  // ─── 4. Inventory Consumption Report ────────────────────────────────────────
  // Returns: how much stock was consumed by orders vs manual removals
  async getInventoryConsumption(query: AnalyticsQueryDto) {
    const { from, to } = getDateRange(
      query.period ?? AnalyticsPeriod.THIS_MONTH
    );

    // Get all inventory logs in the period grouped by reason
    const logs = await this.prisma.inventoryLog.groupBy({
      by:    ['reason', 'inventoryId'],
      where: {
        createdAt: { gte: from, lte: to },
        ...(query.branchId && {
          inventory: { branchId: query.branchId },
        }),
      },
      _sum: { delta: true },
    });

    // Get inventory details for all affected inventory records
    const inventoryIds = [...new Set(logs.map(l => l.inventoryId))];
    const inventories  = await this.prisma.inventory.findMany({
      where:   { id: { in: inventoryIds } },
      include: { product: { select: { id: true, name: true } } },
    });

    const inventoryMap = new Map(inventories.map(i => [i.id, i]));

    // Group results by inventory item
    const grouped = new Map<string, any>();

    for (const log of logs) {
      const inv = inventoryMap.get(log.inventoryId);
      if (!inv) continue;

      if (!grouped.has(log.inventoryId)) {
        grouped.set(log.inventoryId, {
          inventoryId:  log.inventoryId,
          productName:  inv.product.name,
          unit:         inv.unit,
          currentStock: inv.currentQuantity,
          movements:    {},
        });
      }

      // e.g. movements: { order_deduction: -45, manual_addition: +100 }
      grouped.get(log.inventoryId).movements[log.reason] =
        Number(log._sum.delta ?? 0);
    }

    return Array.from(grouped.values());
  }

  // ─── 5. Composite Dashboard ─────────────────────────────────────────────────
  // Calls all 4 analytics functions and returns everything in one response
  // This is the endpoint your frontend dashboard calls on load
  async getDashboard(query: AnalyticsQueryDto) {

    // Run all queries in PARALLEL with Promise.all
    // Without Promise.all they'd run one after another (slow)
    // With Promise.all they run simultaneously (fast)
    const [
      salesSummary,
      topProducts,
      orderVolume,
      inventoryConsumption,
      lowStockAlerts,
    ] = await Promise.all([
      this.getSalesSummary(query),
      this.getTopProducts(query),
      this.getOrderVolume(query),
      this.getInventoryConsumption(query),

      // Low stock items — always shown regardless of period
      this.prisma.inventory.findMany({
        where: {
          ...(query.branchId && { branchId: query.branchId }),
          // Items at or below their reorder threshold
          // Prisma 7 supports this with a raw filter
        },
        include: {
          product: { select: { name: true } },
          branch:  { select: { name: true } },
        },
        orderBy: { currentQuantity: 'asc' },
        take:    10,
      }),
    ]);

    return {
      generatedAt:    new Date().toISOString(),
      period:         query.period,
      branchId:       query.branchId ?? 'all',
      salesSummary,
      topProducts,
      orderVolume,
      inventoryConsumption,
      // Filter low stock in JS since Prisma can't compare two columns natively
      lowStockAlerts: lowStockAlerts
        .filter(i => i.currentQuantity <= i.reorderThreshold)
        .map(i => ({
          productName:      i.product.name,
          branchName:       i.branch.name,
          currentQuantity:  i.currentQuantity,
          reorderThreshold: i.reorderThreshold,
          unit:             i.unit,
        })),
    };
  }

  // ─── 6. CSV Export ──────────────────────────────────────────────────────────

  async exportCsv(
    type:  'sales' | 'products' | 'orders' | 'inventory',
    query: AnalyticsQueryDto,
  ): Promise<{ csv: string; filename: string }> {

    let data:   any[]    = [];
    let fields: string[] = [];
    let filename = '';

    // Fetch the right data based on type
    if (type === 'sales') {
      const summary = await this.getSalesSummary(query);
      // CSV needs flat array of rows — wrap summary in array
      data   = [summary];
      fields = ['period', 'totalRevenue', 'totalOrders', 'averageOrder'];
      filename = `sales-summary-${query.period}.csv`;

    } else if (type === 'products') {
      data     = await this.getTopProducts(query);
      fields   = ['rank', 'name', 'unitsSold', 'revenue'];
      filename = `top-products-${query.period}.csv`;

    } else if (type === 'orders') {
      // For orders CSV, export actual order rows not the aggregation
      const { from, to } = getDateRange(
        query.period ?? AnalyticsPeriod.THIS_MONTH
      );
      const orders = await this.prisma.order.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          ...(query.branchId && { branchId: query.branchId }),
        },
        include: {
          customer: { select: { email: true } },
          branch:   { select: { name:  true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Flatten nested objects for CSV
      data = orders.map(o => ({
        orderNumber:   o.orderNumber,
        status:        o.status,
        type:          o.type,
        totalAmount:   Number(o.totalAmount),
        tableNumber:   o.tableNumber ?? '',
        customerEmail: o.customer.email,
        branch:        o.branch.name,
        createdAt:     o.createdAt.toISOString(),
      }));

      fields   = ['orderNumber', 'status', 'type', 'totalAmount',
                  'tableNumber', 'customerEmail', 'branch', 'createdAt'];
      filename = `orders-${query.period}.csv`;

    } else if (type === 'inventory') {
      data     = await this.getInventoryConsumption(query);
      fields   = ['productName', 'unit', 'currentStock'];
      filename = `inventory-consumption-${query.period}.csv`;
    }

    // json2csv Parser converts array of objects to CSV string
    // fields defines which keys to include and their column order
    const parser = new Parser({ fields });
    const csv    = parser.parse(data);

    return { csv, filename };
  }
}