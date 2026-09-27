'use client';

import { useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS, blueprintTotals, draftTotals, formatPoints } from '@ijod/shared';
import { CategoryBadge } from '@/components/status';
import { Alert } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import type { TestDetail, TestQuestionView } from '@/lib/types';
import { testApi, useTestMutation } from './use-test';

const LETTERS = 'ABCDEFGHIJ';

function PointsInput({
  test,
  question,
  readOnly,
}: {
  test: TestDetail;
  question: TestQuestionView;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(String(question.points));
  const update = useTestMutation(test.id, testApi.updateQuestion(test.id), 'Ball saqlandi.');
  const commit = () => {
    const points = Number(value.replace(',', '.'));
    if (!Number.isFinite(points) || points === question.points) return;
    update.mutate({ testQuestionId: question.testQuestionId, points });
  };
  return (
    <Input
      type="number"
      min={0.5}
      step="0.5"
      className="w-24"
      value={value}
      disabled={readOnly || update.isPending}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
      aria-label={`${question.number}-savol balli`}
    />
  );
}

/** 4-bosqich: baholash — kategoriya, maksimal ball, javob kaliti va izoh. */
export function GradingStep({ test, readOnly }: { test: TestDetail; readOnly: boolean }) {
  const questions = test.version?.questions ?? [];
  const planned = blueprintTotals(test.version?.blueprint);
  const actual = draftTotals(questions);
  return (
    <div className="space-y-4">
      <Alert tone="info">
        Birinchi relizda: to‘g‘ri javob — to‘liq ball, noto‘g‘ri yoki bo‘sh javob — 0 ball. Ballni o‘zgartirish uchun
        qiymatni kiriting va maydondan chiqing.
      </Alert>
      <Table caption="Baholash jadvali">
        <THead>
          <tr>
            <TH>№</TH>
            <TH>Savol</TH>
            <TH>Kategoriya</TH>
            <TH>Maks. ball</TH>
            <TH>Kalit</TH>
            <TH>Izoh</TH>
          </tr>
        </THead>
        <tbody>
          {questions.map((question) => {
            const keyIndex = question.options.findIndex((option) => option.id === question.correctOptionId);
            return (
              <TR key={question.testQuestionId}>
                <TD className="tabular">{question.number}</TD>
                <TD className="max-w-md">
                  <span className="line-clamp-2">{question.stem}</span>
                </TD>
                <TD>
                  <CategoryBadge category={question.category} />
                </TD>
                <TD>
                  <PointsInput
                    key={`${question.testQuestionId}-${question.points}`}
                    test={test}
                    question={question}
                    readOnly={readOnly}
                  />
                </TD>
                <TD className="font-semibold">
                  {keyIndex >= 0 ? LETTERS[keyIndex] : <span className="text-red-600">yo‘q</span>}
                </TD>
                <TD className="text-slate-500">{question.explanation ? 'bor' : '—'}</TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      <div className="grid gap-3 sm:grid-cols-3">
        {CATEGORIES.map((category) => {
          const plan = planned.perCategory[category];
          const fact = actual.perCategory[category];
          if (!plan && !fact) return null;
          const mismatch = Boolean(plan && fact && Math.round(plan.points * 100) !== Math.round(fact.points * 100));
          return (
            <div key={category} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="font-medium">{CATEGORY_LABELS[category]}</p>
              <p className="mt-1 tabular text-slate-600">
                Testda: {fact ? `${fact.count} ta · ${formatPoints(fact.points)} ball` : '—'}
              </p>
              <p className={mismatch ? 'tabular text-amber-700' : 'tabular text-slate-500'}>
                Rejada: {plan ? `${plan.count} ta · ${formatPoints(plan.points)} ball` : '—'}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-sm font-medium text-slate-700 tabular">Jami maksimal ball: {formatPoints(actual.points)}</p>
    </div>
  );
}
