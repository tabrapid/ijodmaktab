'use client';

import { useMutation } from '@tanstack/react-query';
import {
  BarChart3,
  Copy,
  Eye,
  Maximize2,
  Megaphone,
  Play,
  RefreshCw,
  SearchCheck,
  Square,
  TimerReset,
  XCircle,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  ATTEMPT_POLICY_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  REVIEW_VISIBILITY_LABELS,
  SCORE_VISIBILITY_LABELS,
  dateToSchoolInput,
  formatDateTime,
  formatHumanDateTime,
  formatPercent,
  formatPoints,
  schoolInputToDate,
} from '@ijod/shared';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/form';
import { ProgressBar } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import type { SessionDetail } from '@/lib/types';
import { useRefreshSession } from './use-session';

type Action = 'start' | 'close' | 'publish' | 'review';

const ACTION_TEXT: Record<Action, { path: string; done: string }> = {
  start: { path: 'start', done: 'Sessiya boshlandi. Endi kodni o‘quvchilarga ayting.' },
  close: { path: 'close', done: 'Sessiya yopildi. Ishlayotganlarning saqlangan javoblari baholandi.' },
  publish: { path: 'publish-results', done: 'Natijalar o‘quvchilarga e’lon qilindi.' },
  review: { path: 'open-review', done: 'To‘g‘ri javoblar va izohlar o‘quvchilarga ochildi.' },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[14rem_1fr]">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function AccessCodeCard({ session }: { session: SessionDetail }) {
  const toast = useToast();
  const refresh = useRefreshSession(session.id);
  const [projecting, setProjecting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const rotate = useMutation({
    mutationFn: () => api.post<SessionDetail>(`/sessions/${session.id}/rotate-code`),
    onSuccess: async () => {
      toast.success('Yangi kod yaratildi. Eski kod bilan endi kirib bo‘lmaydi.');
      setRotating(false);
      await refresh();
    },
    onError: (error) => {
      setRotating(false);
      toast.error(errorMessage(error));
    },
  });
  if (!session.accessCode) return null;
  const finished = session.state === 'CLOSED' || session.state === 'CANCELLED';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(session.accessCode ?? '');
      toast.success('Kod nusxalandi.');
    } catch {
      toast.error('Nusxalab bo‘lmadi — kodni qo‘lda yozib oling.');
    }
  };
  return (
    <Card>
      <CardHeader
        title="Kirish kodi"
        description="Kodni test boshlanganda sinfda ayting yoki ekranga chiqaring. U bildirishnomalarda yuborilmaydi."
      />
      <CardBody className="space-y-4">
        <p
          className="text-center font-mono text-5xl font-bold tracking-[0.25em] text-slate-900"
          aria-label={`Kirish kodi: ${session.accessCode.split('').join(' ')}`}
        >
          {session.accessCode}
        </p>
        {session.accessCodeRotatedAt && (
          <p className="text-center text-xs text-slate-500">
            Oxirgi marta almashtirilgan: {formatDateTime(session.accessCodeRotatedAt)}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" icon={<Copy className="size-4" />} onClick={copy}>
            Nusxalash
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<Maximize2 className="size-4" />}
            onClick={() => setProjecting(true)}
          >
            Ekranga chiqarish
          </Button>
          {session.canManage && !finished && (
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="size-4" />}
              onClick={() => setRotating(true)}
            >
              Kodni almashtirish
            </Button>
          )}
        </div>
      </CardBody>
      <Dialog open={projecting} onClose={() => setProjecting(false)} title={session.title} size="xl">
        <div className="py-10 text-center">
          <p className="text-lg text-slate-500">Kirish kodi</p>
          <p className="mt-4 font-mono text-8xl font-bold tracking-[0.25em] text-slate-900 sm:text-9xl">
            {session.accessCode}
          </p>
          <p className="mt-6 text-slate-500">Bosh sahifada “Kod bilan kirish” maydoniga kiriting.</p>
        </div>
      </Dialog>
      <ConfirmDialog
        open={rotating}
        onClose={() => setRotating(false)}
        onConfirm={() => rotate.mutate()}
        loading={rotate.isPending}
        title="Kirish kodini almashtirasizmi?"
        confirmLabel="Almashtirish"
      >
        Eski kod bilan yangi kirish mumkin bo‘lmaydi. Boshlangan urinishlar davom etadi.
      </ConfirmDialog>
    </Card>
  );
}

