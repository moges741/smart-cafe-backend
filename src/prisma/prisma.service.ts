import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)
  private readonly pool: Pool

  constructor() {
    const connectionString = (process.env.DATABASE_URL || '').trim()

    const pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    })

    pool.on('error', (err) => {
      // Prevent background idle pool disconnects from crashing or throwing uncaught exceptions
      this.logger.warn(`Neon PostgreSQL Pool warning: ${err.message}`)
    })

    const adapter = new PrismaPg(pool)
    super({ adapter })
    this.pool = pool
  }

  async onModuleInit() {
    try {
      await this.$connect()
      this.logger.log('✓ Connected to Neon PostgreSQL')
    } catch (error) {
      this.logger.error('✗ Failed to connect to database:', error)
      process.exit(1)
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
    await this.pool.end()
  }
}