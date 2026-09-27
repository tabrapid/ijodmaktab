import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module.js';
import { AssessmentModule } from './assessment.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { StorageModule } from './common/storage.module.js';
import { UserThrottlerGuard } from './common/throttler.guard.js';
import { ConfigModule } from './config/config.module.js';
import { HealthController } from './health/health.controller.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QuestionsModule } from './questions/questions.module.js';
import { StructureModule } from './structure/structure.module.js';
import { TestsModule } from './tests/tests.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }] }),
    AuditModule,
    AuthModule,
    AccessModule,
    StorageModule,
    NotificationsModule,
    UsersModule,
    StructureModule,
    QuestionsModule,
    TestsModule,
    AssessmentModule,
  ],
  controllers: [HealthController],
  providers: [
    // Tartib muhim: avval foydalanuvchi aniqlanadi, keyin tezlik cheklovi uning bo‘yicha hisoblanadi.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
