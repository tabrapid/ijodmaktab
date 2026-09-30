import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  id,
  mentorshipCreateSchema,
  mentorshipStudentSearchSchema,
  teacherCredentialSchema,
  teacherProfileSchema,
} from '@ijod/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { MentorshipService } from './mentorship.service.js';
import { TeacherProfileService } from './teacher-profile.service.js';

type Out<T extends z.ZodType> = z.output<T>;

/** Ustozlik uchun tanlangan o‘quvchi. */
const candidatesQuerySchema = z.object({ studentId: id() });

/**
 * O‘qituvchining o‘z ma’lumotnomasi va o‘quvchilar sertifikatlariga ustozligi. O‘qituvchi roli bor
 * rahbariyat a’zosi ham (masalan, dars beradigan direktor o‘rinbosari) o‘z ma’lumotnomasini yuritadi.
 */
@Controller('me')
@Roles('TEACHER')
export class TeacherProfileController {
  constructor(
    private readonly profiles: TeacherProfileService,
    private readonly mentorships: MentorshipService,
  ) {}

  @Get('teacher-profile')
  own(@CurrentUser() user: AuthUser) {
    return this.profiles.reference(user.id);
  }

  @Put('teacher-profile')
  update(@CurrentUser() user: AuthUser, @Body(zod(teacherProfileSchema)) body: Out<typeof teacherProfileSchema>) {
    return this.profiles.updateProfile(user, body);
  }

  @Post('teacher-credentials')
  createCredential(
    @CurrentUser() user: AuthUser,
    @Body(zod(teacherCredentialSchema)) body: Out<typeof teacherCredentialSchema>,
  ) {
    return this.profiles.createCredential(user, body);
  }

  @Put('teacher-credentials/:id')
  updateCredential(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) credentialId: string,
    @Body(zod(teacherCredentialSchema)) body: Out<typeof teacherCredentialSchema>,
  ) {
    return this.profiles.updateCredential(user, credentialId, body);
  }

  @Delete('teacher-credentials/:id')
  removeCredential(@CurrentUser() user: AuthUser, @Param('id', Uuid) credentialId: string) {
    return this.profiles.removeCredential(user, credentialId);
  }

  // ------------------------------------------------------------ Ustozlik

  /** Faol o‘quvchilarni ism bo‘yicha qidirish (ko‘pi bilan 20 ta). */
  @Get('mentorships/students')
  searchStudents(
    @CurrentUser() user: AuthUser,
    @Query(zod(mentorshipStudentSearchSchema)) query: Out<typeof mentorshipStudentSearchSchema>,
  ) {
    return this.mentorships.searchStudents(user, query.q);
  }

  /** O‘quvchining mutaxassislikka mos tasdiqlangan sertifikatlari. */
  @Get('mentorships/candidates')
  candidates(
    @CurrentUser() user: AuthUser,
    @Query(zod(candidatesQuerySchema)) query: Out<typeof candidatesQuerySchema>,
  ) {
    return this.mentorships.candidates(user, query.studentId);
  }

  /** “Ustozlik qildim”: yangi yozuv — 201, avval qayd etilgan bo‘lsa — 200 (o‘sha yozuv). */
  @Post('mentorships')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async createMentorship(
    @CurrentUser() user: AuthUser,
    @Body(zod(mentorshipCreateSchema)) body: Out<typeof mentorshipCreateSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.mentorships.create(user, body.portfolioItemId);
    res.status(result.created ? 201 : 200);
    return result.mentorship;
  }

  @Delete('mentorships/:id')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  removeMentorship(@CurrentUser() user: AuthUser, @Param('id', Uuid) mentorshipId: string) {
    return this.mentorships.remove(user, mentorshipId);
  }
}

/**
 * Rahbariyat uchun o‘qituvchi ma’lumotnomasi (faqat ko‘rish). Administrator kirmaydi: ma’lumotnomadagi
 * hujjatlar pedagogik kadrlar ma’lumoti bo‘lib, fayllari ham faqat egasi va rahbariyatga ochiq.
 */
@Controller('teachers')
@Roles('DEPUTY', 'SUPER_ADMIN')
export class TeacherReferenceController {
  constructor(private readonly profiles: TeacherProfileService) {}

  @Get(':id/reference')
  reference(@Param('id', Uuid) teacherId: string) {
    return this.profiles.leadershipReference(teacherId);
  }
}
