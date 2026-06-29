import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class ChapaService {
  // Logger is NestJS's built-in logging utility
  // It prefixes log lines with the class name so you know where they came from
  private readonly logger = new Logger(ChapaService.name);

  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    // Read from .env via ConfigService
    // The ! tells TypeScript "I know this won't be undefined"
    this.baseUrl       = this.configService.get<string>('CHAPA_BASE_URL')!;
    this.secretKey     = this.configService.get<string>('CHAPA_SECRET_KEY')!;
    this.webhookSecret = this.configService.get<string>('CHAPA_WEBHOOK_SECRET')!;
  }

  // ─── Initialize ─────────────────────────────────────────────────────────────
  // Sends order details to Chapa and gets back a checkout URL
  // The customer is redirected to that URL to pick their payment method
  async initializeTransaction(params: {
    amount:       number;
    email:        string;
    firstName:    string;
    lastName:     string;
    txRef:        string;   // YOUR unique reference for this payment
    phoneNumber?: string;
    callbackUrl:  string;   // Chapa POSTs here when payment completes
    returnUrl:    string;   // browser redirects here after Chapa page
    title:        string;
    description:  string;
  }) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        {
          amount:       String(params.amount), // Chapa expects amount as a string
          currency:     'ETB',
          email:        params.email,
          first_name:   params.firstName,
          last_name:    params.lastName,
          tx_ref:       params.txRef,
          phone_number: params.phoneNumber,
          callback_url: params.callbackUrl,
          return_url:   params.returnUrl,
          customization: {
            title:       params.title,
            description: params.description,
          },
        },
        {
          headers: {
            // Chapa requires your secret key as a Bearer token
            Authorization:  `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // response.data.data.checkout_url is what we need
      return response.data;

    } catch (error: any) {
      // Log the full Chapa error response for debugging
      this.logger.error('Chapa initialize failed:', error?.response?.data);
      throw new BadRequestException(
        error?.response?.data?.message ?? 'Payment initialization failed'
      );
    }
  }

  // ─── Verify ─────────────────────────────────────────────────────────────────
  // After Chapa fires the webhook, you call THIS to double-check the payment
  // NEVER trust the webhook payload alone — always verify server-to-server
  // Reason: someone could POST a fake webhook to your endpoint
  async verifyTransaction(txRef: string) {
    try {
      const response = await axios.get(
        // txRef goes in the URL path
        `${this.baseUrl}/transaction/verify/${txRef}`,
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
        },
      );
      return response.data;

    } catch (error: any) {
      this.logger.error('Chapa verify failed:', error?.response?.data);
      throw new BadRequestException('Payment verification failed');
    }
  }

  // ─── Webhook signature verification ─────────────────────────────────────────
  // Chapa signs the webhook payload using HMAC SHA256 with your webhook secret
  // You recalculate the same hash and compare — if they match, it's genuine
  //
  // Why? Because your webhook endpoint is public (no auth).
  // Anyone on the internet could POST a fake "payment success" to it.
  // The signature proves the request actually came from Chapa.
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!signature) return false;

    // Recreate the hash Chapa would have generated
    const expectedHash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Compare using timingSafeEqual to prevent timing attacks
    // (a timing attack is where an attacker guesses the secret byte by byte
    //  by measuring how long the comparison takes)
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedHash),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  }
}