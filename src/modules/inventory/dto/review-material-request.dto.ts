import { IsEnum, IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ApprovedRequestItemDto {
  @ApiProperty({ example: 'uuid-of-material' })
  @IsUUID()
  materialId: string;

  @ApiProperty({ example: 10.0, description: 'Quantity approved' })
  @Type(() => Number)
  @IsNumber()
  approvedQuantity: number;
}

export class ReviewMaterialRequestDto {
  @ApiProperty({ example: 'approved', enum: ['approved', 'partially_approved', 'rejected'] })
  @IsEnum(['approved', 'partially_approved', 'rejected'])
  status: 'approved' | 'partially_approved' | 'rejected';

  @ApiPropertyOptional({ type: [ApprovedRequestItemDto], description: 'Optional: specify custom approved quantities' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovedRequestItemDto)
  items?: ApprovedRequestItemDto[];

  @ApiPropertyOptional({ example: 'Approved, but restricted milk quantity due to low central stock' })
  @IsOptional()
  @IsString()
  notes?: string;
}
