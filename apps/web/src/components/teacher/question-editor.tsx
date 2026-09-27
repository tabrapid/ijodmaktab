'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  MAX_OPTIONS,
  questionContentSchema,
  type Category,
  type Difficulty,
} from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const LETTERS = 'ABCDEFGHIJ';

const editorSchema = z.object({
  topic: z.string().trim().max(200).optional(),
  tags: z.string().max(400).optional(),
  content: questionContentSchema,
});

type EditorInput = z.input<typeof editorSchema>;

export interface QuestionEditorValue {
  topic: string | null;
  tags: string[];
  content: z.output<typeof questionContentSchema>;
}

export interface QuestionEditorDefaults {
  topic?: string | null;
  tags?: string[];
  stem?: string;
  options?: { id: string; text: string }[];
  correctOptionId?: string;
  explanation?: string | null;
  category?: Category;
  difficulty?: Difficulty;
  points?: number;
}

const newOptionId = (existing: string[]) => {
  for (const letter of 'abcdefghij') if (!existing.includes(letter)) return letter;
  return `o${Date.now().toString(36)}`;
};

/**
 * Bitta to‘g‘ri javobli savol muharriri: matn, variantlar, to‘g‘ri javob, izoh, kategoriya,
 * qiyinlik va ball. Kategoriya (bilish/qo‘llash/mulohaza) qiyinlikdan alohida tanlanadi.
 */
export function QuestionEditor({
  defaults,
  showMeta = true,
  submitLabel = 'Saqlash',
  onSubmit,
  onCancel,
  lockedNotice,
}: {
  defaults?: QuestionEditorDefaults;
  showMeta?: boolean;
  submitLabel?: string;
  onSubmit: (value: QuestionEditorValue) => Promise<unknown>;
  onCancel?: () => void;
  lockedNotice?: boolean;
}) {
  const form = useForm<EditorInput>({
    resolver: zodResolver(editorSchema),
    defaultValues: {
      topic: defaults?.topic ?? '',
      tags: (defaults?.tags ?? []).join(', '),
      content: {
        type: 'SINGLE_CHOICE',
        stem: defaults?.stem ?? '',
        options: defaults?.options ?? [
          { id: 'a', text: '' },
          { id: 'b', text: '' },
          { id: 'c', text: '' },
          { id: 'd', text: '' },
        ],
        correctOptionId: defaults?.correctOptionId ?? '',
        explanation: defaults?.explanation ?? '',
        category: defaults?.category ?? 'KNOWLEDGE',
        difficulty: defaults?.difficulty ?? 'MEDIUM',
        points: defaults?.points ?? 1,
      },
    },
  });
  const options = useFieldArray({ control: form.control, name: 'content.options' });
  const correct = form.watch('content.correctOptionId');
  const errors = form.formState.errors;
  const rootError = form.formState.errors.root?.message;

  const submit = form.handleSubmit(async (values) => {
    const parsed = editorSchema.parse(values);
    try {
      await onSubmit({
        topic: parsed.topic ? parsed.topic : null,
        tags: (parsed.tags ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 20),
        content: parsed.content,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [path, message] of Object.entries(error.fieldErrors)) {
          form.setError(path as never, { message });
        }
        form.setError('root', { message: error.message });
      } else {
        form.setError('root', { message: 'Saqlab bo‘lmadi.' });
      }
    }
  });

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {rootError && <Alert tone="danger">{rootError}</Alert>}
      {lockedNotice && (
        <Alert tone="info">
          Bu savol o‘tkazilgan testda ishlatilgan. O‘zgartirish savolning yangi versiyasini yaratadi — o‘tkazilgan
          sessiyalar eski versiyada qoladi.
        </Alert>
      )}

      <Field label="Savol matni" required error={errors.content?.stem?.message}>
        <Textarea
          rows={4}
          {...form.register('content.stem')}
          placeholder="Masalan: x² − 5x + 6 = 0 tenglamaning ildizlarini toping."
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          Javob variantlari <span className="font-normal text-slate-500">(to‘g‘ri javobni belgilang)</span>
        </legend>
        {options.fields.map((field, index) => {
          const optionId = form.getValues(`content.options.${index}.id`);
          const isCorrect = correct === optionId;
          return (
            <div
              key={field.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-2',
                isCorrect ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200',
              )}
            >
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-600">
                <input
                  type="radio"
                  className="size-4 text-emerald-600 focus:ring-emerald-500"
                  checked={isCorrect}
                  onChange={() =>
                    form.setValue('content.correctOptionId', optionId, { shouldValidate: true, shouldDirty: true })
                  }
                  aria-label={`${LETTERS[index]} varianti to‘g‘ri javob`}
                />
                {LETTERS[index]})
              </label>
              <Input
                {...form.register(`content.options.${index}.text`)}
                placeholder={`${LETTERS[index]} variant matni`}
                aria-label={`${LETTERS[index]} variant matni`}
                aria-invalid={Boolean(errors.content?.options?.[index]?.text)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (isCorrect) form.setValue('content.correctOptionId', '');
                  options.remove(index);
                }}
                disabled={options.fields.length <= 2}
                aria-label={`${LETTERS[index]} variantni o‘chirish`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
        {(errors.content?.options?.message || errors.content?.options?.root?.message) && (
          <p className="text-xs font-medium text-red-600">
            {errors.content.options.message ?? errors.content.options.root?.message}
          </p>
        )}
        {errors.content?.correctOptionId?.message && (
          <p className="text-xs font-medium text-red-600">{errors.content.correctOptionId.message}</p>
        )}
        {options.fields.length < MAX_OPTIONS && (
          <Button
            variant="outline"
            size="sm"
            icon={<Plus className="size-4" />}
            onClick={() =>
              options.append({
                id: newOptionId(form.getValues('content.options').map((option) => option.id)),
                text: '',
              })
            }
          >
            Variant qo‘shish
          </Button>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kategoriya" hint="Bilish, qo‘llash yoki mulohaza" error={errors.content?.category?.message}>
          <Select {...form.register('content.category')}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Qiyinlik darajasi" error={errors.content?.difficulty?.message}>
          <Select {...form.register('content.difficulty')}>
            {DIFFICULTIES.map((difficulty) => (
              <option key={difficulty} value={difficulty}>
                {DIFFICULTY_LABELS[difficulty]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Maksimal ball" error={errors.content?.points?.message}>
          <Input type="number" step="0.5" min="0.5" {...form.register('content.points', { valueAsNumber: true })} />
        </Field>
      </div>

      <Field
        label="Izoh (ixtiyoriy)"
        hint="To‘g‘ri javob tushuntirishi — natija e’lon qilingach o‘quvchiga ko‘rsatiladi."
        error={errors.content?.explanation?.message}
      >
        <Textarea rows={2} {...form.register('content.explanation')} />
      </Field>

      {showMeta && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mavzu" error={errors.topic?.message}>
            <Input {...form.register('topic')} placeholder="Masalan: Kvadrat tenglamalar" />
          </Field>
          <Field label="Teglar" hint="Vergul bilan ajrating" error={errors.tags?.message}>
            <Input {...form.register('tags')} placeholder="algebra, 1-bob" />
          </Field>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Bekor qilish
          </Button>
        )}
        <Button type="submit" loading={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
