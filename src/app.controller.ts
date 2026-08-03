import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { EmailService } from './modules/auth/email.service';
import { ContactDto } from './common/dto/contact.dto';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly emailService: EmailService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'Server is running',
    };
  }

  @Post('contact')
  async handleContactForm(@Body() dto: ContactDto) {
    await this.emailService.sendContactEmail(dto.name, dto.email, dto.subject, dto.message);
    return {
      status: 'success',
      message: 'Message sent successfully',
    };
  }
}
