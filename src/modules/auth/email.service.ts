import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  htmlToPlainText,
  isAxiosError,
  ResendApiError,
  ResendClient,
} from './resend.client';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly resendClient: ResendClient,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {
    this.fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'noreply@mail.dev-moges.me';
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    if (!this.resendClient.isEnabled()) {
      this.logger.warn('RESEND_API_KEY is not defined. Emails will be mocked.');
    } else if (!this.configService.get<string>('RESEND_FROM_EMAIL')) {
      this.logger.warn(
        'RESEND_FROM_EMAIL is not set. Using default noreply@mail.dev-moges.me',
      );
    }
  }

  @OnEvent('order.created', { async: true })
  async handleOrderCreated(order: any) {
    try {
      this.logger.log(`Processing order.created event for order ID: ${order?.id}`);

      const fullOrder = await this.prisma.order.findUnique({
        where: { id: order.id },
        include: {
          branch: true,
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          items: { include: { product: true } },
          payment: true,
        },
      });

      if (!fullOrder) {
        this.logger.error(`Order with ID ${order?.id} not found in database.`);
        return;
      }

      const cashiers = await this.usersService.getCashiersByBranch(fullOrder.branchId);

      if (!cashiers || cashiers.length === 0) {
        this.logger.warn(
          `No active cashiers/managers/admins found to receive notification for branch "${fullOrder.branch?.name ?? fullOrder.branchId}"`,
        );
        return;
      }

      this.logger.log(
        `Notifying ${cashiers.length} staff recipient(s) for Order #${fullOrder.orderNumber}: ${cashiers.map((c) => c.email).join(', ')}`,
      );

      const orderTypeFormatted = fullOrder.type === 'dine_in' ? 'Dine In' : 'Takeaway';
      const paymentMethod = fullOrder.payment?.method
        ? fullOrder.payment.method.toUpperCase()
        : 'CASH';
      const paymentStatus = fullOrder.payment?.status
        ? fullOrder.payment.status.toUpperCase()
        : 'PENDING';
      const orderDate = new Date(fullOrder.createdAt).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });

      const itemsHtml = fullOrder.items
        .map(
          (item) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">
            <strong>${item.product.name}</strong>
            ${item.notes ? `<br><small style="color: #888;">Note: ${item.notes}</small>` : ''}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">ETB ${Number(item.unitPrice).toFixed(2)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">ETB ${(Number(item.unitPrice) * item.quantity).toFixed(2)}</td>
        </tr>
      `,
        )
        .join('');

      const html = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8f9fa; padding: 30px; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background-color: #c29570; padding: 20px 30px; color: #ffffff; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 600;">🔔 New Customer Order Received</h1>
              <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Order #${fullOrder.orderNumber}</p>
            </div>

            <div style="padding: 30px;">
              <div style="background: #faf6f0; border-left: 4px solid #c29570; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
                <h3 style="margin: 0 0 8px 0; color: #8a5a36; font-size: 16px;">Order Summary</h3>
                <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 4px 0; color: #666;">Branch:</td>
                    <td style="padding: 4px 0; font-weight: bold; text-align: right;">${fullOrder.branch?.name ?? 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #666;">Date & Time:</td>
                    <td style="padding: 4px 0; font-weight: bold; text-align: right;">${orderDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #666;">Order Type:</td>
                    <td style="padding: 4px 0; font-weight: bold; text-align: right;">${orderTypeFormatted}${fullOrder.tableNumber ? ` (Table #${fullOrder.tableNumber})` : ''}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #666;">Order Status:</td>
                    <td style="padding: 4px 0; font-weight: bold; text-align: right; color: #d97706;">${fullOrder.status.toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #666;">Payment Method:</td>
                    <td style="padding: 4px 0; font-weight: bold; text-align: right;">${paymentMethod}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #666;">Payment Status:</td>
                    <td style="padding: 4px 0; font-weight: bold; text-align: right; color: ${paymentStatus === 'COMPLETED' ? '#16a34a' : '#dc2626'};">${paymentStatus}</td>
                  </tr>
                </table>
              </div>

              <h4 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">Order Items</h4>
              <table style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                  <tr style="background-color: #f1f3f5; color: #495057; text-align: left;">
                    <th style="padding: 10px;">Item</th>
                    <th style="padding: 10px; text-align: center;">Qty</th>
                    <th style="padding: 10px; text-align: right;">Price</th>
                    <th style="padding: 10px; text-align: right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <div style="text-align: right; margin-top: 15px; border-top: 2px solid #eee; padding-top: 15px;">
                <span style="font-size: 16px; font-weight: 600; color: #333;">Total Amount: </span>
                <span style="font-size: 20px; font-weight: bold; color: #c29570;">ETB ${Number(fullOrder.totalAmount).toFixed(2)}</span>
              </div>

              ${
                fullOrder.notes
                  ? `
                <div style="margin-top: 20px; padding: 12px; background-color: #fff9db; border: 1px solid #fab005; border-radius: 4px; font-size: 14px;">
                  <strong>Special Instructions:</strong> ${fullOrder.notes}
                </div>
              `
                  : ''
              }
            </div>

            <div style="background-color: #f1f3f5; padding: 15px 30px; text-align: center; font-size: 12px; color: #6c757d;">
              Please process this order on your POS / Cashier terminal.
            </div>
          </div>
        </div>
      `;

      for (const cashier of cashiers) {
        await this.sendEmail({
          to: cashier.email,
          subject: `🔔 New Customer Order Received — Order #${fullOrder.orderNumber}`,
          html,
          logLabel: `New order notification sent to Cashier ${cashier.email}`,
          mockLog: `Mock Email -> New Order #${fullOrder.orderNumber} notification to ${cashier.email}`,
        }).catch((err) => {
          this.logger.error(`Failed to send order notification email to ${cashier.email}`, err);
        });
      }
    } catch (error) {
      this.logger.error(`Error processing order.created event for order ${order?.id}`, error);
    }
  }

  async sendVerificationEmail(to: string, token: string, name: string) {
    const verificationUrl = `${this.frontendUrl}/verify-email?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #c29570;">Welcome to Mr. Cafe, ${name}!</h2>
        <p>Thank you for creating an account. Please verify your email address to get started.</p>
        <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; margin: 20px 0; background-color: #c29570; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
        <p>Or copy and paste this link in your browser:</p>
        <p style="color: #666; font-size: 12px;">${verificationUrl}</p>
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `;

    await this.sendEmail({
      to,
      subject: 'Verify your Mr. Cafe Account',
      html,
      logLabel: `Verification email sent to ${to}`,
      mockLog: `Mock Email -> Verification URL for ${to}: ${verificationUrl}`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string, name: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #c29570;">Password Reset Request</h2>
        <p>Hi ${name},</p>
        <p>We received a request to reset your password. Click the button below to choose a new password.</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; margin: 20px 0; background-color: #c29570; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
        <p>Or copy and paste this link in your browser:</p>
        <p style="color: #666; font-size: 12px;">${resetUrl}</p>
        <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `;

    await this.sendEmail({
      to,
      subject: 'Reset your Mr. Cafe Password',
      html,
      logLabel: `Password reset email sent to ${to}`,
      mockLog: `Mock Email -> Reset URL for ${to}: ${resetUrl}`,
    });
  }

  private async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    logLabel: string;
    mockLog: string;
  }) {
    if (!this.resendClient.isEnabled()) {
      this.logger.log(options.mockLog);
      return;
    }

    try {
      const result = await this.resendClient.sendEmail({
        from: `Mr. Cafe <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: htmlToPlainText(options.html),
      });

      this.logger.log(`${options.logLabel} (id: ${result.id})`);
    } catch (error) {
      this.logSendFailure(options.to, error);
      throw new InternalServerErrorException(
        'Unable to send email right now. Please try again later.',
      );
    }
  }

  private logSendFailure(to: string, error: unknown) {
    const err = error as any;
    if (err && (err.message || err.name)) {
      this.logger.error(
        `Resend failed for ${to}: [${err.name ?? 'Error'}] ${err.message} (status: ${err.statusCode ?? 'N/A'})`,
      );
      return;
    }

    this.logger.error(`Resend failed for ${to}`, error);
  }
}
