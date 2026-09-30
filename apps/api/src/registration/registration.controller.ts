import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle, normalizeIp, type ThrottlerGetTrackerFunction } from '@nestjs/throttler';
import { loginAvailabilityQuerySchema, studentRegistrationSchema, teacherRegistrationSchema } from '@ijod/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { SESSION_COOKIE, SessionService } from '../auth/session.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public } from '../common/decorators.js';
import { conflict } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { RegistrationService } from './registration.service.js';

/**
 * Ochiq sahifalarda tezlik cheklovi faqat IP bo‘yicha: so‘rov tanasidagi loginni almashtirib
 * cheklovni chetlab o‘tib bo‘lmaydi (umumiy guard kirish sahifasi uchun IP + login ishlatadi).
 */
const byIp: ThrottlerGetTrackerFunction = (req) => `registration:${normalizeIp(String(req.ip ?? ''))}`;

const MINUTE = 60_000;
/** Sahifa ma’lumotlari va login tekshiruvi (login yozilayotganda kechiktirib so‘raladi). */
const READ_LIMIT = { default: { limit: 30, ttl: MINUTE, getTracker: byIp } };
/**
 * O‘quvchi: bir IP dan daqiqasiga 10 ta. Maktab kompyuter xonasi yoki Wi-Fi da butun sinf bitta
 * tashqi IP ortida ro‘yxatdan o‘tadi — qattiqroq cheklov darsni to‘xtatib qo‘yardi.
 */
const STUDENT_LIMIT = { default: { limit: 10, ttl: MINUTE, getTracker: byIp } };
const TEACHER_LIMIT = { default: { limit: 5, ttl: MINUTE, getTracker: byIp } };

/** Tizimga kirgan foydalanuvchi yangi hisob ochmaydi (umumiy kompyuterda boshqa odam nomidan). */
function assertSignedOut(user: AuthUser | undefined) {
  if (user) {
    throw conflict('ALREADY_AUTHENTICATED', 'Siz tizimga kirgansiz. Yangi hisob ochish uchun avval tizimdan chiqing.');
  }
}

/** O‘quvchi va o‘qituvchilarning o‘zi ro‘yxatdan o‘tishi (kirishsiz ochiq manzillar). */
@Controller('registration')
export class RegistrationController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Throttle(READ_LIMIT)
  @Get('options')
  options() {
    return this.registration.options();
  }

  @Public()
  @Throttle(READ_LIMIT)
  @Get('login-available')
  loginAvailable(@Query(zod(loginAvailabilityQuerySchema)) query: z.output<typeof loginAvailabilityQuerySchema>) {
    return this.registration.loginAvailability(query.login);
  }

  /** O‘quvchi darhol tizimga kiritiladi: `/auth/login` bilan bir xil cookie va `Me` javobi. */
  @Public()
  @Throttle(STUDENT_LIMIT)
  @Post('student')
  async student(
    @Body(zod(studentRegistrationSchema)) body: z.output<typeof studentRegistrationSchema>,
    @CurrentUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertSignedOut(user);
    const { token, me } = await this.registration.registerStudent(body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie(SESSION_COOKIE, token, this.sessions.cookieOptions());
    return me;
  }

  /** O‘qituvchi hisobi direktor o‘rinbosari tasdiqlagach ishlaydi — sessiya ochilmaydi. */
  @Public()
  @Throttle(TEACHER_LIMIT)
  @Post('teacher')
  teacher(
    @Body(zod(teacherRegistrationSchema)) body: z.output<typeof teacherRegistrationSchema>,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    assertSignedOut(user);
    return this.registration.registerTeacher(body);
  }
}
