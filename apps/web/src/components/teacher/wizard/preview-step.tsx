'use client';

import { Monitor, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CATEGORY_LABELS, categoryEntries, formatPercent, formatPoints, gradeAttempt, pairPercent } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import type { TestDetail } from '@/lib/types';

const LETTERS = 'ABCDEFGHIJ';

/**
 * 6-bosqich: o‘quvchi ko‘rinishi (telefon va kompyuter) va namunaviy topshirish —
 * tanlangan javoblar bilan baholash qoidalari sinab ko‘riladi (server bilan bir xil hisob).
 */
export function PreviewStep({ test }: { test: TestDetail }) {
  const [device, setDevice] = useState<'phone' | 'desktop'>('desktop');
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const questions = test.version?.questions ?? [];

  const grade = useMemo(
    () =>
      gradeAttempt(
        questions.map((question) => ({
          id: question.testQuestionId,
          type: question.type,
          category: question.category,
          points: question.points,
          answerKey: { correctOptionId: question.correctOptionId },
        })),
        Object.fromEntries(Object.entries(answers).map(([id, optionId]) => [id, { optionId }])),
      ),
    [questions, answers],
  );

  const fillCorrect = () =>
    setAnswers(Object.fromEntries(questions.map((question) => [question.testQuestionId, question.correctOptionId])));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={device === 'desktop' ? 'secondary' : 'outline'}
            icon={<Monitor className="size-4" />}
            onClick={() => setDevice('desktop')}
          >
            Kompyuter
          </Button>
          <Button
            size="sm"
            variant={device === 'phone' ? 'secondary' : 'outline'}
            icon={<Smartphone className="size-4" />}
            onClick={() => setDevice('phone')}
          >
            Telefon
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={fillCorrect}>
            Hammasini to‘g‘ri belgilash
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAnswers({})}>
            Tozalash
          </Button>
        </div>
        <div
          className={cn(
            'mx-auto space-y-3 rounded-2xl bg-slate-100 p-3',
            device === 'phone' ? 'max-w-[380px]' : 'max-w-full',
          )}
        >
          {test.instructions && <Alert tone="info">{test.instructions}</Alert>}
          {questions.map((question) => (
            <section key={question.testQuestionId} className="rounded-xl border border-slate-200 bg-surface p-4">
              <div className="flex justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700">
                  {question.number}-savol / {questions.length}
                </span>
                <span>{formatPoints(question.points)} ball</span>
              </div>
              <p
                className={cn('mt-2 whitespace-pre-wrap text-slate-900', device === 'phone' ? 'text-base' : 'text-lg')}
              >
                {question.stem}
              </p>
              <div className="mt-3 space-y-2">
                {question.options.map((option, index) => {
                  const selected = answers[question.testQuestionId] === option.id;
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-lg border-2 px-3 py-2 text-sm',
                        selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200',
                      )}
                    >
                      <input
                        type="radio"
                        name={`preview-${question.testQuestionId}`}
                        checked={selected}
                        onChange={() => setAnswers((current) => ({ ...current, [question.testQuestionId]: option.id }))}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="mr-1 font-semibold text-slate-500">{LETTERS[index]})</span>
                        {option.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border border-slate-200 bg-surface p-4">
          <p className="text-sm font-semibold text-slate-800">Namunaviy baholash</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight tabular">
            {formatPercent(pairPercent(grade.total))}
          </p>
          <p className="text-sm text-slate-500 tabular">
            {formatPoints(grade.total.earned)} / {formatPoints(grade.total.max)} ball
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {categoryEntries(grade.categories).map(([category, pair]) => (
              <li key={category} className="flex justify-between gap-2">
                <span>{CATEGORY_LABELS[category]}</span>
                <span className="tabular text-slate-600">
                  {formatPoints(pair.earned)}/{formatPoints(pair.max)} · {formatPercent(pairPercent(pair))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Umumiy foiz = barcha olingan ballar / barcha maksimal ballar × 100. Javob belgilanmagan savol 0 ball oladi.
          </p>
        </div>
      </aside>
    </div>
  );
}
