'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Library, SearchX, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { QUESTION_TYPE_LABELS, formatHumanDateTime, formatPoints, normalizeForSearch } from '@ijod/shared';
import { RequireRole } from '@/components/app-shell';
import { CategoryBadge, DifficultyBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { QuestionItem, Ref } from '@/lib/types';

type Decision = 'approve' | 'reject';

interface PendingDecision {
  question: QuestionItem;
  decision: Decision;
}

const REQUESTS_KEY = ['questions', 'school-requests'] as const;

function QuestionCard({
  question,
  onDecide,
  disabled,
}: {
  question: QuestionItem;
  onDecide: (decision: Decision) => void;
  disabled: boolean;
}) {
  const latest = question.latest;
  return (
    <li>
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {question.subject.name}
              {question.gradeLevel !== null && <Badge tone="brand">{question.gradeLevel}-sinf</Badge>}
            </span>
          }
          description={
            <>
              Mavzu: {question.topic ?? 'ko‘rsatilmagan'} · Muallif: {question.owner.fullName}
              <span className="block text-xs">
                So‘rov yuborilgan: {formatHumanDateTime(question.schoolRequestedAt)}
              </span>
            </>
          }
          actions={
            latest && (
              <>
                <CategoryBadge category={latest.category} />
                <DifficultyBadge difficulty={latest.difficulty} />
                <Badge tone="gray">{formatPoints(latest.points)} ball</Badge>
              </>
            )
          }
        />
        <CardBody className="space-y-4">
          {latest ? (
            <>
              <p className="whitespace-pre-wrap text-slate-900">{latest.stem}</p>
              <ol className="space-y-2" aria-label="Javob variantlari">
                {latest.options.map((option, index) => {
                  const correct = option.id === latest.correctOptionId;
                  return (
                    <li
                      key={option.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border px-3 py-2 text-sm',
                        correct ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          correct ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600',
                        )}
                        aria-hidden
                      >
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className="min-w-0 flex-1 whitespace-pre-wrap text-slate-800">
                        <span className="sr-only">{String.fromCharCode(65 + index)}) </span>
                        {option.text}
                      </span>
                      {correct && (
                        <span className="shrink-0 text-xs font-semibold text-emerald-700">✓ to‘g‘ri javob</span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {latest.explanation && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-slate-700">Izoh</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{latest.explanation}</p>
                </div>
              )}
              <p className="text-xs text-slate-500">
                {QUESTION_TYPE_LABELS[latest.type]} · {latest.versionNo}-versiya
              </p>
            </>
          ) : (
            <Alert tone="warning">Savol matni topilmadi.</Alert>
          )}
          {question.tags.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Teglar">
              {question.tags.map((tag) => (
                <Badge key={tag} tone="gray">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            {question.isMine && (
              <p className="mr-auto text-sm text-slate-500">
                O‘z savolingiz — qarorni boshqa metodik tekshiruvchi qabul qiladi.
              </p>
            )}
            <Button
              variant="outline"
              onClick={() => onDecide('reject')}
              disabled={disabled || question.isMine}
              icon={<X className="size-4" aria-hidden />}
            >
              Rad etish
            </Button>
            <Button
              onClick={() => onDecide('approve')}
              disabled={disabled || question.isMine}
              icon={<Check className="size-4" aria-hidden />}
            >
              Maktab bankiga chiqarish
            </Button>
          </div>
        </CardBody>
      </Card>
    </li>
  );
}

function SchoolRequests() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [reason, setReason] = useState('');

  const requests = useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: () => api.get<QuestionItem[]>('/questions/school-requests'),
  });

  const decide = useMutation({
    mutationFn: ({ question, decision }: PendingDecision) =>
      decision === 'approve'
        ? api.post<{ ok: boolean }>(`/questions/${question.id}/approve-school`)
        : api.post<{ ok: boolean }>(`/questions/${question.id}/reject-school`, { reason: reason.trim() || undefined }),
    onSuccess: (_result, { decision }) =>
      toast.success(
        decision === 'approve'
          ? 'Savol maktab bankiga chiqarildi — endi barcha o‘qituvchilar undan foydalana oladi.'
          : 'So‘rov rad etildi. Savol muallifning shaxsiy bankida qoladi.',
      ),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => {
      setPending(null);
      setReason('');
      return queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });

  const subjects = useMemo(() => {
    const map = new Map<string, Ref>();
    for (const question of requests.data ?? []) map.set(question.subject.id, question.subject);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'uz'));
  }, [requests.data]);

  const needle = normalizeForSearch(search);
  const items = useMemo(
    () =>
      (requests.data ?? []).filter((question) => {
        if (subjectId && question.subject.id !== subjectId) return false;
        if (!needle) return true;
        const text = [
          question.subject.name,
          question.topic,
          question.owner.fullName,
          question.latest?.stem,
          ...question.tags,
        ]
          .filter(Boolean)
          .join(' ');
        return normalizeForSearch(text).includes(needle);
      }),
    [requests.data, subjectId, needle],
  );

  const approving = pending?.decision === 'approve';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maktab banki so‘rovlari"
        description="O‘qituvchilar maktab savollar bankiga chiqarishni so‘ragan savollar. Chiqarilgan savol barcha o‘qituvchilarga ko‘rinadi va testlarda ishlatiladi."
      />

      {requests.isPending ? (
        <PageLoader />
      ) : requests.isError ? (
        <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
      ) : requests.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Library}
            title="Yangi so‘rovlar yo‘q"
            description="O‘qituvchi savolni maktab bankiga chiqarishni so‘raganda shu yerda paydo bo‘ladi."
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardBody className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
              <Field label="Qidirish">
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Savol matni, mavzu, muallif yoki teg…"
                />
              </Field>
              <Field label="Fan">
                <Select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                  <option value="">Barcha fanlar</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="pb-2 text-sm text-slate-600" aria-live="polite">
                So‘rovlar: <span className="font-semibold tabular">{requests.data.length}</span>
                {items.length !== requests.data.length && ` · ko‘rsatilmoqda: ${items.length}`}
              </p>
            </CardBody>
          </Card>

          {items.length === 0 ? (
            <Card>
              <EmptyState
                icon={SearchX}
                title="Mos savol topilmadi"
                description="Qidiruv so‘zini yoki fan filtrini o‘zgartiring."
              />
            </Card>
          ) : (
            <ul className="space-y-4">
              {items.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  disabled={decide.isPending}
                  onDecide={(decision) => setPending({ question, decision })}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => {
          setPending(null);
          setReason('');
        }}
        onConfirm={() => pending && decide.mutate(pending)}
        loading={decide.isPending}
        tone={approving ? 'primary' : 'danger'}
        title={approving ? 'Maktab bankiga chiqarish' : 'So‘rovni rad etish'}
        confirmLabel={approving ? 'Chiqarish' : 'Rad etish'}
      >
        {approving ? (
          <>
            Savol maktab bankiga chiqariladi va barcha o‘qituvchilar uni o‘z testlarida ishlata oladi. Muallif:{' '}
            <span className="font-medium text-slate-800">{pending?.question.owner.fullName}</span> — unga bildirishnoma
            yuboriladi.
          </>
        ) : (
          <div className="space-y-3">
            <p>
              So‘rov rad etiladi, savol muallifning shaxsiy bankida qoladi va keyinroq qayta so‘ralishi mumkin.
              Muallifga sabab bilan bildirishnoma yuboriladi.
            </p>
            <Field label="Sabab" hint="Muallif tuzatishi uchun qisqa izoh (ixtiyoriy)">
              <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
            </Field>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

export default function SchoolQuestionRequestsPage() {
  return (
    <RequireRole roles={['DEPUTY', 'SUPER_ADMIN']}>
      <SchoolRequests />
    </RequireRole>
  );
}
