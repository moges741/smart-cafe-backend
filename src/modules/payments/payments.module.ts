import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { ChapaService } from './chapa.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],   // needed to inject EventsService for real-time notifications
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    ChapaService,    // separate service — only knows about Chapa API
  ],
})
export class PaymentsModule {}