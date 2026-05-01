import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable validation globally — rejects requests with invalid body fields
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS for frontend or other services calling your REST endpoints
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Inventory & Catalog Service running on port ${port}`);
}

bootstrap();
