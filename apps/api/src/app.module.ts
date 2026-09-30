import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module.js';
import { AssessmentModule } from './assessment.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { PinflModule } from './common/pinfl-vault.js';
import { StorageModule } from './common/storage.module.js';
import { UserThrottlerGuard } from './common/throttler.guard.js';
import { ConfigModule } from './config/config.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthController } from './health/health.controller.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PortfolioModule } from './portfolio/portfolio.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QuestionsModule } from './questions/questions.module.js';
import { RegistrationModule } from './registration/registration.module.js';
import { StructureModule } from './structure/structure.module.js';
import { StudentsModule } from './students/students.module.js';
import { TeacherProfileModule } from './teacher-profile/teacher-profile.module.js';
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
    PinflModule,
    NotificationsModule,
    UsersModule,
    StructureModule,
    QuestionsModule,
    TestsModule,
    AssessmentModule,
    PortfolioModule,
    DashboardModule,
    RegistrationModule,
    TeacherProfileModule,
    StudentsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Tartib muhim: avval foydalanuvchi aniqlanadi, keyin tezlik cheklovi uning bo‘yicha hisoblanadi.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
