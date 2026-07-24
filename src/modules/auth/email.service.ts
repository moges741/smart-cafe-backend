import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly frontendUrl: string;
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'noreply@mail.dev-moges.me';
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    this.isConfigured = Boolean(apiKey && this.fromEmail);

    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not defined. Emails will be mocked.');
    } else if (!this.configService.get<string>('RESEND_FROM_EMAIL')) {
      this.logger.warn(
        'RESEND_FROM_EMAIL is not set. Using default noreply@mail.dev-moges.me',
      );
    }

    this.resend = new Resend(apiKey || 'mock-api-key');
  }

  async sendVerificationEmail(to: string, token: string, name: string) {
    const verificationUrl = `${this.frontendUrl}/verify-email?token=${token}`;

    await this.sendEmail({
      to,
      subject: 'Verify your Mr. Cafe Account',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #c29570;">Welcome to Mr. Cafe, ${name}!</h2>
          <p>Thank you for creating an account. Please verify your email address to get started.</p>
          <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; margin: 20px 0; background-color: #c29570; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
          <p>Or copy and paste this link in your browser:</p>
          <p style="color: #666; font-size: 12px;">${verificationUrl}</p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
      logLabel: `Verification email sent to ${to}`,
      mockLog: `Mock Email -> Verification URL for ${to}: ${verificationUrl}`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string, name: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    await this.sendEmail({
      to,
      subject: 'Reset your Mr. Cafe Password',
      html: `
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
      `,
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
    if (!this.isConfigured) {
      this.logger.log(options.mockLog);
      return;
    }

    const { data, error } = await this.resend.emails.send({
      from: `Mr. Cafe <${this.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      this.logger.error(
        `Resend failed for ${options.to}: ${error.message}`,
        error,
      );
      throw new InternalServerErrorException(
        'Unable to send email right now. Please try again later.',
      );
    }

    this.logger.log(`${options.logLabel} (id: ${data?.id})`);
  }
}
