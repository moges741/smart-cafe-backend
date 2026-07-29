import { IsString, IsOptional, IsNumber, Min, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateRawMaterialDto {
  @ApiProperty({ example: 'Coffee Beans' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Coffee' })
  @IsString()
  category: string;

  @ApiPropertyOptional({ example: 'COF-001' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: 'kg', description: 'Measurement unit: kg, g, L, ml, pcs, etc.' })
  @IsString()
  unit: string;

  @ApiPropertyOptional({ example: 5.0, description: 'Minimum stock level before alerts' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStockLevel?: number;

  @ApiPropertyOptional({ example: 'Premium Arabica beans' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'uuid-of-branch', description: 'Branch this material belongs to' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