function TimingDialog({ session, open, onClose }: { session: SessionDetail; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshSession(session.id);
  const scheduled = session.state === 'SCHEDULED';
  const [values, setValues] = useState(() => ({
    startsAt: dateToSchoolInput(session.startsAt),
    endsAt: dateToSchoolInput(session.endsAt),
    entryClosesAt: session.entryClosesAt ? dateToSchoolInput(session.entryClosesAt) : '',
    durationMinutes: String(session.durationMinutes),
    reason: '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      api.put(`/sessions/${session.id}/timing`, {
        ...(scheduled
          ? {
              startsAt: schoolInputToDate(values.startsAt).toISOString(),
              durationMinutes: Number(values.durationMinutes),
            }
          : {}),
        endsAt: schoolInputToDate(values.endsAt).toISOString(),
        entryClosesAt: values.entryClosesAt ? schoolInputToDate(values.entryClosesAt).toISOString() : null,
        reason: values.reason.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success('Vaqt o‘zgartirildi. O‘quvchilarga bildirishnoma yuborildi.');
      await refresh();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors) setErrors(error.fieldErrors);
      toast.error(errorMessage(error));
    },
  });
  const set = (patch: Partial<typeof values>) => setValues((current) => ({ ...current, ...patch }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Vaqtni o‘zgartirish"
      description={
        scheduled ? undefined : 'Sessiya boshlangan: faqat yopilish va kirish muddatini o‘zgartirish mumkin.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {scheduled && (
          <Field label="Boshlanish" required error={errors.startsAt}>
            <Input
              type="datetime-local"
              value={values.startsAt}
              onChange={(event) => set({ startsAt: event.target.value })}
            />
          </Field>
        )}
        <Field label="Yopilish" required error={errors.endsAt}>
          <Input
            type="datetime-local"
            value={values.endsAt}
            onChange={(event) => set({ endsAt: event.target.value })}
          />
        </Field>
        <Field label="Kirish muddati" hint="Bo‘sh — yopilishgacha kirish mumkin" error={errors.entryClosesAt}>
          <Input
            type="datetime-local"
            value={values.entryClosesAt}
            onChange={(event) => set({ entryClosesAt: event.target.value })}
          />
        </Field>
        {scheduled && (
          <Field label="Davomiylik (daqiqa)" required error={errors.durationMinutes}>
            <Input
              type="number"
              min={1}
              max={600}
              value={values.durationMinutes}
              onChange={(event) => set({ durationMinutes: event.target.value })}
            />
          </Field>
        )}
        <Field label="Sabab" className="sm:col-span-2" hint="Audit jurnaliga yoziladi">
          <Textarea rows={2} value={values.reason} onChange={(event) => set({ reason: event.target.value })} />
        </Field>
      </div>
      {!scheduled && (
        <Alert tone="info" className="mt-4">
          Yopilish qisqartirilsa, ishlayotganlarning muddati ham qisqaradi; uzaytirilsa — yopilishga “kesilgan”
          urinishlar o‘z davomiyligigacha uzayadi.
        </Alert>
      )}
    </Dialog>
  );
}

