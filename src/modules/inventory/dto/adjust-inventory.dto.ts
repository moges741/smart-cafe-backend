import {
  IsUUID, IsInt, IsString, IsOptional,
  IsEnum, IsNotEmpty
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// These match exactly the InventoryReason enum in Prisma
// But only manual reasons — order_deduction is system-only
export enum ManualAdjustmentReason {
  MANUAL_ADDITION  = 'manual_addition',
  MANUAL_REMOVAL   = 'manual_removal',
  COUNT_CORRECTION = 'count_correction',
}

export class AdjustInventoryDto {
  @ApiProperty({
    example: 50,
    description: 'Positive to add stock, negative to remove. e.g. -5 means remove 5 units'
  })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  delta: number;  // +50 means "50 units arrived", -10 means "10 units wasted"

  @ApiProperty({ enum: ManualAdjustmentReason })
  @IsEnum(ManualAdjustmentReason)
  reason: ManualAdjustmentReason;

  @ApiPropertyOptional({ example: 'Morning delivery from supplier' })
  @IsOptional()
  @IsString()
  note?: string;
}