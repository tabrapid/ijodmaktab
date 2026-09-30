import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { registrationListQuerySchema, registrationRejectSchema, registrationSettingsSchema } from '@ijod/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { RegistrationService } from './registration.service.js';

/**
 * Ro‘yxatdan o‘tganlar bilan ishlash: faqat direktor o‘rinbosari (va super admin). Administrator
 * hisoblarni “Foydalanuvchilar” bo‘limida boshqaradi, lekin o‘qituvchini tasdiqlash — rahbariyat qarori.
 */
@Controller('registrations')
@Roles('DEPUTY', 'SUPER_ADMIN')
export class RegistrationsController {
  constructor(private readonly registration: RegistrationService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(zod(registrationListQuerySchema)) query: z.output<typeof registrationListQuerySchema>,
  ) {
    return this.registration.list(user, query);
  }

  @Get('settings')
  settings() {
    return this.registration.settings();
  }

  @Put('settings')
  updateSettings(@Body(zod(registrationSettingsSchema)) body: z.output<typeof registrationSettingsSchema>) {
    return this.registration.updateSettings(body);
  }

  @Post(':userId/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('userId', Uuid) userId: string) {
    return this.registration.approve(user, userId);
  }

  @Post(':userId/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('userId', Uuid) userId: string,
    @Body(zod(registrationRejectSchema)) body: z.output<typeof registrationRejectSchema>,
  ) {
    return this.registration.reject(user, userId, body.reason);
  }
}
