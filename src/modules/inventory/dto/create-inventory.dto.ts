import { IsUUID, IsInt, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateInventoryDto {
  @ApiProperty({ example: 'uuid-of-product' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 'uuid-of-branch' })
  @IsUUID()
  branchId: string;

  @ApiProperty({ example: 100, description: 'Opening stock quantity' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  openingQuantity: number;

  @ApiPropertyOptional({ example: 10, description: 'Alert fires when stock reaches this' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderThreshold?: number;

  @ApiPropertyOptional({ example: 'kg', description: 'Unit of measurement' })
  @IsOptional()
  @IsString()
  unit?: string;
}