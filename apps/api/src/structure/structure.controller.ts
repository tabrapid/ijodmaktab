import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  academicYearSchema,
  classSchema,
  endEnrollmentSchema,
  enrollStudentsSchema,
  schoolSettingsSchema,
  subjectSchema,
  teachingAssignmentSchema,
  transferStudentSchema,
  updateClassSchema,
} from '@ijod/shared';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { StructureService } from './structure.service.js';

type Out<T extends z.ZodType> = z.output<T>;

const classListQuery = z.object({
  academicYearId: z.uuid().optional(),
  scope: z.enum(['mine', 'all']).default('all'),
});

const assignmentQuery = z.object({
  teacherId: z.uuid().optional(),
  classId: z.uuid().optional(),
  subjectId: z.uuid().optional(),
});

const MANAGERS = ['ADMIN', 'SUPER_ADMIN'] as const;
/** Sinfga a’zolik (biriktirish, ko‘chirish, tugatish): direktor o‘rinbosari ham. */
const ENROLLERS = ['DEPUTY', 'ADMIN', 'SUPER_ADMIN'] as const;
const STAFF = ['TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN'] as const;

@Controller()
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  // ------------------------------------------------------------ Maktab
  @Get('school')
  school() {
    return this.structure.school();
  }

  @Put('school')
  @Roles(...MANAGERS)
  updateSchool(@Body(zod(schoolSettingsSchema)) body: Out<typeof schoolSettingsSchema>) {
    return this.structure.updateSchool(body);
  }

  // ------------------------------------------------------------ O‘quv yillari
  @Get('academic-years')
  @Roles(...STAFF)
  years() {
    return this.structure.listYears();
  }

  @Post('academic-years')
  @Roles(...MANAGERS)
  createYear(@Body(zod(academicYearSchema)) body: Out<typeof academicYearSchema>) {
    return this.structure.createYear(body);
  }

  @Put('academic-years/:id')
  @Roles(...MANAGERS)
  updateYear(@Param('id', Uuid) id: string, @Body(zod(academicYearSchema)) body: Out<typeof academicYearSchema>) {
    return this.structure.updateYear(id, body);
  }

  @Post('academic-years/:id/make-current')
  @Roles(...MANAGERS)
  @HttpCode(200)
  makeCurrent(@Param('id', Uuid) id: string) {
    return this.structure.makeCurrentYear(id);
  }

  // ------------------------------------------------------------ Fanlar
  @Get('subjects')
  subjects(@Query('all') all?: string) {
    return this.structure.listSubjects(all === 'true');
  }

  @Post('subjects')
  @Roles(...MANAGERS)
  createSubject(@Body(zod(subjectSchema)) body: Out<typeof subjectSchema>) {
    return this.structure.createSubject(body);
  }

  @Put('subjects/:id')
  @Roles(...MANAGERS)
  updateSubject(@Param('id', Uuid) id: string, @Body(zod(subjectSchema)) body: Out<typeof subjectSchema>) {
    return this.structure.updateSubject(id, body);
  }

  // ------------------------------------------------------------ Sinflar
  @Get('classes')
  @Roles(...STAFF)
  classes(@CurrentUser() user: AuthUser, @Query(zod(classListQuery)) query: Out<typeof classListQuery>) {
    return this.structure.listClasses(user, query);
  }

  @Get('classes/:id')
  @Roles(...STAFF)
  classDetail(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.structure.classDetail(user, id);
  }

  @Post('classes')
  @Roles(...MANAGERS)
  createClass(@Body(zod(classSchema)) body: Out<typeof classSchema>) {
    return this.structure.createClass(body);
  }

  @Patch('classes/:id')
  @Roles(...MANAGERS)
  updateClass(@Param('id', Uuid) id: string, @Body(zod(updateClassSchema)) body: Out<typeof updateClassSchema>) {
    return this.structure.updateClass(id, body);
  }

  @Post('classes/:id/archive')
  @Roles(...MANAGERS)
  @HttpCode(200)
  archiveClass(@Param('id', Uuid) id: string) {
    return this.structure.setClassArchived(id, true);
  }

  @Post('classes/:id/unarchive')
  @Roles(...MANAGERS)
  @HttpCode(200)
  unarchiveClass(@Param('id', Uuid) id: string) {
    return this.structure.setClassArchived(id, false);
  }

  @Post('classes/:id/students')
  @Roles(...ENROLLERS)
  @HttpCode(200)
  enroll(@Param('id', Uuid) id: string, @Body(zod(enrollStudentsSchema)) body: Out<typeof enrollStudentsSchema>) {
    return this.structure.enrollStudents(id, body);
  }

  @Post('students/:id/transfer')
  @Roles(...ENROLLERS)
  @HttpCode(200)
  transfer(@Param('id', Uuid) id: string, @Body(zod(transferStudentSchema)) body: Out<typeof transferStudentSchema>) {
    return this.structure.transferStudent(id, body);
  }

  @Post('enrollments/:id/end')
  @Roles(...ENROLLERS)
  @HttpCode(200)
  endEnrollment(@Param('id', Uuid) id: string, @Body(zod(endEnrollmentSchema)) body: Out<typeof endEnrollmentSchema>) {
    return this.structure.endEnrollment(id, body);
  }

  // ------------------------------------------------------------ Biriktirishlar
  @Get('teaching-assignments')
  @Roles(...STAFF)
  assignments(@Query(zod(assignmentQuery)) query: Out<typeof assignmentQuery>) {
    return this.structure.listTeachingAssignments(query);
  }

  @Get('me/teaching')
  @Roles('TEACHER', 'DEPUTY')
  myTeaching(@CurrentUser() user: AuthUser) {
    return this.structure.listTeachingAssignments({ teacherId: user.id });
  }

  @Post('teaching-assignments')
  @Roles(...MANAGERS)
  createAssignment(@Body(zod(teachingAssignmentSchema)) body: Out<typeof teachingAssignmentSchema>) {
    return this.structure.createTeachingAssignment(body);
  }

  @Delete('teaching-assignments/:id')
  @Roles(...MANAGERS)
  deleteAssignment(@Param('id', Uuid) id: string) {
    return this.structure.deleteTeachingAssignment(id);
  }
}
