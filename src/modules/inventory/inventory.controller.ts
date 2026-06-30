import {
  Controller, Get, Post, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create inventory record for a product at a branch' })
  create(
    @Body() dto: CreateInventoryDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.create(dto, user.id);
  }

  @Get()
  @Roles('admin', 'manager', 'cashier')
  @ApiOperation({ summary: 'List inventory — filter by branch or low stock' })
  findAll(@Query() query: QueryInventoryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get one inventory item with full log history' })
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id/adjust')
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Manually adjust stock',
    description: 'Use positive delta to add stock, negative to remove.',
  })
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustInventoryDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.adjust(id, dto, user.id);
  }
}