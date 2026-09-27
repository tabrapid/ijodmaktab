import { ParseUUIDPipe } from '@nestjs/common';
import { notFound } from './errors.js';

/** URL dagi identifikator: noto‘g‘ri ko‘rinishdagi ID ham “topilmadi” deb qaytariladi. */
export const Uuid = new ParseUUIDPipe({ version: '7', exceptionFactory: () => notFound() });
