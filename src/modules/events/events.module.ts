import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

@Module({
  providers: [EventsGateway, EventsService],
  // Export EventsService so OrdersModule can inject it
  exports: [EventsService],
})
export class EventsModule {}