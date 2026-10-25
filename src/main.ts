import './dns-setup';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser = require('cookie-parser');
import { join } from 'node:path';
import * as express from 'express';

function buildAllowedOrigins(): string[] {
  const devOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://come-mrcafe.vercel.app',
  ]

  const configuredOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL_2,
    process.env.ALLOWED_ORIGINS,
  ]
    .flatMap((value) => (value ? value.split(',') : []))
    .map((origin) => origin.trim())
    .filter(Boolean)

  return [...new Set([...devOrigins, ...configuredOrigins])]
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // needed for webhook signature verification
  });

  // Global prefix — all routes start with /api/v1
  app.setGlobalPrefix('api/v1');
  // Swagger — auto-generated API docs at /api/docs
  const config = new DocumentBuilder()
    .setTitle('AI-Powered Smart Cafe API')
    .setDescription('Backend API for the Smart Cafe Management Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  app.use(cookieParser());
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
    const allowedOrigins = buildAllowedOrigins();
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          allowedOrigins.includes(origin) ||
          origin.endsWith('.vercel.app') ||
          origin.includes('localhost') ||
          origin.includes('127.0.0.1')
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With', 'x-refresh-token'],
    })
    app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  const port = process.env.PORT || 4000
  await app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`)
    console.log(`📊 Database: ${process.env.NODE_ENV} - Neon PostgreSQL`)
  })
}

bootstrap();