import { IsString, IsUUID, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    description: 'Session ID returned from /ai/conversation/start',
  })
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    example: 'I want two macchiatos without sugar',
    description: 'The customer message — English, Amharic, or Afaan Oromo',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message: string;

  // For guest checkout — collected when they confirm the order
  @ApiPropertyOptional({ example: 'Dawit Bekele' })
  @IsOptional()
  @IsString()
  guestName?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  guestPhone?: string;
}