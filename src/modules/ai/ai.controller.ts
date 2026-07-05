import {
  Controller, Post, Get, Body,
  Param, UseGuards, Request, Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// Note: AI endpoints do NOT use JwtAuthGuard globally
// They work for both guests and logged-in users
// The OptionalJwtGuard below handles both cases
@ApiTags('AI Ordering')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // Public endpoint — works for guests and logged-in users
  // If logged in, the cookie provides user context automatically
  // If guest, currentUser will be null
  @Post('conversation/start')
  @ApiOperation({
    summary: 'Start an AI ordering conversation',
    description: 'Works for both guests and logged-in customers. Returns a sessionId.',
  })
  async startConversation(
    @Body() dto: StartConversationDto,
    @Request() req: any,
  ) {
    // Try to get user from cookie if logged in — null if guest
    const currentUser = req.user ?? null;
    return this.aiService.startConversation(dto, currentUser);
  }

  @Post('conversation/message')
  @ApiOperation({
    summary: 'Send a message in an AI conversation',
    description: 'Send customer message, get AI response. Call repeatedly for full conversation.',
  })
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Request() req: any,
  ) {
    const currentUser = req.user ?? null;
    return this.aiService.sendMessage(dto, currentUser);
  }

  @Get('conversation/:sessionId')
  @ApiOperation({
    summary: 'Get current session status and items',
  })
  getSession(@Param('sessionId') sessionId: string) {
    return this.aiService.getSession(sessionId);
  }
}