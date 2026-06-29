import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CashConfirmDto {
  @ApiProperty({
    example: 'uuid-of-the-order',
    description: 'The order ID the cashier is confirming cash payment for',
  })
  @IsUUID()
  orderId: string;
}