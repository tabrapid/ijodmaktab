import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { changePasswordSchema, loginSchema, totpCodeSchema } from '@ijod/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { AllowMfaPending, AllowPasswordChangePending, CurrentUser, Public } from '../common/decorators.js';
import { notFound } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

const LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(zod(loginSchema)) body: z.output<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, me } = await this.auth.login(body, 'SCHOOL', { ip: req.ip, userAgent: req.get('user-agent') });
    res.cookie(SESSION_COOKIE, token, this.sessions.cookieOptions());
    return me;
  }

  /** Super admin uchun alohida kirish manzili (maxfiy URL himoya o‘rnini bosmaydi — 2FA majburiy). */
  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('system/login')
  @HttpCode(200)
  async systemLogin(
    @Body(zod(loginSchema)) body: z.output<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, me } = await this.auth.login(body, 'SYSTEM', { ip: req.ip, userAgent: req.get('user-agent') });
    res.cookie(SESSION_COOKIE, token, this.sessions.cookieOptions());
    return me;
  }

  @AllowPasswordChangePending()
  @AllowMfaPending()
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user);
    res.clearCookie(SESSION_COOKIE, this.sessions.cookieOptions());
    return { ok: true };
  }

  @AllowPasswordChangePending()
  @AllowMfaPending()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @AllowPasswordChangePending()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(zod(changePasswordSchema)) body: z.output<typeof changePasswordSchema>,
  ) {
    await this.auth.changePassword(user, body.currentPassword, body.newPassword);
    return { ok: true };
  }

  @AllowPasswordChangePending()
  @AllowMfaPending()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(@CurrentUser() user: AuthUser, @Body(zod(totpCodeSchema)) body: z.output<typeof totpCodeSchema>) {
    await this.auth.verifyMfa(user, body.code);
    return { ok: true };
  }

  @AllowPasswordChangePending()
  @AllowMfaPending()
  @Post('mfa/setup')
  @HttpCode(200)
  startMfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.startMfaSetup(user);
  }

  @AllowPasswordChangePending()
  @AllowMfaPending()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/confirm')
  @HttpCode(200)
  async confirmMfa(@CurrentUser() user: AuthUser, @Body(zod(totpCodeSchema)) body: z.output<typeof totpCodeSchema>) {
    await this.auth.confirmMfaSetup(user, body.code);
    return { ok: true };
  }

  @Post('mfa/disable')
  @HttpCode(200)
  async disableMfa(@CurrentUser() user: AuthUser, @Body(zod(totpCodeSchema)) body: z.output<typeof totpCodeSchema>) {
    await this.auth.disableMfa(user, body.code);
    return { ok: true };
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthUser) {
    const sessions = await this.sessions.listActive(user.id);
    return sessions.map((session) => ({ ...session, current: session.id === user.sessionId }));
  }

  @Delete('sessions/:id')
  async revokeSession(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const sessions = await this.sessions.listActive(user.id);
    if (!sessions.some((session) => session.id === id)) throw notFound('Sessiya');
    await this.sessions.revoke(id, 'revoked_by_user');
    return { ok: true };
  }
}
