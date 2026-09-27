import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from './auth-user.js';

export interface RequestContextStore {
  ip?: string;
  userAgent?: string;
  user?: AuthUser;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

/** So‘rov davomida IP, brauzer va joriy foydalanuvchini audit uchun saqlaydi. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  storage.run({ ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 300) }, next);
}

export const requestContext = {
  get: (): RequestContextStore | undefined => storage.getStore(),
  setUser(user: AuthUser) {
    const store = storage.getStore();
    if (store) store.user = user;
  },
  run: <T>(store: RequestContextStore, fn: () => T): T => storage.run(store, fn),
};
