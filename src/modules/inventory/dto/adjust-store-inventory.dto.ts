import { IsNumber, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AdjustStoreInventoryDto {
  @ApiProperty({ example: 10.0, description: 'Quantity change (positive to add, negative to subtract)' })
  @Type(() => Number)
  @IsNumber()
  delta: number;

  @ApiProperty({ example: 'purchase', enum: ['purchase', 'transfer', 'consumption', 'adjustment', 'damaged', 'expired'] })
  @IsEnum(['purchase', 'transfer', 'consumption', 'adjustment', 'damaged', 'expired'])
  reason: string;

  @ApiPropertyOptional({ example: 'Delivery from supplier' })
  @IsOptional()
  @IsString()
  note?: string;
}
