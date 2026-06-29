import {
  Controller, Post, Get, Body, Param,
  UseGuards, Req, Headers, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { CashConfirmDto } from './dto/cash-confirm.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Customer calls this to get a checkout URL
  // Protected — must be logged in as a customer
  @Post('initialize')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Initialize Chapa payment — returns checkout URL',
    description: 'Customer calls this. Returns a URL to redirect the customer to Chapa.',
  })
  initializePayment(
    @Body() dto: InitializePaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.initializePayment(dto, user);
  }

  // Cashier calls this when customer pays cash at the counter
  // Protected — cashier/manager/admin only
  @Post('cash-confirm')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('cashier', 'manager', 'admin')
  @ApiOperation({
    summary: 'Confirm cash payment at counter (cashier only)',
    description: 'No Chapa involved. Cashier confirms physical cash was received.',
  })
  confirmCash(
    @Body() dto: CashConfirmDto,
    @CurrentUser() cashier: any,
  ) {
    return this.paymentsService.confirmCashPayment(dto, cashier);
  }

  // Chapa calls this — NOT your frontend
  // Must be PUBLIC — no JwtAuthGuard
  // Security = signature verification inside the service
  @Post('webhook')
  @HttpCode(HttpStatus.OK)  // must return 200 or Chapa retries for 72 hours
  @ApiOperation({
    summary: 'Chapa webhook endpoint — Chapa calls this, not you',
    description: 'Do not call manually. Chapa POSTs here when a payment completes.',
  })
  handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-chapa-signature') xChapaSignature: string,
    @Headers('chapa-signature') chapaSignature: string,
  ) {
    // Chapa sends either x-chapa-signature or chapa-signature header
    // Accept whichever is present
    const signature = xChapaSignature ?? chapaSignature;

    // Use raw body for signature verification
    // If rawBody isn't available fall back to JSON.stringify
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);

    return this.paymentsService.handleWebhook(rawBody, signature);
  }

  // Check payment status for an order
  @Get('order/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get payment status for a specific order' })
  getPaymentByOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.getPaymentByOrder(orderId);
  }
}