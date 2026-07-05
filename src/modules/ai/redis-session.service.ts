import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// What a conversation session looks like in Redis
export interface ConversationSession {
  sessionId:      string;
  branchId:       string;
  customerId:     string | null;   // null for guests
  customerName:   string | null;
  language:       string | null;   // detected after first message
  createdAt:      string;
  messages: Array<{
    role:    'user' | 'assistant';
    content: string;
  }>;
  extractedItems: Array<{
    productId:   string;
    productName: string;
    quantity:    number;
    unitPrice:   number;
    notes:       string | null;
  }>;
  orderPlaced: boolean;
}

// Session lives for exactly 30 minutes from creation — fixed, not rolling
const SESSION_TTL_SECONDS = 30 * 60; // 1800 seconds

@Injectable()
export class RedisSessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisSessionService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    // Create Redis connection when module starts
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    });

    this.client.on('connect', () =>
      this.logger.log('Redis session client connected')
    );
    this.client.on('error', (err) =>
      this.logger.error('Redis session client error', err)
    );
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  // Build the Redis key from sessionId
  // All session keys are prefixed so they're easy to identify in Redis
  private key(sessionId: string): string {
    return `ai_session:${sessionId}`;
  }

  // Save a session — KEEPTTL means "don't change the TTL if key exists"
  // We use SET with EX only on creation, then KEEPTTL on updates
  // This enforces the fixed 30-minute window — updates don't extend it
  async save(session: ConversationSession): Promise<void> {
    const k = this.key(session.sessionId);

    // Check if key already exists
    const exists = await this.client.exists(k);

    if (exists) {
      // Update without changing TTL — fixed expiry stays intact
      await this.client.set(k, JSON.stringify(session), 'KEEPTTL');
    } else {
      // First save — set with 30 minute TTL
      await this.client.set(k, JSON.stringify(session), 'EX', SESSION_TTL_SECONDS);
    }
  }

  async get(sessionId: string): Promise<ConversationSession | null> {
    const raw = await this.client.get(this.key(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as ConversationSession;
  }

  async delete(sessionId: string): Promise<void> {
    await this.client.del(this.key(sessionId));
  }

  // How many seconds remain before session expires
  async getTtl(sessionId: string): Promise<number> {
    return this.client.ttl(this.key(sessionId));
  }
}