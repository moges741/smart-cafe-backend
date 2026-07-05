import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartConversationDto {
  @ApiProperty({
    example: 'uuid-of-branch',
    description: 'Which branch the customer is ordering from',
  })
  @IsUUID()
  branchId: string;

  // Optional — if the customer is logged in, frontend sends their name
  // If guest, they can provide a name or leave blank
  @ApiPropertyOptional({ example: 'Dawit' })
  @IsOptional()
  @IsString()
  customerName?: string;
}