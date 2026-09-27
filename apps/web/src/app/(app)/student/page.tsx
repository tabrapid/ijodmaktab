'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, ClipboardCheck, FolderHeart, KeyRound, Timer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PORTFOLIO_STATUSES, formatHumanDateTime, formatPercent, formatPoints } from '@ijod/shared';
import { PortfolioStatusBadge, SessionStateBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { rememberAccessCode } from '@/lib/attempt-storage';
import type { MyResultItem, Page, PortfolioItemView, StudentSessionItem } from '@/lib/types';

function EnterCode() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const find = useMutation({
    mutationFn: (value: string) => api.post<{ sessionId: string }>('/me/sessions/find-by-code', { code: value }),
    onSuccess: ({ sessionId }) => {
      rememberAccessCode(sessionId, code);
      router.push(`/student/sessions/${sessionId}`);
    },
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (code.trim().length >= 4) find.mutate(code.trim());
  };
  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50 to-surface">
      <CardBody className="py-5">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="access-code" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <KeyRound className="size-4 text-brand-600" aria-hidden />
              Kodni kiritish
            </label>
            <p className="mt-0.5 text-xs text-slate-500">O‘qituvchi aytgan test kodini kiriting.</p>
            <Input
              id="access-code"
              className="mt-2 h-12 text-center text-lg font-semibold tracking-[0.3em] uppercase sm:text-left"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 12),
                )
              }
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="MASALAN: KV2026"
              aria-describedby={find.isError ? 'code-error' : undefined}
            />
          </div>
          <Button type="submit" size="lg" loading={find.isPending} disabled={code.length < 4}>
            Davom etish
          </Button>
        </form>
        {find.isError && (
          <p id="code-error" className="mt-2 text-sm font-medium text-red-600">
            {errorMessage(find.error)}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function SessionRow({ item }: { item: StudentSessionItem }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{item.title}</p>
          <SessionStateBadge state={item.state} />
          {item.inProgressAttemptId && <Badge tone="blue">Boshlangan</Badge>}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span>{item.subject.name}</span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden />
            {formatHumanDateTime(item.startsAt)} – {formatHumanDateTime(item.endsAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3.5" aria-hidden />
            {item.durationMinutes} daqiqa · {item.questionCount} ta savol
          </span>
        </p>
      </div>
      {item.inProgressAttemptId ? (
        <ButtonLink href={`/attempt/${item.inProgressAttemptId}`} size="sm">
          Davom ettirish
        </ButtonLink>
      ) : (
        <ButtonLink
          href={`/student/sessions/${item.sessionId}`}
          size="sm"
          variant={item.canStart ? 'primary' : 'outline'}
        >
          {item.canStart ? 'Ochish' : 'Batafsil'}
        </ButtonLink>
      )}
    </li>
  );
}

export default function StudentHome() {
  const { data: me } = useMe();
  const sessions = useQuery({
    queryKey: ['me', 'sessions'],
    queryFn: () => api.get<StudentSessionItem[]>('/me/sessions'),
    refetchInterval: 30_000,
  });
  const results = useQuery({ queryKey: ['me', 'results'], queryFn: () => api.get<MyResultItem[]>('/me/results') });
  const portfolio = useQuery({
    queryKey: ['portfolio', 'mine', 'summary'],
    queryFn: () => api.get<Page<PortfolioItemView>>('/portfolio?pageSize=200'),
  });

  const active = (sessions.data ?? []).filter((item) => item.state === 'OPEN' || item.state === 'SCHEDULED');
  const counts = Object.fromEntries(PORTFOLIO_STATUSES.map((status) => [status, 0])) as Record<
    (typeof PORTFOLIO_STATUSES)[number],
    number
  >;
  for (const item of portfolio.data?.items ?? []) counts[item.status] += 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Salom, ${me?.firstName ?? ''}!`}
        description="Yaqinlashayotgan testlar, natijalar va portfolio holati."
      />

      <EnterCode />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Testlarim" description="Ochiq va rejalashtirilgan nazorat ishlari" />
          <CardBody className="py-0">
            {sessions.isPending ? (
              <PageLoader />
            ) : sessions.isError ? (
              <div className="py-4">
                <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
              </div>
            ) : active.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Hozircha testlar yo‘q"
                description="Yangi test tayinlanganda shu yerda va bildirishnomalarda ko‘rinadi."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {active.map((item) => (
                  <SessionRow key={item.sessionId} item={item} />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Portfolio"
            actions={
              <Link href="/portfolio" className="text-sm font-medium text-brand-700 hover:underline">
                Ochish
              </Link>
            }
          />
          <CardBody>
            {portfolio.isPending ? (
              <PageLoader />
            ) : (
              <ul className="space-y-2">
                {PORTFOLIO_STATUSES.map((status) => (
                  <li key={status} className="flex items-center justify-between text-sm">
                    <PortfolioStatusBadge status={status} />
                    <span className="font-semibold tabular">{counts[status]}</span>
                  </li>
                ))}
              </ul>
            )}
            <ButtonLink
              href="/portfolio?new=1"
              variant="secondary"
              size="sm"
              className="mt-4 w-full"
              icon={<FolderHeart className="size-4" />}
            >
              Yutuq qo‘shish
            </ButtonLink>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="So‘nggi natijalar"
          actions={
            <Link
              href="/student/results"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
            >
              Barchasi <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
        <CardBody className="py-0">
          {results.isPending ? (
            <PageLoader />
          ) : results.isError ? (
            <div className="py-4">
              <ErrorState error={results.error} />
            </div>
          ) : results.data.length === 0 ? (
            <EmptyState title="Natijalar hali yo‘q" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.data.slice(0, 5).map((item) => (
                <li key={item.attemptId} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/student/results/${item.attemptId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {item.subject.name} · {formatHumanDateTime(item.submittedAt)}
                    </p>
                  </div>
                  {item.scoreVisible ? (
                    <div className="text-right">
                      <p className="text-lg font-semibold tabular">{formatPercent(item.percent ?? null)}</p>
                      <p className="text-xs text-slate-500 tabular">
                        {formatPoints(item.score)} / {formatPoints(item.maxScore)} ball
                      </p>
                    </div>
                  ) : (
                    <Badge tone="gray">Natija e’lon qilinmagan</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {sessions.data?.some((item) => item.state === 'CLOSED' && !item.lastAttempt) && (
        <Alert tone="warning" title="Qatnashilmagan testlar bor">
          Ba’zi yopilgan testlarda qatnashmagansiz. Sababi bo‘lsa, o‘qituvchingizga murojaat qiling.
        </Alert>
      )}
    </div>
  );
}
