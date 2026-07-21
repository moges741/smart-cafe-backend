import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  /**
   * Shared include clause so every response has the same shape.
   */
  private readonly cartInclude = {
    items: {
      include: {
        product: {
          select: { name: true, price: true, imageUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' as const },
    },
  };

  /**
   * Get (or lazily create) the cart for a user.
   * Always returns items with nested product info.
   */
  async getCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: this.cartInclude,
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: this.cartInclude,
      });
    }

    return cart;
  }

  /**
   * Add an item (or bump its quantity if it already exists).
   * Returns the full refreshed cart.
   */
  async addItem(userId: string, dto: AddCartItemDto) {
    const cart = await this.getCart(userId);

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: dto.productId,
        },
      },
    });

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + dto.quantity,
          notes: dto.notes ?? existingItem.notes,
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          quantity: dto.quantity,
          unitPrice: product.price,
          notes: dto.notes,
        },
      });
    }

    // Return the full cart so the frontend gets a complete snapshot
    return this.getCart(userId);
  }

  /**
   * Set an item's quantity to an exact value.
   */
  async updateItem(userId: string, productId: string, dto: UpdateCartItemDto) {
    const cart = await this.getCart(userId);

    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: { cartId: cart.id, productId },
      },
    });

    if (!existingItem) throw new NotFoundException('Item not found in cart');

    await this.prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: dto.quantity },
    });

    return this.getCart(userId);
  }

  /**
   * Remove a single item from the cart.
   */
  async removeItem(userId: string, productId: string) {
    const cart = await this.getCart(userId);

    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: { cartId: cart.id, productId },
      },
    });

    if (!existingItem) throw new NotFoundException('Item not found in cart');

    await this.prisma.cartItem.delete({
      where: { id: existingItem.id },
    });

    return this.getCart(userId);
  }

  /**
   * Empty the entire cart.
   */
  async clearCart(userId: string) {
    const cart = await this.getCart(userId);

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.getCart(userId);
  }

  /**
   * Merge local (guest) cart items into the user's server cart.
   * Uses upsert-style logic: if the product already exists in the
   * server cart, its quantity is bumped; otherwise it's created.
   */
  async syncCart(userId: string, items: AddCartItemDto[]) {
    if (!items || items.length === 0) return this.getCart(userId);

    for (const item of items) {
      try {
        await this.addItem(userId, item);
      } catch {
        // Skip items whose productId no longer exists
      }
    }

    return this.getCart(userId);
  }
}
