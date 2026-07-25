import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { EmailService } from './email.service';
import { ResendClient } from './resend.client';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    // Register JwtModule without a secret here —
    // each signAsync/verifyAsync call passes its own secret
    // so we can use different secrets for access vs refresh tokens
    JwtModule.register({}),
  ],
  providers: [AuthService, JwtStrategy, ResendClient, EmailService],
  controllers: [AuthController],
})
export class AuthModule {}