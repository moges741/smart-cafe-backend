import {
  Controller, Get, Query, Param,
  UseGuards, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, AnalyticsPeriod } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'manager')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}


  @Get('dashboard')
  @ApiOperation({
    summary: 'Full dashboard — sales, top products, order volume, inventory',
    description: 'All analytics in one call. Use period and branchId to filter.',
  })
  getDashboard(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getDashboard(query);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Sales summary — revenue, order count, average order' })
  getSales(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getSalesSummary(query);
  }

  @Get('products')
  @ApiOperation({ summary: 'Top 10 selling products by units sold' })
  getProducts(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getTopProducts(query);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Order volume breakdown by status and by day' })
  getOrders(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getOrderVolume(query);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Inventory consumption — what was used and how much' })
  getInventory(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getInventoryConsumption(query);
  }

  // CSV export — response is a file download, not JSON
  @Get('export/:type')
  @ApiOperation({
    summary: 'Export analytics as CSV',
    description: 'type = sales | products | orders | inventory',
  })
  @ApiQuery({ name: 'period', enum: AnalyticsPeriod, required: false })
  @ApiQuery({ name: 'branchId', required: false })
  async exportCsv(
    @Param('type') type: 'sales' | 'products' | 'orders' | 'inventory',
    @Query() query: AnalyticsQueryDto,
    @Res() res: Response,
  ) {
    const { csv, filename } = await this.analyticsService.exportCsv(type, query);

    // Set headers that tell the browser "this is a file download"
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.send(csv);
  }
}