function CancelSessionDialog({
  session,
  open,
  onClose,
}: {
  session: SessionDetail;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefreshSession(session.id);
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => api.post(`/sessions/${session.id}/cancel`, { reason: reason.trim() }),
    onSuccess: async () => {
      toast.success('Sessiya bekor qilindi.');
      await refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sessiyani bekor qilish"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Ortga
          </Button>
          <Button
            variant="danger"
            onClick={() => cancel.mutate()}
            loading={cancel.isPending}
            disabled={reason.trim().length < 3}
          >
            Bekor qilish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning">
          Ishlayotgan barcha urinishlar bekor qilinadi, natijalar hisoblanmaydi. O‘quvchilarga sabab bilan bildirishnoma
          yuboriladi. Bu amalni ortga qaytarib bo‘lmaydi.
        </Alert>
        <Field label="Sabab" required>
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Sessiya holatiga qarab boshqaruv tugmalari. */
export function SessionControls({ session }: { session: SessionDetail }) {
  const toast = useToast();
  const refresh = useRefreshSession(session.id);
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const run = useMutation({
    mutationFn: (action: Action) => api.post<SessionDetail>(`/sessions/${session.id}/${ACTION_TEXT[action].path}`),
    onSuccess: async (_data, action) => {
      toast.success(ACTION_TEXT[action].done);
      setConfirming(null);
      await refresh();
    },
    onError: (error) => {
      setConfirming(null);
      toast.error(errorMessage(error));
    },
  });

  if (!session.canManage || session.state === 'CANCELLED') return null;
  const canPublish = !session.resultsPublishedAt && session.scoreVisibility !== 'AFTER_SUBMIT';
  const canOpenReview = session.state === 'CLOSED' && session.reviewVisibility === 'MANUAL' && !session.reviewOpenedAt;

  const confirmText: Record<Action, { title: string; body: string; label: string; tone?: 'danger' }> = {
    start: {
      title: 'Sessiyani hozir boshlaysizmi?',
      body: 'Boshlanish vaqti hozirgi vaqtga o‘zgaradi va o‘quvchilar kod bilan kira oladi.',
      label: 'Boshlash',
    },
    close: {
      title: 'Sessiyani hozir yopasizmi?',
      body: `Yangi kirish to‘xtaydi. Hozir ishlayotgan ${session.inProgressCount} nafar o‘quvchining saqlangan javoblari bilan urinishi yakunlanadi va baholanadi.`,
      label: 'Yopish',
      tone: 'danger',
    },
    publish: {
      title: 'Natijalarni e’lon qilasizmi?',
      body: 'O‘quvchilar o‘z ballarini ko‘radi va bildirishnoma oladi. Qayta baholash keyin ham mumkin — o‘zgarish tarixda qoladi.',
      label: 'E’lon qilish',
    },
    review: {
      title: 'To‘g‘ri javoblarni ochasizmi?',
      body: 'O‘quvchilar o‘z javoblarini to‘g‘ri javoblar va izohlar bilan solishtira oladi.',
      label: 'Ochish',
    },
  };
  const current = confirming ? confirmText[confirming] : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {session.state === 'SCHEDULED' && (
          <Button icon={<Play className="size-4" />} onClick={() => setConfirming('start')}>
            Hozir boshlash
          </Button>
        )}
        {session.state === 'OPEN' && (
          <Button variant="danger" icon={<Square className="size-4" />} onClick={() => setConfirming('close')}>
            Hozir yopish
          </Button>
        )}
        {canPublish && (
          <Button
            variant={session.state === 'CLOSED' ? 'primary' : 'outline'}
            icon={<Megaphone className="size-4" />}
            onClick={() => setConfirming('publish')}
          >
            Natijalarni e’lon qilish
          </Button>
        )}
        {canOpenReview && (
          <Button variant="outline" icon={<Eye className="size-4" />} onClick={() => setConfirming('review')}>
            To‘g‘ri javoblarni ochish
          </Button>
        )}
        {session.state !== 'CLOSED' && (
          <Button variant="outline" icon={<TimerReset className="size-4" />} onClick={() => setEditingTime(true)}>
            Vaqtni o‘zgartirish
          </Button>
        )}
        <Button variant="ghost" icon={<XCircle className="size-4" />} onClick={() => setCancelling(true)}>
          Bekor qilish
        </Button>
      </div>
      <ConfirmDialog
        open={Boolean(current)}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && run.mutate(confirming)}
        loading={run.isPending}
        title={current?.title ?? ''}
        confirmLabel={current?.label}
        tone={current?.tone}
      >
        {current?.body}
      </ConfirmDialog>
      {editingTime && <TimingDialog session={session} open onClose={() => setEditingTime(false)} />}
      {cancelling && <CancelSessionDialog session={session} open onClose={() => setCancelling(false)} />}
    </>
  );
}

export function SessionOverview({ session }: { session: SessionDetail }) {
  const finishedShare = session.assignedCount ? (session.finishedCount / session.assignedCount) * 100 : null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {session.state === 'CANCELLED' && (
          <Alert tone="danger" title={`Sessiya bekor qilingan (${formatDateTime(session.cancelledAt)})`}>
            {session.cancelReason}
          </Alert>
        )}
        <Card>
          <CardHeader title="Jarayon" />
          <CardBody className="space-y-3">
            <ProgressBar
              percent={finishedShare}
              tone="brand"
              label={
                <>
                  <span>Yakunlaganlar</span>
                  <span className="tabular">
                    {session.finishedCount} / {session.assignedCount}
                  </span>
                </>
              }
            />
            <p className="text-sm text-slate-600">
              Hozir ishlamoqda: <span className="font-medium tabular">{session.inProgressCount}</span> nafar
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sessiya ma’lumotlari" />
          <CardBody>
            <dl className="divide-y divide-slate-100">
              <Row label="Test">
                {session.test.title} · {session.test.versionNo}-versiya · {session.test.questionCount} savol ·{' '}
                {formatPoints(session.test.totalPoints)} ball
              </Row>
              <Row label="Fan va sinflar">
                {session.subject.name} · {session.classes.map((item) => item.name).join(', ') || 'alohida o‘quvchilar'}
              </Row>
              <Row label="Boshlanish">{formatHumanDateTime(session.startsAt)}</Row>
              <Row label="Yopilish">{formatHumanDateTime(session.endsAt)}</Row>
              <Row label="Kirish muddati">
                {session.entryClosesAt ? formatHumanDateTime(session.entryClosesAt) : 'Yopilishgacha'}
              </Row>
              <Row label="Davomiylik">{session.durationMinutes} daqiqa (kech kirganga qolgan vaqt beriladi)</Row>
              <Row label="Urinishlar">
                {session.maxAttempts} ta · {ATTEMPT_POLICY_LABELS[session.attemptPolicy]}
                {session.retakeRule && <p className="text-slate-500">{session.retakeRule}</p>}
              </Row>
              <Row label="Tartib">
                {[
                  session.shuffleQuestions ? 'Savollar aralashtiriladi' : 'Savollar tartibi o‘zgarmaydi',
                  session.shuffleOptions ? 'variantlar aralashtiriladi' : 'variantlar tartibi o‘zgarmaydi',
                  session.allowBackNavigation ? 'orqaga qaytish mumkin' : 'orqaga qaytib bo‘lmaydi',
                ].join('; ')}
              </Row>
              <Row label="To‘liq ekran nazorati">
                <Badge tone={session.requireFullscreen ? 'green' : 'gray'}>
                  {session.requireFullscreen ? 'Yoqilgan' : 'O‘chirilgan'}
                </Badge>
                <p className="mt-1 text-slate-500">
                  {session.requireFullscreen
                    ? 'Test to‘liq ekranda ishlanadi. To‘liq ekrandan chiqqan yoki boshqa oyna/ilovaga o‘tgan o‘quvchining testi avtomatik to‘xtatiladi — “Jonli kuzatuv”da ruxsat berasiz.'
                    : 'Oynadan chiqish holatlari faqat signal sifatida qayd etiladi, test to‘xtatilmaydi.'}
                </p>
              </Row>
              <Row label="Ballni ko‘rsatish">
                {SCORE_VISIBILITY_LABELS[session.scoreVisibility]}
                {session.resultsPublishedAt && (
                  <p className="text-emerald-700">E’lon qilingan: {formatDateTime(session.resultsPublishedAt)}</p>
                )}
              </Row>
              <Row label="To‘g‘ri javoblar">
                {REVIEW_VISIBILITY_LABELS[session.reviewVisibility]}
                {session.reviewOpenedAt && (
                  <p className="text-emerald-700">Ochilgan: {formatDateTime(session.reviewOpenedAt)}</p>
                )}
              </Row>
              <Row label="Mezonlar">
                Kategoriya chegarasi {formatPercent(session.categoryThresholdPercent, 0)}
                {session.passPercent !== null && `; o‘tish chegarasi ${formatPercent(session.passPercent, 0)}`}
              </Row>
              <Row label="Kategoriyalar">
                {CATEGORIES.filter((category) => session.test.blueprint[category]?.count)
                  .map((category) => `${CATEGORY_LABELS[category]}: ${session.test.blueprint[category]!.count} ta`)
                  .join(', ') || 'Reja belgilanmagan'}
              </Row>
              <Row label="O‘tkazuvchi">{session.conductor.fullName}</Row>
              <Row label="Yaratgan">{session.createdBy.fullName}</Row>
              <Row label="Baholash versiyasi">{session.gradingVersion}</Row>
            </dl>
          </CardBody>
        </Card>
      </div>
      <div className="space-y-4">
        {session.state === 'SCHEDULED' || session.state === 'OPEN' ? (
          <AccessCodeCard session={session} />
        ) : session.state === 'CLOSED' ? (
          <Card>
            <CardHeader
              title="Sessiya yakunlangan"
              description="Kirish kodi endi ishlamaydi. Natijalar, tahlil va eksport tayyor."
            />
            <CardBody className="grid gap-2">
              <ButtonLink href="?tab=results" icon={<BarChart3 className="size-4" />}>
                Natijalarni ko‘rish
              </ButtonLink>
              <ButtonLink href="?tab=analysis" variant="outline" icon={<SearchCheck className="size-4" />}>
                Savollar tahlili
              </ButtonLink>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
