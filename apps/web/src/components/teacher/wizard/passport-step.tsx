'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { testPassportSchema } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { GRADE_LEVELS, useMySubjects } from '@/lib/teaching';
import type { TestDetail } from '@/lib/types';
import { testApi, useTestMutation } from './use-test';

const formSchema = testPassportSchema.extend({ tagsText: z.string().max(400).optional() }).omit({ tags: true });
type FormInput = z.input<typeof formSchema>;

/** 1-bosqich: pasport — nom, fan, sinf darajasi, bob/mavzu, maqsad, til, teglar. */
export function PassportStep({ test, onSaved }: { test: TestDetail; onSaved: () => void }) {
  const subjects = useMySubjects();
  const save = useTestMutation(test.id, testApi.passport(test.id), 'Pasport saqlandi.');
  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: test.title,
      subjectId: test.subject.id,
      gradeLevel: test.gradeLevel,
      topic: test.topic ?? '',
      goal: test.goal ?? '',
      language: test.language,
      academicYearId: test.academicYearId,
      folder: test.folder ?? '',
      instructions: test.instructions ?? '',
      tagsText: test.tags.join(', '),
    },
  });
  const errors = form.formState.errors;
  const subjectOptions = subjects.data ?? [];
  const hasCurrentSubject = subjectOptions.some((subject) => subject.id === test.subject.id);

  const onSubmit = form.handleSubmit(async ({ tagsText, ...values }) => {
    await save.mutateAsync({
      ...values,
      tags: (tagsText ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    onSaved();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Test nomi" required error={errors.title?.message}>
        <Input {...form.register('title')} placeholder="Masalan: Algebra, 1-bob: kvadrat tenglamalar" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fan" required error={errors.subjectId?.message}>
          <Select {...form.register('subjectId')}>
            {!hasCurrentSubject && <option value={test.subject.id}>{test.subject.name}</option>}
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sinf darajasi" required error={errors.gradeLevel?.message}>
          <Select {...form.register('gradeLevel', { valueAsNumber: true })}>
            {GRADE_LEVELS.map((grade) => (
              <option key={grade} value={grade}>
                {grade}-sinf
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Til" error={errors.language?.message}>
          <Select {...form.register('language')}>
            <option value="uz">O‘zbek</option>
            <option value="ru">Rus</option>
            <option value="en">Ingliz</option>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bob / mavzu" error={errors.topic?.message}>
          <Input {...form.register('topic')} placeholder="Kvadrat tenglamalar" />
        </Field>
        <Field label="Teglar" hint="Vergul bilan ajrating" error={errors.tagsText?.message}>
          <Input {...form.register('tagsText')} placeholder="algebra, nazorat ishi" />
        </Field>
      </div>
      <Field label="Maqsad" hint="Test nimani tekshiradi" error={errors.goal?.message}>
        <Textarea rows={2} {...form.register('goal')} />
      </Field>
      <Field label="O‘quvchilar uchun ko‘rsatma" hint="Test boshida ko‘rsatiladi" error={errors.instructions?.message}>
        <Textarea
          rows={3}
          {...form.register('instructions')}
          placeholder="Har bir savolda bitta to‘g‘ri javobni tanlang."
        />
      </Field>
      <Field label="Papka" hint="Testlarni tartiblash uchun (ixtiyoriy)" error={errors.folder?.message}>
        <Input {...form.register('folder')} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>
          Saqlash va davom etish
        </Button>
      </div>
    </form>
  );
}
