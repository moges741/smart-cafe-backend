import { IsUUID, IsEnum, IsOptional, IsInt, IsString, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty({ example: 'uuid-of-product' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 'No sugar please' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'uuid-of-branch' })
  @IsUUID()
  branchId: string;

  @ApiPropertyOptional({ enum: ['dine_in', 'takeaway'] })
  @IsOptional()
  @IsEnum(['dine_in', 'takeaway'])
  type?: 'dine_in' | 'takeaway';

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  tableNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })  // validates each item in the array
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}