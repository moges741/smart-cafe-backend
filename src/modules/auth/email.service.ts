import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private readonly logger = new Logger(EmailService.name);
  private fromEmail: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is not defined. Emails will be mocked.');
    }
    this.resend = new Resend(apiKey || 'mock-api-key');
    this.fromEmail = 'onboarding@resend.dev'; // Resend testing domain
  }

  async sendVerificationEmail(to: string, token: string, name: string) {
    const verificationUrl = `http://localhost:5173/verify-email?token=${token}`;
    
    try {
      if (this.configService.get<string>('RESEND_API_KEY')) {
        await this.resend.emails.send({
          from: `Mr. Cafe <${this.fromEmail}>`,
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
        });
        this.logger.log(`Verification email sent to ${to}`);
      } else {
        this.logger.log(`Mock Email -> Verification URL for ${to}: ${verificationUrl}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error);
    }
  }

  async sendPasswordResetEmail(to: string, token: string, name: string) {
    const resetUrl = `http://localhost:5173/reset-password?token=${token}`;
    
    try {
      if (this.configService.get<string>('RESEND_API_KEY')) {
        await this.resend.emails.send({
          from: `Mr. Cafe <${this.fromEmail}>`,
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
        });
        this.logger.log(`Password reset email sent to ${to}`);
      } else {
        this.logger.log(`Mock Email -> Reset URL for ${to}: ${resetUrl}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}`, error);
    }
  }
}
