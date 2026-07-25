import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';
import { randomUUID } from 'node:crypto';

export interface ResendSendPayload {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

interface ResendSendResponse {
  id: string;
}

@Injectable()
export class ResendClient {
  private readonly logger = new Logger(ResendClient.name);
  private readonly apiKey: string | null;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY') || null;
    this.enabled = Boolean(this.apiKey);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async sendEmail(payload: ResendSendPayload): Promise<ResendSendResponse> {
    if (!this.apiKey) {
      throw new Error('Resend is not configured');
    }

    const payloadData = JSON.stringify({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    });

    const idempotencyKey = randomUUID();

    return new Promise((resolve, reject) => {
      const req = https.request(
        'https://api.resend.com/emails',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadData),
            'Idempotency-Key': idempotencyKey,
          },
          family: 4, // Force IPv4 to avoid IPv6 resolution timeouts
          timeout: 30000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            let parsedData;
            try {
              parsedData = JSON.parse(body);
            } catch {
              parsedData = {};
            }

            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              if (parsedData.id) {
                resolve({ id: parsedData.id });
              } else {
                reject({
                  name: 'application_error',
                  message: 'Resend API returned success but no email ID was generated',
                  statusCode: res.statusCode,
                });
              }
            } else {
              reject({
                name: parsedData.name || 'api_error',
                message: parsedData.message || `Resend API returned status code ${res.statusCode}`,
                statusCode: res.statusCode || null,
              });
            }
          });
        }
      );

      req.on('error', (err) => {
        this.logger.error(`Resend network/DNS connection failed: ${err.message}`);
        reject({
          name: 'network_error',
          message: `Unable to connect to Resend API: ${err.message}`,
          statusCode: null,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          name: 'timeout_error',
          message: 'Connection to Resend API timed out',
          statusCode: null,
        });
      });

      req.write(payloadData);
      req.end();
    });
  }
}

// Keep classes/functions exported for compatibility
export class ResendApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly nameKey?: string,
  ) {
    super(message);
    this.name = 'ResendApiError';
  }
}

export function isAxiosError(error: unknown): boolean {
  return false;
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>[^<]*<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
