import {
  normalizeForSearch,
  type Category,
  type Difficulty,
  type QuestionType,
  type questionContentSchema,
} from '@ijod/shared';
import type { z } from 'zod';
import { num } from '../common/numbers.js';
import type { Prisma, QuestionVersion } from '../generated/prisma/client.js';

export type QuestionContent = z.output<typeof questionContentSchema>;

export interface QuestionOption {
  id: string;
  text: string;
}

/** Savol versiyasining bazaga yoziladigan mazmuni. */
export function versionData(content: QuestionContent) {
  return {
    type: content.type,
    stem: content.stem,
    options: content.options as unknown as Prisma.InputJsonValue,
    answerKey: { correctOptionId: content.correctOptionId } as Prisma.InputJsonValue,
    explanation: content.explanation,
    category: content.category,
    difficulty: content.difficulty,
    points: content.points,
  };
}

export const optionsOf = (version: Pick<QuestionVersion, 'options'>) => version.options as unknown as QuestionOption[];

export const correctOptionOf = (version: Pick<QuestionVersion, 'answerKey'>) =>
  (version.answerKey as { correctOptionId?: string } | null)?.correctOptionId ?? '';

/** Savol versiyasi (javob kaliti bilan) — faqat xodimlar uchun. */
export function versionView(version: QuestionVersion) {
  return {
    id: version.id,
    versionNo: version.versionNo,
    type: version.type as QuestionType,
    stem: version.stem,
    options: optionsOf(version),
    correctOptionId: correctOptionOf(version),
    explanation: version.explanation,
    category: version.category as Category,
    difficulty: version.difficulty as Difficulty,
    points: num(version.points) ?? 0,
    locked: Boolean(version.lockedAt),
    createdAt: version.createdAt,
  };
}

export function questionSearchText(input: { stem: string; topic?: string | null; tags?: readonly string[] }) {
  return normalizeForSearch([input.stem, input.topic, ...(input.tags ?? [])].filter(Boolean).join(' ')).slice(0, 2000);
}

/** Mazmun o‘zgardimi (kalit, variantlar, matn, ball, kategoriya). */
export function contentChanged(version: QuestionVersion, content: QuestionContent) {
  const view = versionView(version);
  return (
    view.type !== content.type ||
    view.stem !== content.stem ||
    JSON.stringify(view.options) !== JSON.stringify(content.options) ||
    view.correctOptionId !== content.correctOptionId ||
    (view.explanation ?? null) !== (content.explanation ?? null) ||
    view.category !== content.category ||
    view.difficulty !== content.difficulty ||
    view.points !== content.points
  );
}
