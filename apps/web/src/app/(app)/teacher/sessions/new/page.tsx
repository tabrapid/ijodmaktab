'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Landmark, PencilLine, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { formatPoints, hasBlockingIssues } from '@ijod/shared';
import { TestPicker } from '@/components/sessions/test-picker';
import { copyTest, copyTitle } from '@/components/teacher/copy-test-dialog';
import {
  conductBlockReason,
  sessionPageHref,
  sessionsHomeHref,
  subjectBlockReason,
  useTaughtSubjects,
} from '@/components/teacher/test-helpers';
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
import { Button } from '@/components/ui/button';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, ErrorState, PageLoader } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { TestDetail } from '@/lib/types';

const STEPS = [
  { title: 'Test tanlash', hint: 'O‘zingizniki, ulashilgan yoki bankdan' },
  { title: 'Savollar', hint: 'Ko‘rib chiqish va qo‘shimcha savollar' },
  { title: 'Auditoriya', hint: 'Sinflar va o‘quvchilar' },
  { title: 'Vaqt va tartib', hint: 'Muddat, urinishlar, to‘liq ekran' },
  { title: 'Natijalar siyosati', hint: 'Qachon e’lon qilinadi' },
  { title: 'E’lon qilish', hint: 'Tasdiqlash va kirish kodi' },
];

const EXTRA_SUFFIX = ' — qo‘shimcha savollar bilan';

type Navigate = (patch: { testId?: string | null; workId?: string | null; step?: number | null }) => void;

/** Holat manzil satrida: ?testId=&workId=&step= (sahifa yangilansa ham davom etadi). */
function useFlowUrl() {
  const params = useSearchParams();
  const router = useRouter();
  const navigate: Navigate = (patch) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    }
    const text = next.toString();
    router.replace(`/teacher/sessions/new${text ? `?${text}` : ''}`, { scroll: false });
  };
  return {
    testId: params.get('testId'),
    workId: params.get('workId'),
    step: Number(params.get('step')) || null,
    navigate,
  };
}

/** Sessiyada ishlatiladigan versiya haqida qisqa izoh. */
function versionNote(test: TestDetail) {
  if (test.canEdit && test.isDraft) return `qoralama v${test.version?.versionNo} sessiya yaratilganda muzlatiladi`;
  if (test.conductVersionNo) return `tayyor (muzlatilgan) v${test.conductVersionNo} ishlatiladi`;
  return 'tayyor versiya yo‘q';
}

