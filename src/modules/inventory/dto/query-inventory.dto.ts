import { IsOptional, IsUUID, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryInventoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  // If true, only return items at or below their reorder threshold
  @ApiPropertyOptional({ description: 'Filter to only show low stock items' })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  lowStockOnly?: boolean;
}
