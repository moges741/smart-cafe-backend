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
          <td class="item-cell" style="padding: 10px; border-bottom: 1px solid #eee;">
            <strong>${item.product.name}</strong>
            ${item.notes ? `<br><small style="color: #888;">Note: ${item.notes}</small>` : ''}
          </td>
          <td class="item-cell" style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td class="item-cell" style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">ETB ${Number(item.unitPrice).toFixed(2)}</td>
          <td class="item-cell" style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">ETB ${(Number(item.unitPrice) * item.quantity).toFixed(2)}</td>
        </tr>
      `,
        )
        .join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            @media only screen and (max-width: 600px) {
              .email-wrapper { padding: 10px !important; }
              .email-container { width: 100% !important; border-radius: 0 !important; }
              .header { padding: 15px !important; }
              .header h1 { font-size: 18px !important; }
              .content-area { padding: 15px !important; }
              .summary-box { padding: 12px !important; }
              .summary-table td { display: block !important; width: 100% !important; text-align: left !important; padding: 4px 0 !important; }
              .summary-table td.val { padding-bottom: 12px !important; font-weight: bold; }
              .items-table th, .items-table td.item-cell { padding: 8px 4px !important; font-size: 12px !important; }
              .total-section { font-size: 14px !important; }
              .total-amount { font-size: 18px !important; }
            }
          </style>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8f9fa; color: #333;">
          <div class="email-wrapper" style="background-color: #f8f9fa; padding: 30px 10px; width: 100%; box-sizing: border-box;">
            <div class="email-container" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              <div class="header" style="background-color: #c29570; padding: 20px 30px; color: #ffffff; text-align: center;">
                <h1 style="margin: 0; font-size: 22px; font-weight: 600;">🔔 New Customer Order Received</h1>
                <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Order #${fullOrder.orderNumber}</p>
              </div>

              <div class="content-area" style="padding: 30px;">
                <div class="summary-box" style="background: #faf6f0; border-left: 4px solid #c29570; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
                  <h3 style="margin: 0 0 8px 0; color: #8a5a36; font-size: 16px;">Order Summary</h3>
                  <table class="summary-table" style="width: 100%; font-size: 14px; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 4px 0; color: #666;">Branch:</td>
                      <td class="val" style="padding: 4px 0; font-weight: bold; text-align: right;">${fullOrder.branch?.name ?? 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #666;">Date & Time:</td>
                      <td class="val" style="padding: 4px 0; font-weight: bold; text-align: right;">${orderDate}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #666;">Order Type:</td>
                      <td class="val" style="padding: 4px 0; font-weight: bold; text-align: right;">${orderTypeFormatted}${fullOrder.tableNumber ? ` (Table #${fullOrder.tableNumber})` : ''}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #666;">Order Status:</td>
                      <td class="val" style="padding: 4px 0; font-weight: bold; text-align: right; color: #d97706;">${fullOrder.status.toUpperCase()}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #666;">Payment Method:</td>
                      <td class="val" style="padding: 4px 0; font-weight: bold; text-align: right;">${paymentMethod}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #666;">Payment Status:</td>
                      <td class="val" style="padding: 4px 0; font-weight: bold; text-align: right; color: ${paymentStatus === 'COMPLETED' ? '#16a34a' : '#dc2626'};">${paymentStatus}</td>
                    </tr>
                  </table>
                </div>

                <h4 style="margin: 0 0 10px 0; font-size: 16px; color: #333;">Order Items</h4>
                <table class="items-table" style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 20px;">
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

                <div class="total-section" style="text-align: right; margin-top: 15px; border-top: 2px solid #eee; padding-top: 15px;">
                  <span style="font-size: 16px; font-weight: 600; color: #333;">Total Amount: </span>
                  <span class="total-amount" style="font-size: 20px; font-weight: bold; color: #c29570;">ETB ${Number(fullOrder.totalAmount).toFixed(2)}</span>
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

              <div class="footer-area" style="background-color: #f1f3f5; padding: 15px 30px; text-align: center; font-size: 12px; color: #6c757d;">
                Please process this order on your POS / Cashier terminal.
              </div>
            </div>
          </div>
        </body>
        </html>
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

  async sendStaffWelcomeEmail(options: {
    to: string;
    role: string;
    branchName: string;
    email: string;
    password?: string;
  }) {
    const loginUrl = `${this.frontendUrl}/login`;
    const formattedRole = options.role.charAt(0).toUpperCase() + options.role.slice(1);

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 10px !important; }
            .email-container { width: 100% !important; border-radius: 0 !important; }
            .header { padding: 20px 15px !important; }
            .header h1 { font-size: 20px !important; }
            .content-area { padding: 20px 15px !important; }
            .cred-box { padding: 15px 10px !important; }
            .cred-table td { display: block !important; width: 100% !important; text-align: left !important; padding: 4px 0 !important; }
            .cred-table td.val { padding-bottom: 12px !important; }
            .btn { width: 100% !important; display: block !important; box-sizing: border-box !important; text-align: center !important; }
            .link-text { word-break: break-all !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8f9fa; color: #333;">
        <div class="email-wrapper" style="background-color: #f8f9fa; padding: 30px 10px; width: 100%; box-sizing: border-box;">
          <div class="email-container" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div class="header" style="background-color: #c29570; padding: 25px 30px; color: #ffffff; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Welcome to Mr. Cafe Team!</h1>
              <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Staff Account Credentials</p>
            </div>

            <div class="content-area" style="padding: 30px;">
              <p style="font-size: 16px; color: #333; margin-top: 0;">Hello,</p>
              <p style="font-size: 15px; color: #555; line-height: 1.6;">
                You have been assigned as a <strong>${formattedRole}</strong> at <strong>${options.branchName}</strong>. Below are your account details and credentials to log into the staff portal:
              </p>

              <div class="cred-box" style="background: #faf6f0; border-left: 4px solid #c29570; padding: 18px; margin: 25px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 12px 0; color: #8a5a36; font-size: 16px;">Your Access Credentials</h3>
                <table class="cred-table" style="width: 100%; font-size: 14px; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #666;">Assigned Role:</td>
                    <td class="val" style="padding: 6px 0; font-weight: bold; text-align: right; color: #c29570;">${formattedRole}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #666;">Assigned Branch:</td>
                    <td class="val" style="padding: 6px 0; font-weight: bold; text-align: right;">${options.branchName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #666;">Login Email:</td>
                    <td class="val" style="padding: 6px 0; font-weight: bold; text-align: right;">${options.email}</td>
                  </tr>
                  ${
                    options.password
                      ? `
                  <tr>
                    <td style="padding: 6px 0; color: #666;">Temporary Password:</td>
                    <td class="val" style="padding: 6px 0; font-weight: bold; font-family: monospace; font-size: 15px; text-align: right; color: #d97706;">${options.password}</td>
                  </tr>
                  `
                      : ''
                  }
                </table>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a class="btn" href="${loginUrl}" style="display: inline-block; padding: 12px 28px; background-color: #c29570; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 10px rgba(194, 149, 112, 0.3);">
                  Sign In to Staff Portal
                </a>
              </div>

              <p style="color: #666; font-size: 13px; margin-bottom: 0;">
                Or copy and paste this link in your browser:<br />
                <span class="link-text" style="color: #c29570; word-break: break-all;">${loginUrl}</span>
              </p>

              <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
              <p style="color: #999; font-size: 12px; margin: 0;">
                🔒 Security Notice: Please log in and change your password after your first sign-in.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.sendEmail({
      to: options.to,
      subject: `🎉 Welcome to Mr. Cafe — You are assigned as ${formattedRole} at ${options.branchName}`,
      html,
      logLabel: `Staff welcome email sent to ${options.to}`,
      mockLog: `Mock Email -> Staff welcome email for ${options.to}`,
    });
  }

  async sendVerificationEmail(to: string, token: string, name: string) {
    const verificationUrl = `${this.frontendUrl}/verify-email?token=${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 15px !important; }
            .title { font-size: 20px !important; }
            .btn { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
            .link-text { font-size: 12px !important; word-break: break-all !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; color: #333; background-color: #ffffff;">
        <div class="email-wrapper" style="padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 class="title" style="color: #c29570; margin-top: 0;">Welcome to Mr. Cafe, ${name}!</h2>
          <p style="line-height: 1.5;">Thank you for creating an account. Please verify your email address to get started.</p>
          <a class="btn" href="${verificationUrl}" style="display: inline-block; padding: 12px 20px; margin: 20px 0; background-color: #c29570; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
          <p style="line-height: 1.5;">Or copy and paste this link in your browser:</p>
          <p class="link-text" style="color: #666; font-size: 13px; word-break: break-all;">${verificationUrl}</p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px; line-height: 1.5;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      </body>
      </html>
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
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @media only screen and (max-width: 600px) {
            .email-wrapper { padding: 15px !important; }
            .title { font-size: 20px !important; }
            .btn { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
            .link-text { font-size: 12px !important; word-break: break-all !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; color: #333; background-color: #ffffff;">
        <div class="email-wrapper" style="padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 class="title" style="color: #c29570; margin-top: 0;">Password Reset Request</h2>
          <p style="line-height: 1.5;">Hi ${name},</p>
          <p style="line-height: 1.5;">We received a request to reset your password. Click the button below to choose a new password.</p>
          <a class="btn" href="${resetUrl}" style="display: inline-block; padding: 12px 20px; margin: 20px 0; background-color: #c29570; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
          <p style="line-height: 1.5;">Or copy and paste this link in your browser:</p>
          <p class="link-text" style="color: #666; font-size: 13px; word-break: break-all;">${resetUrl}</p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px; line-height: 1.5;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      </body>
      </html>
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