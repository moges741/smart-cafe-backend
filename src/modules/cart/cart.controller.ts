import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@Request() req) {
    return this.cartService.getCart(req.user.id);
  }

  @Post('items')
  addItem(@Request() req, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(req.user.id, dto);
  }

  @Put('items/:productId')
  updateItem(@Request() req, @Param('productId') productId: string, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(req.user.id, productId, dto);
  }

  @Delete('items/:productId')
  removeItem(@Request() req, @Param('productId') productId: string) {
    return this.cartService.removeItem(req.user.id, productId);
  }

  @Delete()
  clearCart(@Request() req) {
    return this.cartService.clearCart(req.user.id);
  }

  @Post('sync')
  syncCart(@Request() req, @Body() items: AddCartItemDto[]) {
    return this.cartService.syncCart(req.user.id, items);
  }
}
