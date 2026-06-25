import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix — all routes start with /api/v1
  app.setGlobalPrefix('api/v1');

  // Global validation — any DTO decorated with class-validator decorators
  // will be automatically validated on every request
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strips any properties not in the DTO
      forbidNonWhitelisted: true, // throws error if unknown properties sent
      transform: true,       // transforms plain JSON into typed class instances
    }),
  );

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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Smart Cafe API running on http://localhost:${port}/api/v1`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true, // this tells the browser to include cookies in cross-origin requests
});
}

bootstrap();