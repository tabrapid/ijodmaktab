import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

/**
 * Tezlik cheklovi foydalanuvchi bo‘yicha hisoblanadi: maktabda yuzlab o‘quvchi bitta tashqi IP
 * ortida bo‘lishi mumkin, IP bo‘yicha cheklov butun maktabni to‘xtatib qo‘yardi.
 * Kirish sahifasida esa IP + login juftligi bo‘yicha.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Record<string, unknown>): Promise<string> {
    const req = request as unknown as Request & { user?: AuthUser };
    if (req.user) return `user:${req.user.id}`;
    const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
    return `ip:${req.ip}:${login}`;
  }
}
