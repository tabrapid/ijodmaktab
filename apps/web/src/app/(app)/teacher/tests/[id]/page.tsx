'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Archive, ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Share2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { SHARE_PERMISSIONS, SHARE_PERMISSION_LABELS, formatDateTime, type SharePermission } from '@ijod/shared';
import { TestStatusBadge } from '@/components/status';
import { BlueprintStep } from '@/components/teacher/wizard/blueprint-step';
import { GradingStep } from '@/components/teacher/wizard/grading-step';
import { PassportStep } from '@/components/teacher/wizard/passport-step';
import { PreviewStep } from '@/components/teacher/wizard/preview-step';
import { QuestionsStep } from '@/components/teacher/wizard/questions-step';
import {
  AudienceStep,
  PublishStep,
  ResultPolicyStep,
  TimingStep,
  defaultSessionDraft,
  type SessionDraft,
} from '@/components/teacher/wizard/session-steps';
import { testKey, useTest } from '@/components/teacher/wizard/use-test';
import { ValidationStep } from '@/components/teacher/wizard/validation-step';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Alert, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { StaffItem, TestDetail } from '@/lib/types';

const STEPS = [
  { title: 'Pasport', hint: 'Nom, fan, sinf, mavzu' },
  { title: 'Tuzilma', hint: 'Kategoriyalar bo‘yicha reja' },
  { title: 'Savollar', hint: 'Yangi, bankdan, nusxa' },
  { title: 'Baholash', hint: 'Ball va kalitlar' },
  { title: 'Tekshiruv', hint: 'Xato va ogohlantirishlar' },
  { title: 'Oldindan ko‘rish', hint: 'O‘quvchi ko‘rinishi' },
  { title: 'Auditoriya', hint: 'Sinflar va o‘quvchilar' },
  { title: 'Vaqt va tartib', hint: 'Muddat, urinishlar' },
  { title: 'Natija siyosati', hint: 'Qachon e’lon qilinadi' },
  { title: 'Tasdiqlash va e’lon', hint: 'Sessiya va kod' },
];

const draftKey = (id: string) => `ijod:session-draft:${id}`;

function useSessionDraft(id: string) {
  const [draft, setDraft] = useState<SessionDraft>(() => {
    if (typeof window === 'undefined') return defaultSessionDraft();
    try {
      const stored = localStorage.getItem(draftKey(id));
      return stored
        ? { ...defaultSessionDraft(), ...(JSON.parse(stored) as Partial<SessionDraft>) }
        : defaultSessionDraft();
    } catch {
      return defaultSessionDraft();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(id), JSON.stringify(draft));
    } catch {
      // Brauzer xotirasi yopiq bo‘lsa — sozlamalar faqat shu sahifada saqlanadi.
    }
  }, [draft, id]);
  const reset = () => {
    try {
      localStorage.removeItem(draftKey(id));
    } catch {
      // ahamiyatsiz
    }
  };
  return { draft, update: (patch: Partial<SessionDraft>) => setDraft((current) => ({ ...current, ...patch })), reset };
}

