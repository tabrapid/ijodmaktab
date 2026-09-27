import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { AppConfig } from './config/app-config.js';

// Mahalliy ishlab chiqishda .env fayli o‘qiladi; serverda muhit o‘zgaruvchilari to‘g‘ridan-to‘g‘ri beriladi.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  const config = app.get(AppConfig);
  await app.listen(config.port);
  new Logger('Bootstrap').log(`API ishga tushdi: http://localhost:${config.port}/api`);
}

await bootstrap();
