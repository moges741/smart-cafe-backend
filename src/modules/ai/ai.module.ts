import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GroqService } from './groq.service';
import { RedisSessionService } from './redis-session.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [AiController],
  providers: [
    AiService,
    GroqService,
    RedisSessionService,
  ],
})

export class AiModule {}