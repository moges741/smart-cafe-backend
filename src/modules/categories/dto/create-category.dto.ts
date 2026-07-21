import { IsString, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Hot Drinks' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Espresso, Cappuccino, Macchiato' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiProperty({ example: 'uuid-of-branch' })
  @IsString()
  branchId: string;
}