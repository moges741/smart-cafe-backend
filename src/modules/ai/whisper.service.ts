import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { toFile } from 'groq-sdk';

@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly groq: Groq;

  constructor(private readonly config: ConfigService) {
    this.groq = new Groq({
      apiKey: this.config.get<string>('GROQ_API_KEY'),
    });
  }

  /**
   * Transcribe audio buffer using Groq Whisper.
   * Groq supports: flac, mp3, mp4, mpeg, mpga, m4a, ogg, opus, wav, webm
   *
   * @param buffer   - Raw audio bytes from the uploaded file
   * @param mimeType - MIME type e.g. 'audio/webm', 'audio/wav'
   * @param language - Optional hint ('en', 'am', 'om') — Whisper auto-detects if omitted
   * @returns Transcribed text string
   */
  async transcribe(
    buffer: Buffer,
    mimeType: string = 'audio/webm',
    language?: string,
  ): Promise<string> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Audio buffer is empty');
    }

    // Map MIME type to a filename extension that Groq accepts
    const ext = this.mimeToExt(mimeType);

    try {
      // Groq SDK expects a File-like object — use the `toFile` helper
      const audioFile = await toFile(buffer, `recording.${ext}`, {
        type: mimeType,
      });

      const transcription = await this.groq.audio.transcriptions.create({
        file:     audioFile,
        model:    'whisper-large-v3-turbo',   // fastest + accurate Groq Whisper model
        language: language ?? undefined,       // omit = auto-detect
        response_format: 'json',
      });

      const text = transcription.text?.trim() ?? '';
      this.logger.log(`Whisper transcribed: "${text.slice(0, 80)}..."`);
      return text;

    } catch (error: any) {
      this.logger.error('Whisper transcription failed:', error?.message ?? error);
      throw new BadRequestException(
        `Speech-to-text failed: ${error?.message ?? 'Unknown error'}`,
      );
    }
  }

  /** Map common MIME types to file extensions Groq Whisper accepts */
  private mimeToExt(mimeType: string): string {
    const map: Record<string, string> = {
      'audio/webm':         'webm',
      'audio/webm;codecs=opus': 'webm',
      'audio/ogg':          'ogg',
      'audio/ogg;codecs=opus': 'ogg',
      'audio/wav':          'wav',
      'audio/wave':         'wav',
      'audio/x-wav':        'wav',
      'audio/mp4':          'm4a',
      'audio/mp3':          'mp3',
      'audio/mpeg':         'mp3',
      'audio/flac':         'flac',
    };
    return map[mimeType.toLowerCase()] ?? 'webm';
  }
}
