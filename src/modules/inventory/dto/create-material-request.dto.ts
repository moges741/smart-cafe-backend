import { IsUUID, IsNumber, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class MaterialRequestItemDto {
  @ApiProperty({ example: 'uuid-of-material' })
  @IsUUID()
  materialId: string;

  @ApiProperty({ example: 10.5, description: 'Quantity requested' })
  @Type(() => Number)
  @IsNumber()
  requestedQuantity: number;
}

export class CreateMaterialRequestDto {
  @ApiProperty({ example: 'uuid-of-branch' })
  @IsUUID()
  branchId: string;

  @ApiProperty({ type: [MaterialRequestItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialRequestItemDto)
  items: MaterialRequestItemDto[];

  @ApiPropertyOptional({ example: 'Required for morning rush' })
  @IsOptional()
  @IsString()
  notes?: string;
}