function ShareDialog({ test, open, onClose }: { test: TestDetail; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [permission, setPermission] = useState<SharePermission>('VIEW');
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffItem[]>('/users/staff'), enabled: open });
  const onDone = (updated: TestDetail) => queryClient.setQueryData(testKey(test.id), updated);
  const share = useMutation({
    mutationFn: () => api.post<TestDetail>(`/tests/${test.id}/shares`, { userId, permission }),
    onSuccess: (updated) => {
      onDone(updated);
      setUserId('');
      toast.success('Test ulashildi.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const unshare = useMutation({
    mutationFn: (target: string) => api.delete<TestDetail>(`/tests/${test.id}/shares/${target}`),
    onSuccess: onDone,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Testni ulashish"
      description="Egasi va dastlabki muallif saqlanadi. Nusxa olish asl testni o‘zgartirmaydi."
      size="md"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <Field label="O‘qituvchi">
            <Select value={userId} onChange={(event) => setUserId(event.target.value)}>
              <option value="">— tanlang —</option>
              {(staff.data ?? [])
                .filter((person) => person.id !== test.owner.id)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Huquq">
            <Select value={permission} onChange={(event) => setPermission(event.target.value as SharePermission)}>
              {SHARE_PERMISSIONS.map((value) => (
                <option key={value} value={value}>
                  {SHARE_PERMISSION_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={() => share.mutate()} disabled={!userId} loading={share.isPending}>
            Ulashish
          </Button>
        </div>
        {test.shares.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {test.shares.map((item) => (
              <li key={item.userId} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{item.fullName}</span>
                <span className="flex items-center gap-2">
                  <Badge tone="brand">{SHARE_PERMISSION_LABELS[item.permission]}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => unshare.mutate(item.userId)}
                    aria-label={`${item.fullName} uchun ulashishni bekor qilish`}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Test hali hech kim bilan ulashilmagan.</p>
        )}
      </div>
    </Dialog>
  );
}

function Wizard() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const query = useTest(id);
  const { draft, update, reset } = useSessionDraft(id);
  const [sharing, setSharing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const step = Math.min(10, Math.max(1, Number(params.get('step')) || 1));
  const goTo = (target: number) => router.replace(`/teacher/tests/${id}?step=${target}`, { scroll: false });

  const copy = useMutation({
    mutationFn: () => api.post<TestDetail>(`/tests/${id}/copy`),
    onSuccess: (created) => {
      toast.success('Nusxa yaratildi.');
      router.push(`/teacher/tests/${created.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const archive = useMutation({
    mutationFn: () => api.delete(`/tests/${id}`),
    onSuccess: () => {
      toast.success('Test arxivlandi.');
      router.push('/teacher/tests');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const test = query.data;
  const readOnly = !test.canEdit;
  const errors = test.issues.filter((issue) => issue.level === 'error').length;
  const warnings = test.issues.length - errors;
  const maxStep = test.canConduct ? 10 : 6;

  const content = (() => {
    switch (step) {
      case 1:
        return readOnly ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Fan</dt>
              <dd className="font-medium">{test.subject.name}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Sinf darajasi</dt>
              <dd className="font-medium">{test.gradeLevel}-sinf</dd>
            </div>
            <div>
              <dt className="text-slate-500">Mavzu</dt>
              <dd className="font-medium">{test.topic ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Maqsad</dt>
              <dd className="font-medium">{test.goal ?? '—'}</dd>
            </div>
          </dl>
        ) : (
          <PassportStep test={test} onSaved={() => goTo(2)} />
        );
      case 2:
        return <BlueprintStep key={test.version?.id} test={test} readOnly={readOnly} onSaved={() => goTo(3)} />;
      case 3:
        return <QuestionsStep test={test} readOnly={readOnly} />;
      case 4:
        return <GradingStep test={test} readOnly={readOnly} />;
      case 5:
        return (
          <ValidationStep
            test={test}
            onGoToQuestion={(number) => {
              goTo(3);
              setTimeout(
                () =>
                  document
                    .getElementById(`question-${number}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                300,
              );
            }}
          />
        );
      case 6:
        return <PreviewStep test={test} />;
      case 7:
        return <AudienceStep test={test} draft={draft} update={update} />;
      case 8:
        return <TimingStep draft={draft} update={update} />;
      case 9:
        return <ResultPolicyStep draft={draft} update={update} />;
      default:
        return <PublishStep test={test} draft={draft} update={update} onPublished={reset} />;
    }
  })();

  return (
    <div>
      <PageHeader
        back={
          <Link
            href="/teacher/tests"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" /> Testlar
          </Link>
        }
        title={test.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {test.subject.name} · {test.gradeLevel}-sinf · {test.version?.questions.length ?? 0} ta savol
            </span>
            <TestStatusBadge status={test.status} />
            {test.version && (
              <Badge tone={test.isDraft ? 'amber' : 'green'}>
                {test.isDraft ? `Qoralama v${test.version.versionNo}` : `Muzlatilgan v${test.version.versionNo}`}
              </Badge>
            )}
            {test.permission !== 'OWNER' && <Badge tone="violet">Muallif: {test.owner.fullName}</Badge>}
          </span>
        }
        actions={
          <>
            {test.permission === 'OWNER' && (
              <Button variant="outline" size="sm" icon={<Share2 className="size-4" />} onClick={() => setSharing(true)}>
                Ulashish
              </Button>
            )}
            {test.canCopy && (
              <Button
                variant="outline"
                size="sm"
                icon={<Copy className="size-4" />}
                onClick={() => copy.mutate()}
                loading={copy.isPending}
              >
                Nusxa olish
              </Button>
            )}
            {test.permission === 'OWNER' && test.status !== 'ARCHIVED' && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Archive className="size-4" />}
                onClick={() => setArchiving(true)}
              >
                Arxivlash
              </Button>
            )}
          </>
        }
      />

      {readOnly && (
        <Alert tone="info" className="mb-4">
          Bu testni faqat ko‘rishingiz mumkin. O‘zgartirish uchun nusxa oling.
        </Alert>
      )}
      {!test.isDraft && test.frozenVersions.length > 0 && !readOnly && (
        <Alert tone="info" className="mb-4">
          Test e’lon qilingan. Har qanday o‘zgartirish yangi qoralama versiyani yaratadi — o‘tkazilgan sessiyalar
          muzlatilgan versiyada qoladi.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Test yaratish bosqichlari" className="lg:sticky lg:top-20 lg:self-start">
          <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible">
            {STEPS.slice(0, maxStep).map((item, index) => {
              const number = index + 1;
              const active = number === step;
              const badge = number === 5 && errors > 0 ? 'error' : number === 5 && warnings > 0 ? 'warning' : null;
              return (
                <li key={item.title} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(number)}
                    aria-current={active ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      active ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-surface',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular',
                        active ? 'bg-white/20' : 'bg-slate-200 text-slate-700',
                      )}
                    >
                      {number < step ? <Check className="size-3.5" /> : number}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium whitespace-nowrap">{item.title}</span>
                      <span className={cn('hidden text-xs lg:block', active ? 'text-white/80' : 'text-slate-500')}>
                        {item.hint}
                      </span>
                    </span>
                    {badge && (
                      <AlertCircle
                        className={cn(
                          'ml-auto size-4 shrink-0',
                          badge === 'error' ? 'text-red-500' : 'text-amber-500',
                          active && 'text-white',
                        )}
                        aria-label={badge === 'error' ? 'Xatolar bor' : 'Ogohlantirishlar bor'}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardBody className="py-5">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                {step}. {STEPS[step - 1]!.title}
              </h2>
              {content}
            </CardBody>
          </Card>
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => goTo(step - 1)}
              disabled={step === 1}
              icon={<ChevronLeft className="size-4" />}
            >
              Oldingi bosqich
            </Button>
            {step < maxStep && (
              <Button variant="secondary" onClick={() => goTo(step + 1)}>
                Keyingi bosqich <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
          {test.frozenVersions.length > 0 && (
            <Card>
              <CardBody>
                <p className="mb-2 text-sm font-medium text-slate-700">Muzlatilgan versiyalar</p>
                <ul className="space-y-1 text-sm text-slate-600">
                  {test.frozenVersions.map((version) => (
                    <li key={version.id}>
                      v{version.versionNo} · {formatDateTime(version.frozenAt)} · {version.questionCount} ta savol ·{' '}
                      {version.sessionCount} ta sessiya
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <ShareDialog test={test} open={sharing} onClose={() => setSharing(false)} />
      <ConfirmDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={() => archive.mutate()}
        loading={archive.isPending}
        title="Testni arxivlaysizmi?"
        confirmLabel="Arxivlash"
        tone="danger"
      >
        Test kutubxonada ko‘rinmaydi. O‘tkazilgan sessiyalar va natijalar saqlanadi.
      </ConfirmDialog>
    </div>
  );
}

export default function TestWizardPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Wizard />
    </Suspense>
  );
}
