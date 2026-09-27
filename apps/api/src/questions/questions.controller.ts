import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { createQuestionSchema, questionListQuerySchema, updateQuestionSchema } from '@ijod/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { QuestionsService } from './questions.service.js';

type Out<T extends z.ZodType> = z.output<T>;

@Controller('questions')
@Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(zod(questionListQuerySchema)) query: Out<typeof questionListQuerySchema>) {
    return this.questions.list(user, query);
  }

  @Get('school-requests')
  schoolRequests(@CurrentUser() user: AuthUser) {
    return this.questions.schoolRequests(user);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.questions.detail(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(zod(createQuestionSchema)) body: Out<typeof createQuestionSchema>) {
    return this.questions.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(updateQuestionSchema)) body: Out<typeof updateQuestionSchema>,
  ) {
    return this.questions.update(user, id, body);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.questions.archive(user, id);
  }

  @Post(':id/request-school')
  @HttpCode(200)
  requestSchool(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.questions.requestSchool(user, id);
  }

  @Post(':id/approve-school')
  @Roles('DEPUTY', 'SUPER_ADMIN')
  @HttpCode(200)
  approveSchool(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.questions.decideSchool(user, id, true);
  }

  @Post(':id/reject-school')
  @Roles('DEPUTY', 'SUPER_ADMIN')
  @HttpCode(200)
  rejectSchool(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.questions.decideSchool(user, id, false);
  }
}
