import {
  Controller, Post, Get, Body,
  Param, UseGuards, Request,
  UseInterceptors, UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { WhisperService } from './whisper.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { OptionalJwtGuard } from '../../common/guards/optional-jwt.guard';
import { memoryStorage } from 'multer';

// Note: AI endpoints do NOT use JwtAuthGuard globally
// They work for both guests and logged-in users
@ApiTags('AI Ordering')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly whisper: WhisperService,
  ) {}

  // ─── Text chat endpoints ────────────────────────────────────────────────────

  @Post('conversation/start')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({
    summary: 'Start an AI ordering conversation',
    description: 'Works for both guests and logged-in customers. Returns a sessionId.',
  })
  async startConversation(
    @Body() dto: StartConversationDto,
    @Request() req: any,
  ) {
    const currentUser = req.user ?? null;
    return this.aiService.startConversation(dto, currentUser);
  }

  @Post('conversation/message')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({
    summary: 'Send a text message in an AI conversation',
    description: 'Send customer text, get AI response.',
  })
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Request() req: any,
  ) {
    const currentUser = req.user ?? null;
    return this.aiService.sendMessage(dto, currentUser);
  }

  @Get('conversation/:sessionId')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Get current session status and items' })
  getSession(@Param('sessionId') sessionId: string) {
    return this.aiService.getSession(sessionId);
  }

  // ─── Voice endpoint: Audio → Whisper STT → Groq LLM → JSON reply ──────────
  //
  //  POST /api/v1/ai/conversation/voice
  //  Content-Type: multipart/form-data
  //  Fields:
  //    audio     — audio file blob (webm/wav/ogg etc.)
  //    sessionId — existing session UUID
  //    mimeType  — optional, e.g. 'audio/webm' (defaults to audio/webm)
  //    language  — optional hint 'en' | 'am' | 'om'
  //
  //  Response: same shape as /conversation/message PLUS `transcript` field
  @Post('conversation/voice')
  @UseGuards(OptionalJwtGuard)
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),               // keep file in memory as Buffer
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Send voice message — STT → LLM → JSON',
    description:
      'Upload audio blob. Whisper transcribes it, Groq processes it, ' +
      'returns JSON reply with `transcript`. Frontend handles TTS.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio', 'sessionId'],
      properties: {
        audio:     { type: 'string', format: 'binary' },
        sessionId: { type: 'string', format: 'uuid' },
        mimeType:  { type: 'string', example: 'audio/webm' },
        language:  { type: 'string', example: 'en' },
        guestName: { type: 'string' },
        guestPhone:{ type: 'string' },
      },
    },
  })
  async voiceMessage(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No audio file uploaded. Send as multipart/form-data field "audio".');
    }

    const body        = req.body ?? {};
    const sessionId   = body.sessionId as string;
    const mimeType    = body.mimeType  as string | undefined;
    const language    = body.language  as string | undefined;
    const guestName   = body.guestName as string | undefined;
    const guestPhone  = body.guestPhone as string | undefined;

    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    // 1️⃣  STT — audio buffer → text via Groq Whisper
    const transcript = await this.whisper.transcribe(
      file.buffer,
      mimeType ?? file.mimetype ?? 'audio/webm',
      language,
    );

    if (!transcript) {
      throw new BadRequestException(
        'Could not transcribe audio. Please speak clearly and try again.',
      );
    }

    // 2️⃣  LLM — reuse existing sendMessage pipeline with transcript as text
    const currentUser = req.user ?? null;
    const msgDto: SendMessageDto = {
      sessionId,
      message:    transcript,
      guestName,
      guestPhone,
    };

    const llmResult = await this.aiService.sendMessage(msgDto, currentUser);

    // 3️⃣  Return LLM response + original transcript so frontend can show it
    return {
      ...llmResult,
      transcript,   // what Whisper heard — displayed in the chat bubble
    };
  }
}