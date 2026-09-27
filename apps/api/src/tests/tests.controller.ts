import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  addBankQuestionsSchema,
  addNewTestQuestionSchema,
  blueprintSchema,
  copyQuestionsFromTestSchema,
  reorderTestQuestionsSchema,
  shareTestSchema,
  testListQuerySchema,
  testPassportSchema,
  updateTestQuestionSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { TestsService } from './tests.service.js';

type Out<T extends z.ZodType> = z.output<T>;

/** Test shablonlari kutubxonasi va test yaratish ustasining 1–6-bosqichlari. */
@Controller('tests')
@Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(zod(testListQuerySchema)) query: Out<typeof testListQuerySchema>) {
    return this.tests.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(zod(testPassportSchema)) body: Out<typeof testPassportSchema>) {
    return this.tests.create(user, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.tests.get(user, id);
  }

  @Put(':id/passport')
  passport(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(testPassportSchema)) body: Out<typeof testPassportSchema>,
  ) {
    return this.tests.updatePassport(user, id, body);
  }

  @Put(':id/blueprint')
  blueprint(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(blueprintSchema)) body: Out<typeof blueprintSchema>,
  ) {
    return this.tests.setBlueprint(user, id, body);
  }

  @Post(':id/questions')
  addNew(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(addNewTestQuestionSchema)) body: Out<typeof addNewTestQuestionSchema>,
  ) {
    return this.tests.addNewQuestion(user, id, body);
  }

  @Post(':id/questions/from-bank')
  addFromBank(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(addBankQuestionsSchema)) body: Out<typeof addBankQuestionsSchema>,
  ) {
    return this.tests.addFromBank(user, id, body);
  }

  @Post(':id/questions/from-test')
  copyFromTest(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(copyQuestionsFromTestSchema)) body: Out<typeof copyQuestionsFromTestSchema>,
  ) {
    return this.tests.copyFromTest(user, id, body);
  }

  @Put(':id/questions/order')
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(reorderTestQuestionsSchema)) body: Out<typeof reorderTestQuestionsSchema>,
  ) {
    return this.tests.reorder(user, id, body.testQuestionIds);
  }

  @Patch(':id/questions/:questionId')
  updateQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Param('questionId', Uuid) questionId: string,
    @Body(zod(updateTestQuestionSchema)) body: Out<typeof updateTestQuestionSchema>,
  ) {
    return this.tests.updateQuestion(user, id, questionId, body);
  }

  @Delete(':id/questions/:questionId')
  removeQuestion(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Param('questionId', Uuid) questionId: string,
  ) {
    return this.tests.removeQuestion(user, id, questionId);
  }

  @Get(':id/validate')
  validate(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.tests.validate(user, id);
  }

  @Post(':id/copy')
  copy(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.tests.copy(user, id);
  }

  @Post(':id/shares')
  @HttpCode(200)
  share(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(shareTestSchema)) body: Out<typeof shareTestSchema>,
  ) {
    return this.tests.share(user, id, body);
  }

  @Delete(':id/shares/:userId')
  unshare(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string, @Param('userId', Uuid) userId: string) {
    return this.tests.unshare(user, id, userId);
  }

  @Delete(':id')
  archive(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.tests.archive(user, id);
  }
}
