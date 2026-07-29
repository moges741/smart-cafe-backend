import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateRawMaterialDto } from './dto/create-raw-material.dto';
import { AdjustStoreInventoryDto } from './dto/adjust-store-inventory.dto';
import { CreateMaterialRequestDto } from './dto/create-material-request.dto';
import { ReviewMaterialRequestDto } from './dto/review-material-request.dto';
import { CreateRecipeDto } from './dto/create-recipe.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Raw Materials Catalog (Branch-Scoped)
  // ─────────────────────────────────────────────────────────────────────────────

  async createRawMaterial(dto: CreateRawMaterialDto) {
    return this.prisma.rawMaterial.create({
      data: {
        name: dto.name,
        category: dto.category,
        sku: dto.sku,
        unit: dto.unit,
        minStockLevel: dto.minStockLevel ?? 0,
        description: dto.description,
        branchId: dto.branchId ?? null,
      },
    });
  }

  async findAllRawMaterials(branchId?: string) {
    const where: any = {};
    if (branchId && branchId !== 'null' && branchId !== 'undefined') {
      // Return materials that belong to this branch OR have no branch (global)
      where.OR = [
        { branchId },
        { branchId: null },
      ];
    }
    return this.prisma.rawMaterial.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async updateRawMaterial(id: string, dto: Partial<CreateRawMaterialDto>) {
    const material = await this.prisma.rawMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Raw material not found');

    return this.prisma.rawMaterial.update({
      where: { id },
      data: dto,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Main Store Inventory
  // ─────────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Main Store Inventory
  // ─────────────────────────────────────────────────────────────────────────────

  async getMainStoreStock(branchId?: string) {
    let effectiveBranchId = branchId;
    if (!effectiveBranchId || effectiveBranchId === 'null' || effectiveBranchId === 'undefined') {
      const defaultBranch = await this.prisma.branch.findFirst({ where: { isActive: true } });
      effectiveBranchId = defaultBranch?.id;
    }

    // Only show raw materials that belong to this branch or have no branch (global)
    const rawMaterialWhere: any = { isActive: true };
    if (effectiveBranchId) {
      rawMaterialWhere.OR = [
        { branchId: effectiveBranchId },
        { branchId: null },
      ];
    }

    const rawMaterials = await this.prisma.rawMaterial.findMany({
      where: rawMaterialWhere,
      orderBy: { name: 'asc' },
    });

    const existingStock = effectiveBranchId
      ? await this.prisma.mainStoreInventory.findMany({
          where: { branchId: effectiveBranchId },
        })
      : [];

    const stockMap = new Map(existingStock.map((s) => [s.materialId, s]));

    return rawMaterials.map((material) => {
      const stock = stockMap.get(material.id);
      return {
        id: stock?.id ?? `temp-${material.id}`,
        materialId: material.id,
        material,
        branchId: effectiveBranchId ?? '',
        quantity: stock?.quantity ?? 0,
        createdAt: stock?.createdAt ?? material.createdAt,
        updatedAt: stock?.updatedAt ?? material.updatedAt,
      };
    });
  }

  async adjustMainStore(
    branchId: string,
    materialId: string,
    dto: AdjustStoreInventoryDto,
    actorId: string,
  ) {
    let effectiveBranchId = branchId;
    if (!effectiveBranchId || effectiveBranchId === 'null' || effectiveBranchId === 'undefined') {
      const defaultBranch = await this.prisma.branch.findFirst({ where: { isActive: true } });
      effectiveBranchId = defaultBranch?.id ?? '';
    }

    const material = await this.prisma.rawMaterial.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Raw material not found');

    return this.prisma.$transaction(async (tx) => {
      let stock = await tx.mainStoreInventory.findUnique({
        where: { materialId_branchId: { materialId, branchId: effectiveBranchId } },
      });

      if (!stock) {
        stock = await tx.mainStoreInventory.create({
          data: {
            materialId,
            branchId: effectiveBranchId,
            quantity: 0,
          },
        });
      }

      const newQuantity = stock.quantity + dto.delta;
      if (newQuantity < 0) {
        throw new BadRequestException(
          `Insufficient stock in Main Store. Current: ${stock.quantity} ${material.unit}`,
        );
      }

      const updatedStock = await tx.mainStoreInventory.update({
        where: { id: stock.id },
        data: { quantity: newQuantity },
        include: { material: true },
      });

      await tx.inventoryTransaction.create({
        data: {
          materialId,
          branchId: effectiveBranchId,
          quantity: dto.delta,
          source: dto.delta > 0 ? 'Supplier' : 'MainStore',
          destination: dto.delta > 0 ? 'MainStore' : 'Trash',
          type: dto.reason as any,
          actorId,
          notes: dto.note,
        },
      });

      if (newQuantity <= material.minStockLevel) {
        await this.notifyLowStock(effectiveBranchId, material.name, newQuantity, material.unit, 'Main Store');
      }

      return updatedStock;
    });
  }

  async takeMaterialFromStore(
    branchId: string,
    dto: { materialId: string; quantity: number; notes?: string },
    actorId: string,
  ) {
    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than 0');
    }

    let effectiveBranchId = branchId;
    if (!effectiveBranchId || effectiveBranchId === 'null' || effectiveBranchId === 'undefined') {
      const defaultBranch = await this.prisma.branch.findFirst({ where: { isActive: true } });
      effectiveBranchId = defaultBranch?.id ?? '';
    }

    const material = await this.prisma.rawMaterial.findUnique({ where: { id: dto.materialId } });
    if (!material) throw new NotFoundException('Raw material not found');

    return this.prisma.$transaction(async (tx) => {
      const mainStock = await tx.mainStoreInventory.findUnique({
        where: { materialId_branchId: { materialId: dto.materialId, branchId: effectiveBranchId } },
      });

      const currentQty = mainStock?.quantity ?? 0;
      if (currentQty < dto.quantity) {
        throw new BadRequestException(
          `Cannot withdraw ${dto.quantity} ${material.unit}. Insufficient stock in Main Store (Available: ${currentQty} ${material.unit}).`,
        );
      }

      const updatedMainStock = await tx.mainStoreInventory.update({
        where: { id: mainStock!.id },
        data: { quantity: currentQty - dto.quantity },
      });

      let kitchenStock = await tx.kitchenInventory.findUnique({
        where: { materialId_branchId: { materialId: dto.materialId, branchId: effectiveBranchId } },
      });

      if (!kitchenStock) {
        kitchenStock = await tx.kitchenInventory.create({
          data: {
            materialId: dto.materialId,
            branchId: effectiveBranchId,
            quantity: 0,
          },
        });
      }

      const updatedKitchenStock = await tx.kitchenInventory.update({
        where: { id: kitchenStock.id },
        data: { quantity: kitchenStock.quantity + dto.quantity },
        include: { material: true },
      });

      await tx.inventoryTransaction.create({
        data: {
          materialId: dto.materialId,
          branchId: effectiveBranchId,
          quantity: dto.quantity,
          source: 'MainStore',
          destination: 'Kitchen',
          type: 'transfer',
          actorId,
          notes: dto.notes ? `Direct kitchen withdraw: ${dto.notes}` : 'Direct kitchen ingredient withdraw',
        },
      });

      if (updatedMainStock.quantity <= material.minStockLevel) {
        await this.notifyLowStock(effectiveBranchId, material.name, updatedMainStock.quantity, material.unit, 'Main Store');
      }

      return updatedKitchenStock;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Kitchen Inventory
  // ─────────────────────────────────────────────────────────────────────────────

  async getKitchenStock(branchId?: string) {
    let effectiveBranchId = branchId;
    if (!effectiveBranchId || effectiveBranchId === 'null' || effectiveBranchId === 'undefined') {
      const defaultBranch = await this.prisma.branch.findFirst({ where: { isActive: true } });
      effectiveBranchId = defaultBranch?.id;
    }

    // Only show raw materials that belong to this branch or have no branch (global)
    const rawMaterialWhere: any = { isActive: true };
    if (effectiveBranchId) {
      rawMaterialWhere.OR = [
        { branchId: effectiveBranchId },
        { branchId: null },
      ];
    }

    const rawMaterials = await this.prisma.rawMaterial.findMany({
      where: rawMaterialWhere,
      orderBy: { name: 'asc' },
    });

    const existingStock = effectiveBranchId
      ? await this.prisma.kitchenInventory.findMany({
          where: { branchId: effectiveBranchId },
        })
      : [];

    const stockMap = new Map(existingStock.map((s) => [s.materialId, s]));

    return rawMaterials.map((material) => {
      const stock = stockMap.get(material.id);
      return {
        id: stock?.id ?? `temp-kitchen-${material.id}`,
        materialId: material.id,
        material,
        branchId: effectiveBranchId ?? '',
        quantity: stock?.quantity ?? 0,
        createdAt: stock?.createdAt ?? material.createdAt,
        updatedAt: stock?.updatedAt ?? material.updatedAt,
      };
    });
  }

  async adjustKitchen(
    branchId: string,
    materialId: string,
    dto: AdjustStoreInventoryDto,
    actorId: string,
  ) {
    let effectiveBranchId = branchId;
    if (!effectiveBranchId || effectiveBranchId === 'null' || effectiveBranchId === 'undefined') {
      const defaultBranch = await this.prisma.branch.findFirst({ where: { isActive: true } });
      effectiveBranchId = defaultBranch?.id ?? '';
    }

    const material = await this.prisma.rawMaterial.findUnique({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Raw material not found');

    return this.prisma.$transaction(async (tx) => {
      let stock = await tx.kitchenInventory.findUnique({
        where: { materialId_branchId: { materialId, branchId: effectiveBranchId } },
      });

      if (!stock) {
        stock = await tx.kitchenInventory.create({
          data: {
            materialId,
            branchId: effectiveBranchId,
            quantity: 0,
          },
        });
      }

      const newQuantity = stock.quantity + dto.delta;
      if (newQuantity < 0) {
        throw new BadRequestException(
          `Insufficient stock in Kitchen. Current: ${stock.quantity} ${material.unit}`,
        );
      }

      const updatedStock = await tx.kitchenInventory.update({
        where: { id: stock.id },
        data: { quantity: newQuantity },
        include: { material: true },
      });

      await tx.inventoryTransaction.create({
        data: {
          materialId,
          branchId: effectiveBranchId,
          quantity: dto.delta,
          source: dto.delta > 0 ? 'External' : 'Kitchen',
          destination: dto.delta > 0 ? 'Kitchen' : 'Trash',
          type: dto.reason as any,
          actorId,
          notes: dto.note,
        },
      });

      if (newQuantity <= material.minStockLevel) {
        await this.notifyLowStock(effectiveBranchId, material.name, newQuantity, material.unit, 'Kitchen');
      }

      return updatedStock;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Daily Material Requests Workflow
  // ─────────────────────────────────────────────────────────────────────────────

  async createMaterialRequest(dto: CreateMaterialRequestDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.materialRequest.create({
        data: {
          branchId: dto.branchId,
          notes: dto.notes,
          requestedById: actorId,
          status: 'pending',
          items: {
            create: dto.items.map((item) => ({
              materialId: item.materialId,
              requestedQuantity: item.requestedQuantity,
            })),
          },
        },
        include: {
          items: {
            include: { material: true },
          },
          requestedBy: { select: { firstName: true, lastName: true } },
        },
      });

      // Send real-time notification to all admins/managers
      const managers = await tx.employee.findMany({
        where: {
          branchId: dto.branchId,
          role: { in: ['manager', 'admin'] },
        },
      });

      const senderName = `${request.requestedBy.firstName} ${request.requestedBy.lastName}`.trim();

      for (const mgr of managers) {
        this.events.emitNotification(
          mgr.userId,
          `New material request submitted by ${senderName}`,
          {
            type: 'new_material_request',
            requestId: request.id,
            notes: request.notes,
          },
        );
      }

      return request;
    });
  }

  async getMaterialRequests(branchId?: string) {
    return this.prisma.materialRequest.findMany({
      where: branchId ? { branchId } : {},
      include: {
        items: { include: { material: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMaterialRequestById(id: string) {
    const request = await this.prisma.materialRequest.findUnique({
      where: { id },
      include: {
        items: { include: { material: true } },
        requestedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!request) throw new NotFoundException('Material request not found');
    return request;
  }

  async reviewMaterialRequest(
    requestId: string,
    dto: ReviewMaterialRequestDto,
    actorId: string,
  ) {
    const request = await this.prisma.materialRequest.findUnique({
      where: { id: requestId },
      include: { items: { include: { material: true } } },
    });
    if (!request) throw new NotFoundException('Material request not found');
    if (request.status !== 'pending') {
      throw new BadRequestException('Request has already been processed');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. If approved or partially approved, transfer quantities
      if (dto.status === 'approved' || dto.status === 'partially_approved') {
        for (const item of request.items) {
          // Look for customized approved quantity, or default to requested quantity
          const approvedItem = dto.items?.find((i) => i.materialId === item.materialId);
          const quantityToTransfer = approvedItem
            ? approvedItem.approvedQuantity
            : item.requestedQuantity;

          if (quantityToTransfer <= 0) continue;

          // Deduct from Main Store
          const mainStock = await tx.mainStoreInventory.findUnique({
            where: {
              materialId_branchId: {
                materialId: item.materialId,
                branchId: request.branchId,
              },
            },
          });

          if (!mainStock || mainStock.quantity < quantityToTransfer) {
            throw new BadRequestException(
              `Insufficient stock in Main Store for ${item.material.name}. ` +
              `Available: ${mainStock?.quantity ?? 0}, Required: ${quantityToTransfer}`,
            );
          }

          await tx.mainStoreInventory.update({
            where: { id: mainStock.id },
            data: { quantity: mainStock.quantity - quantityToTransfer },
          });

          // Add to Kitchen Inventory
          let kitchenStock = await tx.kitchenInventory.findUnique({
            where: {
              materialId_branchId: {
                materialId: item.materialId,
                branchId: request.branchId,
              },
            },
          });

          if (!kitchenStock) {
            kitchenStock = await tx.kitchenInventory.create({
              data: {
                materialId: item.materialId,
                branchId: request.branchId,
                quantity: 0,
              },
            });
          }

          await tx.kitchenInventory.update({
            where: { id: kitchenStock.id },
            data: { quantity: kitchenStock.quantity + quantityToTransfer },
          });

          // Update item's approved quantity in the request
          await tx.materialRequestItem.update({
            where: { id: item.id },
            data: { approvedQuantity: quantityToTransfer },
          });

          // Log Transfer Transaction
          await tx.inventoryTransaction.create({
            data: {
              materialId: item.materialId,
              branchId: request.branchId,
              quantity: quantityToTransfer,
              source: 'MainStore',
              destination: 'Kitchen',
              type: 'transfer',
              actorId,
              notes: `Approved request ${request.id}`,
            },
          });
        }
      }

      // Update request status
      const updatedRequest = await tx.materialRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          approvedById: actorId,
          notes: dto.notes,
        },
        include: {
          items: { include: { material: true } },
          requestedBy: { select: { id: true, email: true } },
        },
      });

      // Notify the requester
      const statusText = dto.status.replace('_', ' ').toUpperCase();
      this.events.emitNotification(
        updatedRequest.requestedById,
        `Your daily material request was ${statusText}`,
        {
          type: 'material_request_reviewed',
          requestId: updatedRequest.id,
          status: updatedRequest.status,
        },
      );

      return updatedRequest;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Recipe Management
  // ─────────────────────────────────────────────────────────────────────────────

  async createOrUpdateRecipe(dto: CreateRecipeDto) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.$transaction(async (tx) => {
      // Find or create Recipe
      let recipe = await tx.recipe.findUnique({
        where: { productId: dto.productId },
      });

      if (!recipe) {
        recipe = await tx.recipe.create({
          data: { productId: dto.productId },
        });
      } else {
        // Clear old ingredients to replace them
        await tx.recipeIngredient.deleteMany({
          where: { recipeId: recipe.id },
        });
      }

      // Add ingredients
      await tx.recipeIngredient.createMany({
        data: dto.ingredients.map((ing) => ({
          recipeId: recipe.id,
          materialId: ing.materialId,
          quantity: ing.quantity,
        })),
      });

      return tx.recipe.findUnique({
        where: { id: recipe.id },
        include: {
          ingredients: { include: { material: true } },
        },
      });
    });
  }

  async getRecipe(productId: string) {
    return this.prisma.recipe.findUnique({
      where: { productId },
      include: {
        ingredients: { include: { material: true } },
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Automatic Ingredient Consumption on Orders
  // ─────────────────────────────────────────────────────────────────────────────

  async consumeIngredientsForOrder(orderId: string, branchId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      this.logger.error(`consumeIngredientsForOrder failed: Order ${orderId} not found`);
      return;
    }

    this.logger.log(`Deducting recipe ingredients from Kitchen Inventory for Order #${order.orderNumber}`);

    for (const item of order.items) {
      const recipe = await this.prisma.recipe.findUnique({
        where: { productId: item.productId },
        include: { ingredients: true },
      });

      if (!recipe || recipe.ingredients.length === 0) {
        continue;
      }

      for (const ingredient of recipe.ingredients) {
        const quantityToDeduct = ingredient.quantity * item.quantity;

        await this.prisma.$transaction(async (tx) => {
          let kitchenStock = await tx.kitchenInventory.findUnique({
            where: {
              materialId_branchId: {
                materialId: ingredient.materialId,
                branchId,
              },
            },
          });

          // Even if stock doesn't exist, we create the record to track deduction (allow it to go negative)
          if (!kitchenStock) {
            kitchenStock = await tx.kitchenInventory.create({
              data: {
                materialId: ingredient.materialId,
                branchId,
                quantity: 0,
              },
            });
          }

          const newQuantity = kitchenStock.quantity - quantityToDeduct;

          await tx.kitchenInventory.update({
            where: { id: kitchenStock.id },
            data: { quantity: newQuantity },
          });

          // Log transaction
          await tx.inventoryTransaction.create({
            data: {
              materialId: ingredient.materialId,
              branchId,
              quantity: -quantityToDeduct,
              source: 'Kitchen',
              destination: 'Customer',
              type: 'consumption',
              notes: `Automatic deduction for order #${order.orderNumber}`,
            },
          });
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Audit Trail / Transaction History
  // ─────────────────────────────────────────────────────────────────────────────

  async getTransactionHistory(branchId?: string) {
    return this.prisma.inventoryTransaction.findMany({
      where: branchId ? { branchId } : {},
      include: {
        material: true,
        actor: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // safety cap
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper Notification Method
  // ─────────────────────────────────────────────────────────────────────────────

  private async notifyLowStock(
    branchId: string,
    materialName: string,
    currentQuantity: number,
    unit: string,
    location: 'Main Store' | 'Kitchen',
  ) {
    const managers = await this.prisma.employee.findMany({
      where: {
        branchId,
        role: { in: ['manager', 'admin'] },
      },
    });

    for (const mgr of managers) {
      this.events.emitNotification(
        mgr.userId,
        `LOW STOCK alert in ${location}: ${materialName} (${currentQuantity} ${unit} remaining)`,
        {
          type: 'low_stock_raw_material',
          materialName,
          currentQuantity,
          unit,
          location,
        },
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Legacy / Product-Based Stock (maintaining compatibility with existing endpoints)
  // ─────────────────────────────────────────────────────────────────────────────

  // ─── Order deduction — called internally when payment is confirmed ───────────
  async deductForOrder(
    orderId: string,
    branchId: string,
    items: Array<{ productId: string; quantity: number }>,
  ) {
    // Consume ingredients from Kitchen Inventory based on product recipes.
    // Products without a recipe are skipped automatically (e.g., retail items
    // that haven't been set up yet — add a recipe to track them).
    await this.consumeIngredientsForOrder(orderId, branchId);
  }

  async create(dto: any, actorId: string) {
    const existing = await this.prisma.inventory.findUnique({
      where: {
        productId_branchId: {
          productId: dto.productId,
          branchId: dto.branchId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Inventory record already exists for this product at this branch',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.create({
        data: {
          productId: dto.productId,
          branchId: dto.branchId,
          currentQuantity: dto.openingQuantity,
          reorderThreshold: dto.reorderThreshold ?? 10,
          unit: dto.unit ?? 'units',
        },
      });

      if (dto.openingQuantity > 0) {
        await tx.inventoryLog.create({
          data: {
            inventoryId: inventory.id,
            delta: dto.openingQuantity,
            reason: 'opening_stock',
            note: 'Initial stock',
            quantityBefore: 0,
            quantityAfter: dto.openingQuantity,
            actorId,
          },
        });
      }

      return inventory;
    });
  }

  async adjust(inventoryId: string, dto: any, actorId: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { branch: true, product: true },
    });

    if (!inventory) throw new NotFoundException('Inventory record not found');

    const newQuantity = inventory.currentQuantity + dto.delta;
    if (newQuantity < 0) {
      throw new BadRequestException(
        `Cannot remove ${Math.abs(dto.delta)} — insufficient stock`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryLog.create({
        data: {
          inventoryId,
          delta: dto.delta,
          reason: dto.reason as any,
          note: dto.note,
          quantityBefore: inventory.currentQuantity,
          quantityAfter: newQuantity,
          actorId,
        },
      });

      return tx.inventory.update({
        where: { id: inventoryId },
        data: { currentQuantity: newQuantity },
        include: { product: true, branch: true },
      });
    });

    return updated;
  }

  findAll(query: any) {
    return this.prisma.inventory.findMany({
      where: {
        ...(query.branchId && { branchId: query.branchId }),
        ...(query.lowStockOnly && {
          currentQuantity: { lte: 10 },
        }),
      },
      include: {
        product: { select: { id: true, name: true, price: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { currentQuantity: 'asc' },
    });
  }

  async findOne(id: string) {
    const inventory = await this.prisma.inventory.findUnique({
      where: { id },
      include: {
        product: true,
        branch: true,
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
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
}