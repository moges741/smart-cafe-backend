import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['confirmed', 'in_kitchen', 'ready', 'completed', 'cancelled'] })
  @IsEnum(['confirmed', 'in_kitchen', 'ready', 'completed', 'cancelled'])
  status: 'confirmed' | 'in_kitchen' | 'ready' | 'completed' | 'cancelled';
}