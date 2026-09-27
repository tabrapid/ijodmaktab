import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** So‘rov tanasi yoki parametrlarini umumiy zod sxemasi bilan tekshiradi. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    // ZodError global filtrda o‘zbekcha xabarlarga aylantiriladi.
    return this.schema.parse(value ?? {});
  }
}

export const zod = <T extends z.ZodType>(schema: T) => new ZodPipe(schema);
