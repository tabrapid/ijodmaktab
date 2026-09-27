import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  assignmentChangeSchema,
  attemptUnlockSchema,
  cancelAttemptSchema,
  cancelSessionSchema,
  createSessionSchema,
  extendTimeSchema,
  regradeSchema,
  sessionListQuerySchema,
  updateSessionTimingSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Uuid } from '../common/uuid.pipe.js';
import { zod } from '../common/zod.pipe.js';
import { SessionsService } from './sessions.service.js';

type Out<T extends z.ZodType> = z.output<T>;

@Controller()
@Roles('TEACHER', 'DEPUTY', 'SUPER_ADMIN')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('sessions')
  list(@CurrentUser() user: AuthUser, @Query(zod(sessionListQuerySchema)) query: Out<typeof sessionListQuerySchema>) {
    return this.sessions.list(user, query);
  }

  @Post('sessions')
  create(@CurrentUser() user: AuthUser, @Body(zod(createSessionSchema)) body: Out<typeof createSessionSchema>) {
    return this.sessions.create(user, body);
  }

  @Get('sessions/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.sessions.detail(user, id);
  }

  @Put('sessions/:id/timing')
  timing(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(updateSessionTimingSchema)) body: Out<typeof updateSessionTimingSchema>,
  ) {
    return this.sessions.updateTiming(user, id, body);
  }

  @Post('sessions/:id/start')
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.sessions.startNow(user, id);
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.sessions.closeNow(user, id);
  }

  @Post('sessions/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(cancelSessionSchema)) body: Out<typeof cancelSessionSchema>,
  ) {
    return this.sessions.cancel(user, id, body.reason);
  }

  @Post('sessions/:id/rotate-code')
  @HttpCode(200)
  rotateCode(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.sessions.rotateCode(user, id);
  }

  @Post('sessions/:id/publish-results')
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.sessions.publishResults(user, id);
  }

  @Post('sessions/:id/open-review')
  @HttpCode(200)
  openReview(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.sessions.openReview(user, id);
  }

  @Get('sessions/:id/live')
  live(@CurrentUser() user: AuthUser, @Param('id', Uuid) id: string) {
    return this.sessions.live(user, id);
  }

  @Post('sessions/:id/assignments')
  @HttpCode(200)
  assignments(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(assignmentChangeSchema)) body: Out<typeof assignmentChangeSchema>,
  ) {
    return this.sessions.changeAssignments(user, id, body);
  }

  @Post('sessions/:id/students/:studentId/extend')
  @HttpCode(200)
  extend(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Param('studentId', Uuid) studentId: string,
    @Body(zod(extendTimeSchema)) body: Out<typeof extendTimeSchema>,
  ) {
    return this.sessions.extendTime(user, id, studentId, body.minutes, body.reason);
  }

  @Post('attempts/:id/cancel')
  @HttpCode(200)
  cancelAttempt(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(cancelAttemptSchema)) body: Out<typeof cancelAttemptSchema>,
  ) {
    return this.sessions.cancelAttempt(user, id, body);
  }

  /** To‘liq ekrandan chiqib to‘xtatilgan urinishga qayta ruxsat berish. */
  @Post('attempts/:id/unlock')
  @HttpCode(200)
  unlockAttempt(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(attemptUnlockSchema)) body: Out<typeof attemptUnlockSchema>,
  ) {
    return this.sessions.unlockAttempt(user, id, body);
  }

  @Post('sessions/:id/regrade')
  @HttpCode(200)
  regrade(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Body(zod(regradeSchema)) body: Out<typeof regradeSchema>,
  ) {
    return this.sessions.regrade(user, id, body);
  }

  @Get('sessions/:id/revisions/:revisionId')
  revision(
    @CurrentUser() user: AuthUser,
    @Param('id', Uuid) id: string,
    @Param('revisionId', Uuid) revisionId: string,
  ) {
    return this.sessions.revisionDetail(user, id, revisionId);
  }
}
