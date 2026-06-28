import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBranchDto {
  @ApiProperty({ example: 'Bole Branch' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Bole Road, Addis Ababa' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Africa/Addis_Ababa' })
  @IsOptional()
  @IsString()
  timezone?: string;
}