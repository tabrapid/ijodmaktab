'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Landmark,
  Share2,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  SHARE_PERMISSIONS,
  SHARE_PERMISSION_LABELS,
  formatDateTime,
  hasBlockingIssues,
  type SharePermission,
} from '@ijod/shared';
import { TestStatusBadge } from '@/components/status';
import { CopyTestDialog } from '@/components/teacher/copy-test-dialog';
import { newSessionHref, subjectBlockReason, useTaughtSubjects } from '@/components/teacher/test-helpers';
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
  useSessionDraft,
} from '@/components/teacher/wizard/session-steps';
import { testKey, useTest } from '@/components/teacher/wizard/use-test';
import { ValidationStep } from '@/components/teacher/wizard/validation-step';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
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
                    <Trash2 className="size-4 text-red-700" />
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

/** Maktab test bankiga chiqarish / bankdagi versiyani yangilash / bankdan olish. */
function SchoolBankDialog({
  test,
  mode,
  onClose,
  onFix,
}: {
  test: TestDetail;
  mode: 'publish' | 'unpublish' | null;
  onClose: () => void;
  onFix: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const change = useMutation({
    mutationFn: (shared: boolean) => api.put<TestDetail>(`/tests/${test.id}/school`, { shared }),
    onSuccess: (updated, shared) => {
      queryClient.setQueryData(testKey(test.id), updated);
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      toast.success(
        shared ? `Test maktab bankiga chiqarildi (v${updated.publishedVersionNo}).` : 'Test maktab bankidan olindi.',
      );
      onClose();
    },
  });
  const close = () => {
    change.reset();
    onClose();
  };
  const republish = test.visibility === 'SCHOOL';
  const blocking = test.isDraft && hasBlockingIssues(test.issues);
  const empty = (test.version?.questions.length ?? 0) === 0;
  const nextVersion = test.isDraft ? test.version?.versionNo : test.publishedVersionNo;

  return (
    <Dialog
      open={mode !== null}
      onClose={close}
      title={
        mode === 'unpublish'
          ? 'Testni maktab bankidan olasizmi?'
          : republish
            ? 'Bankdagi versiyani yangilaysizmi?'
            : 'Testni maktab bankiga chiqarasizmi?'
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Bekor qilish
          </Button>
          {mode === 'unpublish' ? (
            <Button variant="danger" loading={change.isPending} onClick={() => change.mutate(false)}>
              Bankdan olish
            </Button>
          ) : (
            <Button
              icon={<Landmark className="size-4" />}
              loading={change.isPending}
              disabled={blocking || empty}
              onClick={() => change.mutate(true)}
            >
              {republish ? 'Bankni yangilash' : 'Bankka chiqarish'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        {change.isError && <Alert tone="danger">{errorMessage(change.error)}</Alert>}
        {mode === 'unpublish' ? (
          <>
            <p>
              Boshqa o‘qituvchilar testni endi ko‘rmaydi va u bilan yangi sessiya yarata olmaydi. Allaqachon yaratilgan
              sessiyalar, natijalar va olingan nusxalar o‘zgarmaydi.
            </p>
            {test.permission !== 'OWNER' && (
              <p>Muallifning testi o‘chirilmaydi — faqat maktab bankidan olinadi (bu amal jurnalga yoziladi).</p>
            )}
          </>
        ) : (
          <>
            <p>
              Testning joriy holati tekshiriladi va muzlatiladi{nextVersion ? ` (v${nextVersion})` : ''}. U barcha
              o‘qituvchilar va rahbariyatga ko‘rinadi: ular testni ko‘radi, nusxa oladi va o‘z sinflarida o‘tkazadi —
              lekin sizning testingizni o‘zgartira olmaydi.
            </p>
            <p>
              Keyingi tahrirlaringiz yangi qoralama sifatida saqlanadi. Bankdagilar ularni testni qayta
              chiqarganingizdan (yoki shu test bilan yangi sessiya yaratganingizdan) keyin ko‘radi.
            </p>
            {empty ? (
              <Alert tone="warning">Testda hali savol yo‘q — avval savollar qo‘shing.</Alert>
            ) : (
              blocking && (
                <Alert
                  tone="danger"
                  title="Testda qat’iy xatolar bor"
                  action={
                    <button type="button" className="text-sm font-medium underline" onClick={onFix}>
                      Tekshiruvga o‘tish
                    </button>
                  }
                >
                  Avval ularni tuzating — shundan keyin bankka chiqarish mumkin.
                </Alert>
              )
            )}
          </>
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
  const [copying, setCopying] = useState(false);
  const [bank, setBank] = useState<'publish' | 'unpublish' | null>(null);
  const taught = useTaughtSubjects();
  const goTo = (target: number) => router.replace(`/teacher/tests/${id}?step=${target}`, { scroll: false });

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
  // Sessiya bosqichlari (7–10) — faqat tahrirlovchi uchun; boshqalar yangi sessiya sahifasidan foydalanadi.
  const maxStep = test.canEdit && test.canConduct ? 10 : 6;
  const step = Math.min(maxStep, Math.max(1, Number(params.get('step')) || 1));
  const inBank = test.visibility === 'SCHOOL';
  // O‘qituvchi test faniga dars bermasa, uni o‘z sinflariga o‘tkaza olmaydi.
  const subjectReason = subjectBlockReason(test, taught);

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
            {inBank && (
              <Badge tone="brand">
                <Landmark className="size-3" aria-hidden /> Maktab banki
              </Badge>
            )}
            {test.version && (
              <Badge tone={test.isDraft ? 'amber' : 'green'}>
                {test.isDraft
                  ? `Qoralama v${test.version.versionNo}`
                  : readOnly
                    ? `Tayyor v${test.version.versionNo}`
                    : `Muzlatilgan v${test.version.versionNo}`}
              </Badge>
            )}
            {test.permission !== 'OWNER' && <Badge tone="violet">Muallif: {test.owner.fullName}</Badge>}
          </span>
        }
        actions={
          <>
            {test.canConduct && !subjectReason && (
              <ButtonLink href={newSessionHref(test.id)} size="sm" icon={<CalendarPlus className="size-4" />}>
                Sessiya yaratish
              </ButtonLink>
            )}
            {test.canChangeVisibility &&
              (test.permission === 'OWNER' && test.status !== 'ARCHIVED' && (!inBank || test.isDraft) ? (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Landmark className="size-4" />}
                  onClick={() => setBank('publish')}
                >
                  {inBank ? 'Bankni yangilash' : 'Maktab bankiga chiqarish'}
                </Button>
              ) : null)}
            {test.canChangeVisibility && inBank && (
              <Button variant="ghost" size="sm" onClick={() => setBank('unpublish')}>
                Bankdan olish
              </Button>
            )}
            {test.permission === 'OWNER' && (
              <Button variant="outline" size="sm" icon={<Share2 className="size-4" />} onClick={() => setSharing(true)}>
                Ulashish
              </Button>
            )}
            {test.canCopy && (
              <Button variant="outline" size="sm" icon={<Copy className="size-4" />} onClick={() => setCopying(true)}>
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

      {readOnly &&
        (test.status === 'ARCHIVED' && test.permission === 'OWNER' ? (
          <Alert tone="warning" className="mb-4">
            Test arxivlangan: uni tahrirlab yoki sessiyada ishlatib bo‘lmaydi. O‘tkazilgan sessiyalar saqlangan.
          </Alert>
        ) : test.publishedVersionNo === null ? (
          <Alert tone="warning" className="mb-4" title="Tayyor versiya hali yo‘q">
            Muallif bu testni hali tayyorlamagan (muzlatilgan versiya yo‘q). Test maktab bankiga chiqarilgach yoki
            muallif uni sessiyada ishlatgach shu yerda ko‘rinadi.
          </Alert>
        ) : test.permission === 'VIEW' ? (
          <Alert tone="info" className="mb-4">
            Siz testning tayyor (muzlatilgan) v{test.publishedVersionNo} versiyasini faqat ko‘rishingiz mumkin. Sessiya
            yaratish yoki o‘zgartirish uchun muallifdan nusxa olish huquqini so‘rang.
          </Alert>
        ) : subjectReason ? (
          <Alert tone="warning" className="mb-4">
            Siz testning tayyor (muzlatilgan) v{test.publishedVersionNo} versiyasini ko‘ryapsiz. {subjectReason}
            {test.canCopy &&
              ' Kerak bo‘lsa, nusxa oling va nusxaning fanini o‘zingiz dars beradigan fanga o‘zgartiring.'}
          </Alert>
        ) : (
          <Alert tone="info" className="mb-4">
            Siz testning tayyor (muzlatilgan) v{test.publishedVersionNo} versiyasini ko‘ryapsiz — muallifning
            tugallanmagan o‘zgarishlari ko‘rinmaydi. O‘z sinfingizda o‘tkazish uchun “Sessiya yaratish”ni bosing;
            o‘zgartirish kerak bo‘lsa, nusxa oling.
          </Alert>
        ))}
      {!readOnly && subjectReason && test.status !== 'ARCHIVED' && (
        <Alert tone="warning" className="mb-4">
          {subjectReason} Testni tahrirlashingiz mumkin, lekin sessiyani shu fandan dars beradigan o‘qituvchi yoki
          rahbariyat yaratadi.
        </Alert>
      )}
      {!readOnly && inBank && test.isDraft && (
        <Alert tone="info" className="mb-4">
          Bu test maktab bankida: boshqalar tayyor v{test.publishedVersionNo} versiyani ko‘radi. Qoralamadagi
          o‘zgarishlar bankka “Bankni yangilash” tugmasi bosilganda yoki shu test bilan yangi sessiya yaratilganda
          (qoralama muzlatilib) tushadi.
        </Alert>
      )}
      {!test.isDraft && test.frozenVersions.length > 0 && !readOnly && (
        <Alert tone="info" className="mb-4">
          Test e’lon qilingan. Har qanday o‘zgartirish yangi qoralama versiyani yaratadi — o‘tkazilgan sessiyalar
          muzlatilgan versiyada qoladi.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
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
                          badge === 'error' ? 'text-red-700' : 'text-amber-700',
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
      <CopyTestDialog test={test} open={copying} onClose={() => setCopying(false)} />
      <SchoolBankDialog
        test={test}
        mode={bank}
        onClose={() => setBank(null)}
        onFix={() => {
          setBank(null);
          goTo(5);
        }}
      />
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
