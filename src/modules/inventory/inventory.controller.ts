import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { AdjustStoreInventoryDto } from './dto/adjust-store-inventory.dto';
import { CreateMaterialRequestDto } from './dto/create-material-request.dto';
import { ReviewMaterialRequestDto } from './dto/review-material-request.dto';
import { CreateRecipeDto } from './dto/create-recipe.dto';
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

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Raw Materials Catalog
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('raw-materials')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create raw material in global catalog' })
  createRawMaterial(@Body() dto: CreateRawMaterialDto) {
    return this.inventoryService.createRawMaterial(dto);
  }

  @Get('raw-materials')
  @Roles('admin', 'manager', 'cashier', 'waiter', 'barista', 'kitchen')
  @ApiOperation({ summary: 'List all raw materials' })
  findAllRawMaterials() {
    return this.inventoryService.findAllRawMaterials();
  }

  @Patch('raw-materials/:id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update a raw material' })
  updateRawMaterial(@Param('id') id: string, @Body() dto: Partial<CreateRawMaterialDto>) {
    return this.inventoryService.updateRawMaterial(id, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Main Store Inventory
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('main-store')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get main store stock for a branch' })
  getMainStoreStock(@Query('branchId') branchId: string) {
    return this.inventoryService.getMainStoreStock(branchId);
  }

  @Patch('main-store/:materialId/adjust')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Adjust stock in Main Store' })
  adjustMainStore(
    @Query('branchId') branchId: string,
    @Param('materialId') materialId: string,
    @Body() dto: AdjustStoreInventoryDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.adjustMainStore(branchId, materialId, dto, user.id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Kitchen Inventory
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('kitchen')
  @Roles('admin', 'manager', 'kitchen', 'cashier', 'barista')
  @ApiOperation({ summary: 'Get kitchen operational stock for a branch' })
  getKitchenStock(@Query('branchId') branchId: string) {
    return this.inventoryService.getKitchenStock(branchId);
  }

  @Patch('kitchen/:materialId/adjust')
  @Roles('admin', 'manager', 'kitchen')
  @ApiOperation({ summary: 'Adjust stock in Kitchen Inventory' })
  adjustKitchen(
    @Query('branchId') branchId: string,
    @Param('materialId') materialId: string,
    @Body() dto: AdjustStoreInventoryDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.adjustKitchen(branchId, materialId, dto, user.id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Daily Material Requests Workflow
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('requests')
  @Roles('kitchen', 'admin', 'manager')
  @ApiOperation({ summary: 'Submit daily material request from kitchen to main store' })
  createMaterialRequest(
    @Body() dto: CreateMaterialRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.createMaterialRequest(dto, user.id);
  }

  @Get('requests')
  @Roles('admin', 'manager', 'kitchen')
  @ApiOperation({ summary: 'List material requests (optional branch filter)' })
  getMaterialRequests(@Query('branchId') branchId?: string) {
    return this.inventoryService.getMaterialRequests(branchId);
  }

  @Get('requests/:id')
  @Roles('admin', 'manager', 'kitchen')
  @ApiOperation({ summary: 'Get single material request detail' })
  getMaterialRequestById(@Param('id') id: string) {
    return this.inventoryService.getMaterialRequestById(id);
  }

  @Patch('requests/:id/review')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Approve, partially approve, or reject material request' })
  reviewMaterialRequest(
    @Param('id') id: string,
    @Body() dto: ReviewMaterialRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.reviewMaterialRequest(id, dto, user.id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Recipe Management
  // ─────────────────────────────────────────────────────────────────────────────

  @Post('recipes')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create or update recipe for a menu item (product)' })
  createOrUpdateRecipe(@Body() dto: CreateRecipeDto) {
    return this.inventoryService.createOrUpdateRecipe(dto);
  }

  @Get('recipes/:productId')
  @Roles('admin', 'manager', 'kitchen', 'cashier')
  @ApiOperation({ summary: 'Get recipe for a product' })
  getRecipe(@Param('productId') productId: string) {
    return this.inventoryService.getRecipe(productId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Audit Trail & Logs
  // ─────────────────────────────────────────────────────────────────────────────

  @Get('transactions')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get transaction logs history' })
  getTransactionHistory(@Query('branchId') branchId?: string) {
    return this.inventoryService.getTransactionHistory(branchId);
  }
}