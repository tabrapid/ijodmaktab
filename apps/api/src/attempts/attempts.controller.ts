import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  advanceSchema,
  attemptLockSchema,
  enterCodeSchema,
  heartbeatSchema,
  saveAnswerSchema,
  startAttemptSchema,
  submitAttemptSchema,
  takeoverSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { AttemptsService } from './attempts.service.js';

type Out<T extends z.ZodType> = z.output<T>;

/** O‘quvchi kabineti: tayinlangan testlar, test topshirish va natijalar. */
@Controller()
@Roles('STUDENT')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get('me/sessions')
  mySessions(@CurrentUser() user: AuthUser) {
    return this.attempts.mySessions(user);
  }

  @Post('me/sessions/find-by-code')
  @HttpCode(200)
  findByCode(@CurrentUser() user: AuthUser, @Body(zod(enterCodeSchema)) body: Out<typeof enterCodeSchema>) {
    return this.attempts.findByCode(user, body.code);
  }

  @Get('me/sessions/:id')
  preview(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.attempts.preview(user, id);
  }

  @Post('me/sessions/:id/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(startAttemptSchema)) body: Out<typeof startAttemptSchema>,
  ) {
    return this.attempts.start(user, id, body);
  }

  @Get('me/results')
  myResults(@CurrentUser() user: AuthUser) {
    return this.attempts.myResults(user);
  }

  @Get('attempts/:id')
  view(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string, @Query('clientId') clientId?: string) {
    return this.attempts.view(user, id, typeof clientId === 'string' ? clientId : undefined);
  }

  @Put('attempts/:id/answers/:questionId')
  save(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Param('questionId', Uuid) questionId: string,
    @Body(zod(saveAnswerSchema)) body: Out<typeof saveAnswerSchema>,
  ) {
    return this.attempts.saveAnswer(user, id, questionId, body);
  }

  @Post('attempts/:id/advance')
  @HttpCode(200)
  advance(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(advanceSchema)) body: Out<typeof advanceSchema>,
  ) {
    return this.attempts.advance(user, id, body);
  }

  @Post('attempts/:id/heartbeat')
  @HttpCode(200)
  heartbeat(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(heartbeatSchema)) body: Out<typeof heartbeatSchema>,
  ) {
    return this.attempts.heartbeat(user, id, body);
  }

  /** To‘liq ekrandan chiqish yoki sahifadan ketish: urinish o‘qituvchi ruxsatigacha to‘xtatiladi. */
  @Post('attempts/:id/lock')
  @HttpCode(200)
  lock(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(attemptLockSchema)) body: Out<typeof attemptLockSchema>,
  ) {
    return this.attempts.lock(user, id, body);
  }

  @Post('attempts/:id/takeover')
  @HttpCode(200)
  takeover(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(takeoverSchema)) body: Out<typeof takeoverSchema>,
  ) {
    return this.attempts.takeover(user, id, body.clientId);
  }

  @Post('attempts/:id/submit')
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(submitAttemptSchema)) body: Out<typeof submitAttemptSchema>,
  ) {
    return this.attempts.submit(user, id, body);
  }
}
