import { IsEmail, IsString, MinLength, IsEnum, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StaffRole {
  MANAGER  = 'manager',
  CASHIER  = 'cashier',
  WAITER   = 'waiter',
  BARISTA  = 'barista',
  KITCHEN  = 'kitchen',
}

// Admin-only endpoint — creates a staff member with a specific role
export class CreateStaffDto {
  @ApiProperty({ example: 'cashier@smartcafe.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: StaffRole, example: StaffRole.CASHIER })
  @IsEnum(StaffRole)
  role: StaffRole;

  @ApiPropertyOptional({ example: 'uuid-of-branch' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}