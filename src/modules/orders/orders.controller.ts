import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Place a new order' })
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: any,  // the logged-in user from JwtStrategy.validate()
  ) {
    return this.ordersService.create(dto, user.id);
  }

  @Get()
  @Roles('admin', 'manager', 'cashier', 'kitchen', 'waiter')
  @ApiOperation({ summary: 'Get all orders — filter by branch and/or status' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['pending','confirmed','in_kitchen','ready','completed','cancelled'] })
  findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findAll(branchId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one order by ID' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  @Roles('admin', 'manager', 'cashier', 'kitchen')
  @ApiOperation({ summary: 'Update order status (enforces state machine)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto);
  }
}