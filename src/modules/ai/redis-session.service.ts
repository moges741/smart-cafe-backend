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
  private client: Redis | null = null;
  private useRedis = false;

  // In-memory fallback when Redis is not available
  private memoryStore = new Map<string, { data: string; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const redisHost = this.config.get<string>('REDIS_HOST');
    const redisUrl = this.config.get<string>('REDIS_URL');

    // Only attempt Redis connection if explicitly configured
    if (!redisHost && !redisUrl) {
      this.logger.warn('No REDIS_HOST or REDIS_URL configured — using in-memory session store (AI chat sessions will not persist across restarts)');
      return;
    }

    try {
      if (redisUrl) {
        this.client = new Redis(redisUrl, { maxRetriesPerRequest: 3, retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 3000)) });
      } else {
        this.client = new Redis({
          host: redisHost,
          port: this.config.get<number>('REDIS_PORT', 6379),
          password: this.config.get<string>('REDIS_PASSWORD', undefined),
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 3000)),
        });
      }

      this.client.on('connect', () => {
        this.useRedis = true;
        this.logger.log('Redis session client connected');
      });
      this.client.on('error', (err) => {
        this.logger.error('Redis session client error — falling back to in-memory store');
        this.useRedis = false;
      });
    } catch {
      this.logger.warn('Failed to initialize Redis client — using in-memory session store');
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }

  // Build the Redis key from sessionId
  private key(sessionId: string): string {
    return `ai_session:${sessionId}`;
  }

  async save(session: ConversationSession): Promise<void> {
    const k = this.key(session.sessionId);
    const json = JSON.stringify(session);

    if (this.useRedis && this.client) {
      const exists = await this.client.exists(k);
      if (exists) {
        await this.client.set(k, json, 'KEEPTTL');
      } else {
        await this.client.set(k, json, 'EX', SESSION_TTL_SECONDS);
      }
    } else {
      // In-memory fallback
      const existing = this.memoryStore.get(k);
      const expiresAt = existing ? existing.expiresAt : Date.now() + SESSION_TTL_SECONDS * 1000;
      this.memoryStore.set(k, { data: json, expiresAt });
    }
  }

  async get(sessionId: string): Promise<ConversationSession | null> {
    const k = this.key(sessionId);

    if (this.useRedis && this.client) {
      const raw = await this.client.get(k);
      if (!raw) return null;
      return JSON.parse(raw) as ConversationSession;
    } else {
      const entry = this.memoryStore.get(k);
      if (!entry || Date.now() > entry.expiresAt) {
        this.memoryStore.delete(k);
        return null;
      }
      return JSON.parse(entry.data) as ConversationSession;
    }
  }

  async delete(sessionId: string): Promise<void> {
    const k = this.key(sessionId);
    if (this.useRedis && this.client) {
      await this.client.del(k);
    } else {
      this.memoryStore.delete(k);
    }
  }

  async getTtl(sessionId: string): Promise<number> {
    const k = this.key(sessionId);
    if (this.useRedis && this.client) {
      return this.client.ttl(k);
    } else {
      const entry = this.memoryStore.get(k);
      if (!entry) return -2;
      return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
    }
  }
}