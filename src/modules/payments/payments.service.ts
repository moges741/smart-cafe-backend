import {
  Injectable, NotFoundException, BadRequestException,
  ConflictException, ForbiddenException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ChapaService } from './chapa.service';
import { EventsService } from '../events/events.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { CashConfirmDto } from './dto/cash-confirm.dto';
import { v4 as uuidv4 } from 'uuid';
import { InventoryService } from '../inventory/inventory.service';
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly chapa:    ChapaService,
    private readonly events:   EventsService,
    private readonly config:   ConfigService,
    private readonly inventory: InventoryService,
  ) {}

  // ─── DIGITAL PAYMENT via Chapa ──────────────────────────────────────────────
  async initializePayment(dto: InitializePaymentDto, currentUser: any) {

    // 1. Load the order with its customer and existing payment
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        customer: { select: { id: true, email: true } },
        payment:  true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    // 2. Security check — only the order's own customer can pay
    // A different user cannot pay for someone else's order
    if (order.customerId !== currentUser.id) {
      throw new ForbiddenException('You can only pay for your own orders');
    }

    // 3. Business rule checks
    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot pay for a cancelled order');
    }

    if (order.status === 'completed') {
      throw new BadRequestException('This order is already completed');
    }

    // 4. Idempotency — if already paid, don't initialize again
    if (order.payment?.status === 'completed') {
      throw new ConflictException('This order has already been paid');
    }

    // 5. Generate unique transaction reference
    // Format: CAFE-ORD-0001-ABCD1234
    // We include the order number so it's human-readable in the Chapa dashboard
    const txRef = `CAFE-${order.orderNumber}-${uuidv4().slice(0, 8).toUpperCase()}`;

    // 6. Build URLs
    const appUrl      = this.config.get<string>('APP_URL')!;
    const callbackUrl = `${appUrl}/api/v1/payments/webhook`;
    const returnUrl   = this.config.get<string>('FRONTEND_RETURN_URL')!;

    // 7. Call Chapa to initialize the transaction
    const chapaResponse = await this.chapa.initializeTransaction({
      amount:      Number(order.totalAmount),
      email:       order.customer.email,
      // Use email prefix as name if no dedicated name field exists yet
      firstName:   order.customer.email.split('@')[0],
      lastName:    'Customer',
      txRef,
      phoneNumber: dto.phoneNumber,
      callbackUrl,
      returnUrl,
      title:       'Smart Cafe',
      description: `Payment for order ${order.orderNumber}`,
    });

    const checkoutUrl = chapaResponse.data?.checkout_url;

    // 8. Save the pending payment record in our database
    // upsert = update if exists, create if not
    // This handles the case where they initialize payment more than once
    await this.prisma.payment.upsert({
      where:  { orderId: order.id },
      update: {
        // If re-initializing, update with fresh txRef and checkout URL
        txRef,
        checkoutUrl,
        status: 'pending',
        method: 'chapa',
      },
      create: {
        orderId:    order.id,
        amount:     order.totalAmount,
        method:     'chapa',
        status:     'pending',
        txRef,
        checkoutUrl,
      },
    });

    // 9. Return what the frontend needs
    return {
      checkoutUrl,   // frontend redirects customer here
      txRef,
      amount:        order.totalAmount,
      currency:      'ETB',
      orderNumber:   order.orderNumber,
      instruction:   'Open checkoutUrl in the browser to complete payment',
    };
  }

  // ─── CASH PAYMENT — cashier confirms manually ────────────────────────────────
  // No Chapa involved — cashier physically collects cash and marks it done
  async confirmCashPayment(dto: CashConfirmDto, cashier: any) {

    const order = await this.prisma.order.findUnique({
      where:   { id: dto.orderId },
      include: { payment: true ,
        items:   true,  
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    // Only cashiers and managers can confirm cash payments
    const allowedRoles = ['cashier', 'manager', 'admin'];
    if (!allowedRoles.includes(cashier.role?.name)) {
      throw new ForbiddenException('Only cashiers can confirm cash payments');
    }

    if (order.payment?.status === 'completed') {
      throw new ConflictException('This order has already been paid');
    }

    if (order.status === 'cancelled') {
      throw new BadRequestException('Cannot accept payment for a cancelled order');
    }

    // Everything in one transaction — payment record + order status
    // $transaction means: if anything fails, NOTHING is saved
    const updatedOrder = await this.prisma.$transaction(async (tx) => {

      // Create or update the payment as completed immediately
      await tx.payment.upsert({
        where:  { orderId: order.id },
        update: { status: 'completed', method: 'cash' },
        create: {
          orderId: order.id,
          amount:  order.totalAmount,
          method:  'cash',
          status:  'completed',
          // txRef, checkoutUrl are null for cash — that's fine, they're optional
        },
      });
      await this.inventory.deductForOrder(
  order.id,
  order.branchId,
  order.items.map(i => ({
    productId: i.productId,
    quantity:  i.quantity,
  })),
);

      // Move order to confirmed — kitchen can start preparing
      return tx.order.update({
        where:   { id: order.id },
        data:    { status: 'confirmed' },
        include: { items: true },
      });
// After the $transaction block in confirmCashPayment:

      
    });
  

    // Notify kitchen in real time via Socket.io
    this.events.emitOrderStatusUpdate(updatedOrder);

    return {
      message:     'Cash payment confirmed',
      orderNumber: updatedOrder.orderNumber,
      status:      updatedOrder.status,
    };


  }

  
  async handleWebhook(rawBody: string, signature: string) {

    // 1. Verify signature FIRST — before parsing or trusting anything
    const isGenuine = this.chapa.verifyWebhookSignature(rawBody, signature);
    if (!isGenuine) {
      this.logger.warn('Rejected webhook — invalid signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    // 2. Parse the body now that we know it's genuine
    const event = JSON.parse(rawBody);
    this.logger.log(`Webhook received — event: ${event.event}, tx_ref: ${event.tx_ref}`);

    // 3. Only process successful charge events
    // Chapa also sends payout events, refund events etc — ignore those
    if (event.event !== 'charge.success') {
      // Still return 200 — Chapa expects 200 for all webhooks
      // If you return non-200, Chapa retries for 72 hours
      return { received: true };
    }

    // 4. Find our payment record using the txRef
    const payment = await this.prisma.payment.findUnique({
      where:   { txRef: event.tx_ref },
      include: { 
        order: { include: { items: true } },

       },
    });

    if (!payment) {
      // Could happen if webhook arrives before our DB write completes (race condition)
      this.logger.warn(`No payment record found for tx_ref: ${event.tx_ref}`);
      return { received: true };
    }

    // 5. Idempotency check — same webhook delivered twice is normal
    // Just acknowledge without doing anything if already processed
    if (payment.status === 'completed') {
      this.logger.log(`Already processed — tx_ref: ${event.tx_ref}`);
      return { received: true };
    }

    // 6. CRITICAL: verify with Chapa's API server-to-server
    // The webhook payload alone is not enough proof — verify independently
    // Why? Webhook payloads could theoretically be crafted by attackers
    // (the signature check helps, but defense in depth is best practice)
    const verification = await this.chapa.verifyTransaction(event.tx_ref);

    if (verification.data?.status !== 'success') {
      this.logger.warn(`Verification returned non-success for tx_ref: ${event.tx_ref}`);
      await this.prisma.payment.update({
        where: { txRef: event.tx_ref },
        data:  { status: 'failed' },
      });
      return { received: true };
    }

    // 7. Also verify the amount matches what we expected
    // Prevents amount manipulation attacks
    const expectedAmount = Number(payment.amount);
    const paidAmount     = Number(verification.data?.amount);

    if (Math.abs(expectedAmount - paidAmount) > 0.01) {
      this.logger.error(
        `Amount mismatch for tx_ref: ${event.tx_ref}. ` +
        `Expected: ${expectedAmount}, Got: ${paidAmount}`
      );
      return { received: true };
    }

    // 8. Everything checks out — update DB in a transaction
    const updatedOrder = await this.prisma.$transaction(async (tx) => {

      await tx.payment.update({
        where: { txRef: event.tx_ref },
        data: {
          status:            'completed',
          chapaRef:          verification.data?.reference,
          // Store which method they used — useful for analytics
          chapaPaymentMethod: event.payment_method ?? verification.data?.payment_method,
        },
      });
await this.inventory.deductForOrder(
  payment.orderId,
  payment.order.branchId,
  // Need items — add them to the payment query
  payment.order.items.map((i: any) => ({
    productId: i.productId,
    quantity:  i.quantity,
  })),
);
      // Payment received → order confirmed → kitchen gets to work
      return tx.order.update({
        where:   { id: payment.orderId },
        data:    { status: 'confirmed' },
        include: { items: true },
      });
    });

    // 9. Fire real-time event — kitchen sees the confirmed order instantly
    this.events.emitOrderStatusUpdate(updatedOrder);

    this.logger.log(
      `Payment confirmed — order: ${updatedOrder.orderNumber}, ` +
      `method: ${event.payment_method}`
    );

    // 10. Return 200 — crucial, otherwise Chapa retries the webhook
    return { received: true };
  }

  // ─── GET payment status ──────────────────────────────────────────────────────
  async getPaymentByOrder(orderId: string) {
    const payment = await this.prisma.payment.findUnique({
      where:   { orderId },
      include: {
        order: { select: { orderNumber: true, totalAmount: true, status: true } },
      },
    });

    if (!payment) throw new NotFoundException('No payment found for this order');
    return payment;
  }
}