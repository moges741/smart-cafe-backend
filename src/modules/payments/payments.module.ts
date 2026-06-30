import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { ChapaService } from './chapa.service';
import { EventsModule } from '../events/events.module';
import { InventoryModule } from '../inventory/inventory.module';
@Module({
  imports: [EventsModule, InventoryModule],   
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    ChapaService,    // separate service — only knows about Chapa API
  ],
})
export class PaymentsModule {}