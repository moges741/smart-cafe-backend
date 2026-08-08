import { IsUUID, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializePaymentDto {
  @ApiProperty({
    example: 'uuid-of-the-order',
    description: 'The order ID to pay for',
  })
  @IsUUID()
  orderId: string;

  // Phone number is optional but if provided must be Ethiopian format
  // Chapa requires 09xxxxxxxx or 07xxxxxxxx — 10 digits
  @ApiPropertyOptional({
    example: '0912345678',
    description: 'Ethiopian phone number — required for Telebirr and CBE Birr',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(09|07)\d{8}$/, {
    message: 'Phone number must be in Ethiopian format: 09xxxxxxxx or 07xxxxxxxx',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({
    enum: ['cash', 'chapa'],
    example: 'chapa',
    description: 'Payment method selected by the user',
  })
  @IsOptional()
  @IsString()
  method?: 'cash' | 'chapa';
}