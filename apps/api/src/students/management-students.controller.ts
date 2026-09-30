import { Body, Controller, Get, Header, Param, Patch, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { homeroomAssignSchema, managementStudentsQuerySchema, studentIdentityUpdateSchema } from '@ijod/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { ManagementClassesService } from './management-classes.service.js';
import { ManagementStudentsService } from './management-students.service.js';

type Out<T extends z.ZodType> = z.output<T>;

/**
 * Rahbariyatning “O‘quvchilar” bo‘limi. Shaxsiy ma’lumotlar (tug‘ilgan sana, login, JSHSHIR) va
 * o‘quv natijalari faqat direktor o‘rinbosari va super adminga ochiq — administratorga emas.
 */
@Controller('management')
@Roles('DEPUTY', 'SUPER_ADMIN')
export class ManagementStudentsController {
  constructor(
    private readonly students: ManagementStudentsService,
    private readonly classes: ManagementClassesService,
  ) {}

  // ------------------------------------------------------------ O‘quvchilar

  @Get('students')
  list(@Query(zod(managementStudentsQuerySchema)) query: Out<typeof managementStudentsQuerySchema>) {
    return this.students.list(query);
  }

  @Get('students/:id')
  @Header('Cache-Control', 'private, no-store')
  profile(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.students.profile(user, id);
  }

  /** JSHSHIRni to‘liq ko‘rsatish (har bir so‘rov audit jurnalida). */
  @Get('students/:id/pinfl')
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  pinfl(@Param('id', Uuid) id: string) {
    return this.students.revealPinfl(id);
  }

  @Patch('students/:id/identity')
  updateIdentity(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(studentIdentityUpdateSchema)) body: Out<typeof studentIdentityUpdateSchema>,
  ) {
    return this.students.updateIdentity(user, id, body);
  }

  // ------------------------------------------------------------ Sinflar

  @Get('classes')
  classList() {
    return this.classes.list();
  }

  @Get('classes/:id')
  classDetail(@Param('id', Uuid) id: string) {
    return this.classes.detail(id);
  }

  @Put('classes/:id/homeroom')
  assignHomeroom(
    @Param('id', Uuid) id: string,
    @Body(zod(homeroomAssignSchema)) body: Out<typeof homeroomAssignSchema>,
  ) {
    return this.classes.assignHomeroom(id, body.teacherId);
  }
}
