import type { Prisma } from '../generated/prisma/client.js';

/** Bazadagi JSON maydonini ma’lum turga keltiradi (tuzilma bizning kodimiz tomonidan yoziladi). */
export const fromJson = <T>(value: Prisma.JsonValue | null | undefined): T => value as unknown as T;

/** Qiymatni JSON maydonga yozish uchun tayyorlaydi. */
export const toJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