function Stepper({ step, enabled, onGo }: { step: number; enabled: boolean; onGo: (step: number) => void }) {
  return (
    <nav aria-label="Sessiya yaratish bosqichlari" className="mb-4">
      <ol className="flex gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((item, index) => {
          const number = index + 1;
          const active = number === step;
          return (
            <li key={item.title} className="shrink-0">
              <button
                type="button"
                disabled={!enabled && number > 1}
                onClick={() => onGo(number)}
                aria-current={active ? 'step' : undefined}
                title={item.hint}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular',
                    active ? 'bg-white/20' : 'bg-slate-200 text-slate-700',
                  )}
                >
                  {number < step && enabled ? <Check className="size-3.5" aria-hidden /> : number}
                </span>
                <span className="font-medium whitespace-nowrap">{item.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function OptionCard({
  icon: Icon,
  title,
  description,
  action,
  onClick,
  loading,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-surface p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
        <div>
          <p className="font-medium text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="self-start" onClick={onClick} loading={loading}>
        {action}
      </Button>
    </div>
  );
}

/**
 * 2-bosqich: sessiyada ishlatiladigan savollar va qo‘shimcha savollar. Tahrirlovchi savolni
 * testning o‘ziga (keyingi versiyaga) yoki nusxaga qo‘shadi; boshqalar — faqat nusxaga.
 * O‘qituvchi test faniga dars bermasa, nusxa taklif qilinmaydi — u ham sinfiga o‘tkazilmaydi.
 */
function QuestionsReview({
  base,
  working,
  subjectReason,
  navigate,
}: {
  base: TestDetail;
  working: TestDetail;
  subjectReason: string | null;
  navigate: Navigate;
}) {
  const queryClient = useQueryClient();
  const [inPlace, setInPlace] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const isCopy = working.id !== base.id;
  const editable = isCopy || inPlace;
  const blocked =
    conductBlockReason({ ...working, questionCount: working.version?.questions.length ?? 0 }) ?? subjectReason;
  const blocking = hasBlockingIssues(working.issues);
  const copy = useMutation({
    mutationFn: () => copyTest(base.id, copyTitle(base.title, EXTRA_SUFFIX)),
    onSuccess: (created) => {
      queryClient.setQueryData(testKey(created.id), created);
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      setConfirmCopy(false);
      navigate({ workId: created.id });
    },
  });
  const scrollToQuestion = (number: number) =>
    document.getElementById(`question-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="space-y-4">
      {blocked && (
        <Alert
          tone="danger"
          title="Bu test bilan sessiya yaratib bo‘lmaydi"
          action={
            <button
              type="button"
              className="text-sm font-medium underline"
              onClick={() => navigate({ testId: null, workId: null, step: null })}
            >
              Boshqa test
            </button>
          }
        >
          {blocked}
        </Alert>
      )}
      <p className="text-sm text-slate-600">
        {working.canEdit && working.isDraft
          ? `Sessiya yaratilganda testning qoralama v${working.version?.versionNo} versiyasi tekshirilib muzlatiladi va sessiya shu versiyada o‘tadi.`
          : working.conductVersionNo
            ? `Sessiya testning tayyor (muzlatilgan) v${working.conductVersionNo} versiyasida o‘tadi.`
            : 'Testning tayyor versiyasi yo‘q.'}{' '}
        Quyida sessiyadagi {working.version?.questions.length ?? 0} ta savol; sessiya yaratilgach ular o‘zgarmaydi.
      </p>

      {(blocking || (working.canEdit && working.issues.length > 0)) && (
        <section aria-labelledby="validation-title" className="space-y-2">
          <h3 id="validation-title" className="text-sm font-semibold text-slate-800">
            Tekshiruv natijasi
          </h3>
          <ValidationStep test={working} onGoToQuestion={scrollToQuestion} />
          {blocking && (
            <p className="text-sm text-slate-600">
              {working.canEdit ? (
                <>
                  Xatoli savolni ro‘yxatda tahrirlang
                  {!editable && (
                    <>
                      {' '}
                      (
                      <button
                        type="button"
                        className="font-medium text-brand-700 underline"
                        onClick={() => setInPlace(true)}
                      >
                        tahrirlashni yoqish
                      </button>
                      )
                    </>
                  )}{' '}
                  yoki{' '}
                  <Link href={`/teacher/tests/${working.id}?step=5`} className="font-medium text-brand-700 underline">
                    testni ustada oching
                  </Link>
                  .
                </>
              ) : (
                'Testdan nusxa oling va xatolarni nusxada tuzating.'
              )}
            </p>
          )}
        </section>
      )}

      {isCopy ? (
        <Alert
          tone="info"
          title="Nusxa ustida ishlayapsiz"
          action={
            <Button size="sm" variant="ghost" onClick={() => navigate({ workId: null })}>
              Asl testga qaytish
            </Button>
          }
        >
          “{working.title}” — “{base.title}” testining nusxasi. Asl test o‘zgarmaydi; nusxa “Mening testlarim”da
          saqlanadi va sessiya shu nusxa asosida o‘tkaziladi.{' '}
          <Link href={`/teacher/tests/${working.id}`} className="font-medium underline">
            Nusxani test ustasida ochish
          </Link>
        </Alert>
      ) : inPlace ? (
        <Alert
          tone="warning"
          title="Testning o‘zini tahrirlayapsiz"
          action={
            <Button size="sm" variant="outline" onClick={() => setInPlace(false)}>
              Tayyor
            </Button>
          }
        >
          Qo‘shilgan va o‘zgartirilgan savollar testning keyingi versiyasiga kiradi — bu va keyingi sessiyalarda
          ishlatiladi
          {base.visibility === 'SCHOOL'
            ? ', maktab bankidagilar esa ularni test qayta chiqarilgach yoki shu sessiya yaratilgach ko‘radi'
            : ''}
          . O‘tkazilgan sessiyalar o‘zgarmaydi.
        </Alert>
      ) : subjectReason ? null : (
        <section className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4">
          <h3 className="font-semibold text-slate-900">Qo‘shimcha savol qo‘shish</h3>
          <p className="mt-1 text-sm text-slate-600">
            Savollar bankidan tanlash, yangi savol yozish yoki boshqa testdan ko‘chirish mumkin.
          </p>
          <div className={cn('mt-3 grid gap-3', base.canEdit && 'sm:grid-cols-2')}>
            {base.canEdit && (
              <OptionCard
                icon={PencilLine}
                title="Testning o‘ziga qo‘shish"
                description="Savollar testning keyingi versiyasiga kiradi va sessiya yaratilganda muzlatiladi. Keyingi sessiyalarda ham shu savollar bo‘ladi."
                action="Testga qo‘shish"
                onClick={() => setInPlace(true)}
              />
            )}
            {base.canCopy ? (
              <OptionCard
                icon={Copy}
                title="Nusxasiga qo‘shish"
                description={`“${copyTitle(base.title, EXTRA_SUFFIX)}” nomli nusxa yaratiladi (“Mening testlarim”da). Asl test o‘zgarmaydi, sessiya nusxa asosida o‘tadi.`}
                action="Nusxa yaratish"
                onClick={() => setConfirmCopy(true)}
              />
            ) : (
              <p className="text-sm text-slate-600">Bu testdan nusxa olish huquqingiz yo‘q.</p>
            )}
          </div>
        </section>
      )}

      <QuestionsStep test={working} readOnly={!editable || !working.canEdit} />

      <ConfirmDialog
        open={confirmCopy}
        onClose={() => {
          copy.reset();
          setConfirmCopy(false);
        }}
        onConfirm={() => copy.mutate()}
        loading={copy.isPending}
        title="Nusxa yaratilsinmi?"
        confirmLabel="Nusxa yaratish"
      >
        <div className="space-y-3">
          <p>
            “{copyTitle(base.title, EXTRA_SUFFIX)}” nomli nusxa yaratiladi va “Mening testlarim”ga qo‘shiladi. Asl test
            o‘zgarmaydi — qo‘shimcha savollarni nusxaga qo‘shasiz va sessiya nusxa asosida o‘tkaziladi.
          </p>
          {copy.isError && <Alert tone="danger">{errorMessage(copy.error)}</Alert>}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function SelectedTestFlow({
  testId,
  workId,
  step,
  navigate,
}: {
  testId: string;
  workId: string | null;
  step: number;
  navigate: Navigate;
}) {
  const { data: me } = useMe();
  const router = useRouter();
  const toast = useToast();
  const base = useTest(testId);
  const work = useQuery({
    queryKey: testKey(workId ?? ''),
    queryFn: () => api.get<TestDetail>(`/tests/${workId}`),
    enabled: Boolean(workId),
  });
  const { draft, update, reset } = useSessionDraft(testId);
  const taught = useTaughtSubjects();
  const goTo = (target: number) => navigate({ step: target });
  const pickAnother = () => navigate({ testId: null, workId: null, step: null });

  if (base.isPending || (workId && work.isPending)) return <PageLoader />;
  if (base.isError) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <ErrorState error={base.error} onRetry={() => base.refetch()} />
          <Button variant="outline" onClick={pickAnother}>
            Boshqa test tanlash
          </Button>
        </CardBody>
      </Card>
    );
  }
  if (workId && (work.isError || !work.data?.canEdit)) {
    return (
      <Alert
        tone="warning"
        title="Qo‘shimcha savollar uchun yaratilgan nusxani ochib bo‘lmadi"
        action={
          <Button size="sm" variant="outline" onClick={() => navigate({ workId: null })}>
            Asl test bilan davom etish
          </Button>
        }
      >
        {work.isError ? errorMessage(work.error) : 'Nusxani tahrirlash huquqingiz yo‘q yoki u arxivlangan.'}
      </Alert>
    );
  }
  const working = workId && work.data ? work.data : base.data;
  const subjectReason = subjectBlockReason(working, taught);

  const content = (() => {
    switch (step) {
      case 2:
        return <QuestionsReview base={base.data} working={working} subjectReason={subjectReason} navigate={navigate} />;
      case 3:
        return <AudienceStep test={working} draft={draft} update={update} />;
      case 4:
        return <TimingStep draft={draft} update={update} />;
      case 5:
        return <ResultPolicyStep draft={draft} update={update} />;
      default:
        return (
          <PublishStep
            test={working}
            draft={draft}
            update={update}
            blockingHint={
              <>
                Xatolarni “Savollar” bosqichida tuzating.{' '}
                <button type="button" className="font-medium underline" onClick={() => goTo(2)}>
                  Savollar bosqichiga o‘tish
                </button>
              </>
            }
            links={[{ href: sessionsHomeHref(me), label: 'Sessiyalar ro‘yxati' }]}
            onPublished={(session) => {
              reset();
              toast.success('Sessiya yaratildi. Kirish kodini o‘quvchilarga test boshlanganda ayting.');
              router.push(sessionPageHref(me, session.id));
            }}
          />
        );
    }
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">Tanlangan test</p>
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
            {working.title}
            {base.data.visibility === 'SCHOOL' && (
              <Badge tone="brand">
                <Landmark className="size-3" aria-hidden /> Maktab banki
              </Badge>
            )}
            {working.id !== base.data.id && <Badge tone="violet">Nusxa</Badge>}
          </p>
          <p className="text-xs text-slate-500">
            {working.subject.name} · {working.gradeLevel}-sinf · {working.version?.questions.length ?? 0} ta savol ·{' '}
            {formatPoints(working.version?.totalPoints ?? 0)} ball · {versionNote(working)}
            {working.permission !== 'OWNER' && ` · muallif: ${working.owner.fullName}`}
          </p>
          {subjectReason && <p className="mt-1 text-xs font-medium text-amber-700">{subjectReason}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={() => goTo(1)}>
          Boshqa test
        </Button>
      </div>

      <Card>
        <CardBody className="py-5">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {step}. {STEPS[step - 1]!.title}
          </h2>
          {content}
        </CardBody>
      </Card>

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={() => goTo(step - 1)} icon={<ChevronLeft className="size-4" />}>
          Oldingi bosqich
        </Button>
        {step < STEPS.length && (
          <Button variant="secondary" onClick={() => goTo(step + 1)}>
            Keyingi bosqich <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function NewSessionFlow() {
  const { data: me } = useMe();
  const { testId, workId, step: stepParam, navigate } = useFlowUrl();
  const step = testId ? Math.min(STEPS.length, Math.max(1, stepParam ?? 2)) : 1;
  const home = sessionsHomeHref(me);

  return (
    <div>
      <PageHeader
        back={
          <Link href={home} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" /> Sessiyalar
          </Link>
        }
        title="Yangi sessiya"
        description="Testni tanlang, kerak bo‘lsa qo‘shimcha savol qo‘shing, auditoriya va vaqtni belgilang. Sessiya testning muzlatilgan versiyasida o‘tadi — test keyin o‘zgarsa ham natijalar buzilmaydi."
      />
      <Stepper step={step} enabled={Boolean(testId)} onGo={(target) => navigate({ step: target })} />
      {!testId || step === 1 ? (
        <Card>
          <CardBody className="py-5">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">1. Test tanlash</h2>
            <p className="mb-4 text-sm text-slate-600">
              O‘zingizning testingiz, siz bilan ulashilgan test yoki maktab test bankidagi tayyor testni tanlang.
            </p>
            <TestPicker
              selectedId={testId}
              onSelect={(test) => navigate({ testId: test.id, workId: test.id === testId ? workId : null, step: 2 })}
            />
          </CardBody>
        </Card>
      ) : (
        <SelectedTestFlow key={testId} testId={testId} workId={workId} step={step} navigate={navigate} />
      )}
    </div>
  );
}

export default function NewSessionPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <NewSessionFlow />
    </Suspense>
  );
}
