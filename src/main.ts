import './dns-setup';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser = require('cookie-parser');
import { join } from 'node:path';
import * as express from 'express';

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
  // app.enableCors({
  //   origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  //   credentials: true,
  // });
    app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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