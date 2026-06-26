import { IsString, IsOptional, IsUUID, IsBoolean, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty({ example: 'Macchiato' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Ethiopian style espresso with steamed milk' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 45.00 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: 'uuid-of-category' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 'uuid-of-branch' })
  @IsUUID()
  branchId: string;
}