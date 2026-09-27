'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Clock, ListChecks, Maximize2, RotateCcw, Timer } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ATTEMPT_POLICY_LABELS,
  PARTICIPATION_STATUS_LABELS,
  SCORE_VISIBILITY_LABELS,
  formatDateTime,
  formatPoints,
} from '@ijod/shared';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen } from '@/components/attempt/fullscreen';
import { SessionStateBadge } from '@/components/status';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Alert, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { forgetAccessCode, recallAccessCode, tabClientId } from '@/lib/attempt-storage';
import type { SessionPreview } from '@/lib/types';

/**
 * To‘liq ekran so‘rovi tugma bosilishining o‘zida yuboriladi (brauzer talabi) — shunda test
 * sahifasida qayta so‘ralmaydi. Rad etilsa, test sahifasi o‘zi so‘raydi.
 */
function requestFullscreen() {
  if (fullscreenSupported() && !isFullscreen()) enterFullscreen().catch(() => undefined);
}

function Rule({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-brand-600">{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}

export default function SessionPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [code, setCode] = useState(() => (typeof window === 'undefined' ? '' : recallAccessCode(id)));
  const [agreed, setAgreed] = useState(false);
  const query = useQuery({
    queryKey: ['me', 'sessions', id],
    queryFn: () => api.get<SessionPreview>(`/me/sessions/${id}`),
    refetchInterval: 30_000,
  });

  const start = useMutation({
    mutationFn: () => api.post<{ attemptId: string }>(`/me/sessions/${id}/start`, { code, clientId: tabClientId() }),
    onSuccess: ({ attemptId }) => {
      forgetAccessCode(id);
      router.push(`/attempt/${attemptId}`);
    },
    // Test boshlanmadi — to‘liq ekrandan chiqib, xatoni ko‘rsatamiz.
    onError: () => exitFullscreen(),
  });

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const session = query.data;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (code.length < 4 || !agreed) return;
    if (session.requireFullscreen) requestFullscreen();
    start.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={
          <Link href="/student" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" /> Bosh sahifa
          </Link>
        }
        title={session.title}
        description={session.subject.name}
        actions={<SessionStateBadge state={session.state} />}
      />

      <Card>
        <CardHeader title="Test qoidalari" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Rule icon={<Timer className="size-4" />} label="Davomiylik" value={`${session.durationMinutes} daqiqa`} />
          <Rule
            icon={<ListChecks className="size-4" />}
            label="Savollar"
            value={`${session.questionCount} ta, jami ${formatPoints(session.totalPoints)} ball`}
          />
          <Rule
            icon={<CalendarClock className="size-4" />}
            label="Test ochiq"
            value={`${formatDateTime(session.startsAt)} – ${formatDateTime(session.endsAt)}`}
          />
          <Rule
            icon={<Clock className="size-4" />}
            label="Boshlash muddati"
            value={formatDateTime(session.entryClosesAt)}
          />
          <Rule
            icon={<RotateCcw className="size-4" />}
            label="Urinishlar"
            value={`${session.attemptsUsed} / ${session.maxAttempts}${session.maxAttempts > 1 ? ` · ${ATTEMPT_POLICY_LABELS[session.attemptPolicy]}` : ''}`}
          />
          <Rule
            icon={<ListChecks className="size-4" />}
            label="Natija"
            value={SCORE_VISIBILITY_LABELS[session.scoreVisibility]}
          />
          {session.requireFullscreen && (
            <Rule icon={<Maximize2 className="size-4" />} label="Nazorat" value="To‘liq ekran rejimi" />
          )}
        </CardBody>
        <CardBody className="space-y-2 border-t border-slate-100 text-sm text-slate-600">
          <ul className="list-disc space-y-1 pl-5">
            <li>Vaqt testni boshlaganingizdan hisoblanadi; kech boshlasangiz, test yopilish vaqtida tugaydi.</li>
            <li>
              Javoblar avtomatik saqlanadi. Sahifa yangilansa yoki internet uzilsa, saqlangan javoblar yo‘qolmaydi.
            </li>
            <li>Test bir vaqtda faqat bitta qurilmada ochiladi.</li>
            {session.requireFullscreen && (
              <li className="font-medium text-amber-700">
                Test to‘liq ekranda o‘tkaziladi. To‘liq ekrandan chiqsangiz yoki boshqa oyna/ilovaga o‘tsangiz, test
                avtomatik to‘xtatiladi va faqat o‘qituvchi ruxsati bilan davom etadi.
                {!fullscreenSupported() &&
                  ' Bu qurilmada to‘liq ekran rejimi yo‘q — test sahifasidan chiqmang, boshqa ilova yoki oynaga o‘tmang.'}
              </li>
            )}
            {!session.allowBackNavigation && (
              <li className="font-medium text-amber-800">Oldingi savollarga qaytib bo‘lmaydi.</li>
            )}
            <li>Vaqt tugaganda javoblaringiz avtomatik topshiriladi.</li>
          </ul>
          {session.instructions && (
            <p className="rounded-md bg-slate-50 p-3 whitespace-pre-wrap text-slate-700">{session.instructions}</p>
          )}
        </CardBody>
      </Card>

      {session.inProgressAttemptId ? (
        <Card>
          <CardBody className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-slate-700">
              Siz bu testni boshlagansiz. Davom ettirish uchun kod talab qilinmaydi.
            </p>
            <ButtonLink
              href={`/attempt/${session.inProgressAttemptId}`}
              size="lg"
              onClick={() => {
                if (session.requireFullscreen) requestFullscreen();
              }}
            >
              Davom ettirish
            </ButtonLink>
          </CardBody>
        </Card>
      ) : session.canStart ? (
        <Card>
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-4">
              {start.isError && <Alert tone="danger">{errorMessage(start.error)}</Alert>}
              <Field label="Test kodi" hint="Kodni o‘qituvchi aytadi. Kod faqat shu test uchun amal qiladi.">
                <Input
                  className="h-12 max-w-xs text-lg font-semibold tracking-[0.3em] uppercase"
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
                />
              </Field>
              <Checkbox
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                label="Qoidalar bilan tanishdim, testni boshlashga tayyorman"
              />
              <Button type="submit" size="lg" loading={start.isPending} disabled={code.length < 4 || !agreed}>
                Testni boshlash
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : (
        <Alert tone="warning" title="Testni hozir boshlab bo‘lmaydi">
          {session.blockedReason}
        </Alert>
      )}

      {session.attempts.length > 0 && (
        <Card>
          <CardHeader title="Urinishlaringiz" />
          <CardBody className="py-0">
            <ul className="divide-y divide-slate-100">
              {session.attempts.map((attempt) => (
                <li key={attempt.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    {attempt.attemptNo}-urinish · {PARTICIPATION_STATUS_LABELS[attempt.status]}
                  </span>
                  <span className="text-slate-500">{formatDateTime(attempt.submittedAt ?? attempt.startedAt)}</span>
                  {attempt.status !== 'IN_PROGRESS' && (
                    <Link
                      href={`/student/results/${attempt.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      Natija
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
