'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, RotateCcw, SearchCheck } from 'lucide-react';
import { useState } from 'react';
import {
  GRADING_OVERRIDE_MODES,
  GRADING_OVERRIDE_MODE_LABELS,
  formatPoints,
  type GradingOverrideMode,
} from '@ijod/shared';
import { CategoryBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Select, Textarea } from '@/components/ui/form';
import { RatioText } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { ResultQuestion, SessionDetail, SessionResults } from '@/lib/types';
import { useRefreshSession, useSessionResults } from './use-session';

const OVERRIDE_BADGE: Record<GradingOverrideMode, string> = {
  EXCLUDE: 'Hisobdan chiqarilgan',
  FULL_CREDIT: 'Hammaga to‘liq ball',
  CHANGE_KEY: 'Javob kaliti tuzatilgan',
};

type Stats = SessionResults['questionStats'][number];

function RegradeDialog({
  session,
  question,
  onClose,
}: {
  session: SessionDetail;
  question: ResultQuestion;
  onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefreshSession(session.id);
  const [mode, setMode] = useState<GradingOverrideMode>('EXCLUDE');
  const alternatives = question.options.filter((option) => option.id !== question.correctOptionId);
  const [correctOptionId, setCorrectOptionId] = useState(alternatives[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const regrade = useMutation({
    mutationFn: () =>
      api.post<{ revisionId: string; version: number; affectedCount: number }>(`/sessions/${session.id}/regrade`, {
        testQuestionId: question.testQuestionId,
        mode,
        correctOptionId: mode === 'CHANGE_KEY' ? correctOptionId : undefined,
        reason: reason.trim(),
      }),
    onSuccess: async (result) => {
      toast.success(
        `Qayta hisoblandi (baholash versiyasi ${result.version}). Natijasi o‘zgargan o‘quvchilar: ${result.affectedCount}.`,
      );
      await refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${question.number}-savolni qayta baholash`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            onClick={() => regrade.mutate()}
            loading={regrade.isPending}
            disabled={reason.trim().length < 3 || (mode === 'CHANGE_KEY' && !correctOptionId)}
          >
            Qayta hisoblash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-800">{question.stem}</p>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">Siyosat</legend>
          {GRADING_OVERRIDE_MODES.map((item) => (
            <label
              key={item}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm has-checked:border-brand-400 has-checked:bg-brand-50/40"
            >
              <input
                type="radio"
                name="mode"
                value={item}
                checked={mode === item}
                onChange={() => setMode(item)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-slate-900">{GRADING_OVERRIDE_MODE_LABELS[item]}</span>
                <span className="block text-slate-500">
                  {item === 'EXCLUDE' && 'Savol hamma uchun maksimal balldan ham, olingan balldan ham chiqariladi.'}
                  {item === 'FULL_CREDIT' &&
                    'Savolni ko‘rgan barcha ishtirokchi (javob bermaganlar ham) to‘liq ball oladi.'}
                  {item === 'CHANGE_KEY' &&
                    'To‘g‘ri javob noto‘g‘ri belgilangan bo‘lsa — yangi to‘g‘ri variant bo‘yicha qayta tekshiriladi.'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {mode === 'CHANGE_KEY' && (
          <Field label="Yangi to‘g‘ri javob" required>
            <Select value={correctOptionId} onChange={(event) => setCorrectOptionId(event.target.value)}>
              {alternatives.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.letter}) {option.text}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Sabab" required hint="O‘quvchilarga bildirishnomada va baholash tarixida ko‘rinadi">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Masalan: savol shartida xato bor edi"
          />
        </Field>
        <Alert tone="warning">
          Barcha yakunlangan ishlar qayta hisoblanadi va yangi baholash versiyasi yaratiladi. Oldingi natijalar tarixda
          saqlanadi — izsiz o‘zgartirish bo‘lmaydi. Natijalari ochiq bo‘lsa, bali o‘zgargan o‘quvchilarga bildirishnoma
          yuboriladi.
        </Alert>
      </div>
    </Dialog>
  );
}

function OptionBars({ question, stats }: { question: ResultQuestion; stats: Stats }) {
  const effectiveCorrect =
    question.override?.mode === 'CHANGE_KEY' && question.override.correctOptionId
      ? question.override.correctOptionId
      : question.correctOptionId;
  const total = stats.responses;
  return (
    <ul className="space-y-1.5">
      {question.options.map((option) => {
        const count = stats.optionCounts[option.id] ?? 0;
        const share = total ? (count / total) * 100 : 0;
        const correct = option.id === effectiveCorrect;
        return (
          <li key={option.id} className="grid grid-cols-[1.5rem_1fr_5.5rem] items-center gap-2 text-sm">
            <span className="font-medium text-slate-500">{option.letter})</span>
            <div className="min-w-0">
              <p className={correct ? 'font-medium text-slate-900' : 'text-slate-700'}>
                {option.text}
                {correct && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700">
                    <Check className="size-3.5" aria-hidden />
                    to‘g‘ri javob
                  </span>
                )}
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100" aria-hidden>
                <div className="h-full rounded-full bg-[var(--color-viz-series)]" style={{ width: `${share}%` }} />
              </div>
            </div>
            <span className="text-right text-slate-600 tabular">
              {count} ta · {Math.round(share)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function QuestionAnalysis({ session }: { session: SessionDetail }) {
  const results = useSessionResults(session.id);
  const [regrading, setRegrading] = useState<ResultQuestion | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  if (results.isPending) return <PageLoader />;
  if (results.isError) return <ErrorState error={results.error} onRetry={() => results.refetch()} />;
  const { questions, questionStats } = results.data;
  const statsById = new Map(questionStats.map((item) => [item.questionId, item]));
  const flaggedCount = questionStats.filter((item) => item.needsReview).length;
  const visible = questions.filter((question) => !onlyFlagged || statsById.get(question.testQuestionId)?.needsReview);
  const canRegrade = session.canManage && session.state !== 'CANCELLED';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Tahlil yakunlangan ishlar bo‘yicha. “Tekshirish tavsiya etiladi” — savol avtomatik xato degani emas, uni
          ko‘rib chiqish kerak.
        </p>
        {flaggedCount > 0 && (
          <Button
            variant={onlyFlagged ? 'secondary' : 'outline'}
            size="sm"
            icon={<SearchCheck className="size-4" />}
            onClick={() => setOnlyFlagged((value) => !value)}
            aria-pressed={onlyFlagged}
          >
            Tekshirish tavsiya etilgan: {flaggedCount}
          </Button>
        )}
      </div>
      {session.inProgressCount > 0 && canRegrade && (
        <Alert tone="info">Qayta baholash barcha o‘quvchilar testni yakunlagandan so‘ng mumkin bo‘ladi.</Alert>
      )}
      {visible.length === 0 ? (
        <Card>
          <EmptyState title="Savollar yo‘q" />
        </Card>
      ) : (
        visible.map((question) => {
          const stats = statsById.get(question.testQuestionId);
          if (!stats) return null;
          return (
            <Card key={question.testQuestionId} className={stats.needsReview ? 'border-amber-300' : undefined}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{question.number}-savol</span>
                    <CategoryBadge category={question.category} />
                    <span className="text-sm text-slate-500">
                      {formatPoints(question.points)} ball
                      {question.points !== question.originalPoints &&
                        ` (asli ${formatPoints(question.originalPoints)})`}
                    </span>
                    {question.override && <Badge tone="violet">{OVERRIDE_BADGE[question.override.mode]}</Badge>}
                    {stats.needsReview && <Badge tone="amber">Tekshirish tavsiya etiladi</Badge>}
                  </div>
                  {canRegrade && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<RotateCcw className="size-3.5" />}
                      onClick={() => setRegrading(question)}
                      disabled={session.inProgressCount > 0}
                    >
                      Qayta baholash
                    </Button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap text-slate-800">{question.stem}</p>
                {stats.needsReview && (
                  <ul className="list-inside list-disc text-sm text-amber-800">
                    {stats.reviewReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
                  <OptionBars question={question} stats={stats} />
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">To‘g‘ri javob ulushi</dt>
                      <dd>
                        <RatioText ratio={stats.correctRate} />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">To‘g‘ri / noto‘g‘ri</dt>
                      <dd className="tabular">
                        {stats.correct} / {stats.wrong}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Javob bermagan</dt>
                      <dd className="tabular">{stats.blank}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Hisobga olingan ishlar</dt>
                      <dd className="tabular">{stats.responses}</dd>
                    </div>
                  </dl>
                </div>
              </CardBody>
            </Card>
          );
        })
      )}
      {regrading && <RegradeDialog session={session} question={regrading} onClose={() => setRegrading(null)} />}
    </div>
  );
}
