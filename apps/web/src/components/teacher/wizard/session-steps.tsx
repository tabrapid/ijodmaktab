'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, ChevronRight, KeyRound, Maximize } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ATTEMPT_POLICIES,
  ATTEMPT_POLICY_LABELS,
  REVIEW_VISIBILITIES,
  REVIEW_VISIBILITY_LABELS,
  SCORE_VISIBILITIES,
  SCORE_VISIBILITY_LABELS,
  createSessionSchema,
  dateToSchoolInput,
  formatDateTime,
  formatPoints,
  hasBlockingIssues,
  schoolInputToDate,
  type AttemptPolicy,
  type ReviewVisibility,
  type ScoreVisibility,
} from '@ijod/shared';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, EmptyState, PageLoader } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { ClassDetail, ClassListItem, SessionDetail, StaffItem, TestDetail } from '@/lib/types';
import { conductBlockReason, sessionPageHref, subjectBlockReason, useTaughtSubjects } from '../test-helpers';

export interface SessionDraft {
  title: string;
  conductorId: string;
  classIds: string[];
  studentIds: string[];
  extraTime: Record<string, number>;
  startsAt: string;
  endsAt: string;
  entryClosesAt: string;
  durationMinutes: number;
  maxAttempts: number;
  attemptPolicy: AttemptPolicy;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  allowBackNavigation: boolean;
  /** To‘liq ekran nazorati: chiqilsa urinish o‘tkazuvchi ruxsatigacha to‘xtatiladi. */
  requireFullscreen: boolean;
  scoreVisibility: ScoreVisibility;
  reviewVisibility: ReviewVisibility;
  passPercent: string;
  categoryThresholdPercent: number;
  retakeRule: string;
}

function defaultTiming() {
  const start = new Date(Math.ceil(Date.now() / (5 * 60_000)) * 5 * 60_000);
  return {
    startsAt: dateToSchoolInput(start),
    endsAt: dateToSchoolInput(new Date(start.getTime() + 45 * 60_000)),
    entryClosesAt: '',
  };
}

export function defaultSessionDraft(): SessionDraft {
  return {
    title: '',
    conductorId: '',
    classIds: [],
    studentIds: [],
    extraTime: {},
    ...defaultTiming(),
    durationMinutes: 40,
    maxAttempts: 1,
    attemptPolicy: 'FIRST',
    shuffleQuestions: false,
    shuffleOptions: false,
    allowBackNavigation: true,
    requireFullscreen: true,
    scoreVisibility: 'AFTER_ALL_DONE',
    reviewVisibility: 'AFTER_CLOSE',
    passPercent: '',
    categoryThresholdPercent: 60,
    retakeRule: '',
  };
}

type Update = (patch: Partial<SessionDraft>) => void;

const draftKey = (id: string) => `ijod:session-draft:${id}`;

function loadDraft(id: string): SessionDraft {
  if (typeof window === 'undefined') return defaultSessionDraft();
  try {
    const stored = localStorage.getItem(draftKey(id));
    if (!stored) return defaultSessionDraft();
    const draft = { ...defaultSessionDraft(), ...(JSON.parse(stored) as Partial<SessionDraft>) };
    // Eski qoralamadagi o‘tib ketgan vaqt yangi sessiyaga ko‘chmasin.
    if (!draft.endsAt || schoolInputToDate(draft.endsAt).getTime() <= Date.now()) Object.assign(draft, defaultTiming());
    return draft;
  } catch {
    return defaultSessionDraft();
  }
}

/**
 * Sessiya sozlamalari (auditoriya, vaqt, natija siyosati) — test bo‘yicha brauzer xotirasida
 * saqlanadi: sahifa yangilansa yoki keyinroq qaytilsa ham yo‘qolmaydi.
 */
export function useSessionDraft(id: string) {
  const [draft, setDraft] = useState<SessionDraft>(() => loadDraft(id));
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

/** O‘qituvchi shu fandan dars beradigan sinflar (rahbariyat — barcha sinflar). */
function useAudienceClasses(test: TestDetail) {
  const { data: me } = useMe();
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  return useQuery({
    queryKey: ['classes', leadership ? 'all' : 'mine'],
    queryFn: () => api.get<ClassListItem[]>(`/classes?scope=${leadership ? 'all' : 'mine'}`),
    enabled: Boolean(me),
    select: (classes) =>
      leadership
        ? classes
        : classes.filter((item) => item.subjects.some((entry) => entry.isMine && entry.subject.id === test.subject.id)),
  });
}

// ------------------------------------------------------------ 7. Auditoriya

export function AudienceStep({ test, draft, update }: { test: TestDetail; draft: SessionDraft; update: Update }) {
  const classes = useAudienceClasses(test);
  const [expanded, setExpanded] = useState<string[]>([]);
  const details = useQueries({
    queries: expanded.map((id) => ({ queryKey: ['class', id], queryFn: () => api.get<ClassDetail>(`/classes/${id}`) })),
  });

  if (classes.isPending) return <PageLoader />;
  if (!classes.data?.length) {
    return (
      <EmptyState
        title="Mos sinf topilmadi"
        description={`Siz “${test.subject.name}” fanidan dars beradigan sinf yo‘q. Test (jumladan maktab bankidagi test) faqat shu fandan o‘zingiz dars beradigan sinflarga o‘tkaziladi. Kerak bo‘lsa, administrator sizni sinfga biriktiradi.`}
      />
    );
  }

  const toggleClass = (id: string) =>
    update({
      classIds: draft.classIds.includes(id) ? draft.classIds.filter((item) => item !== id) : [...draft.classIds, id],
    });
  const toggleStudent = (id: string) =>
    update({
      studentIds: draft.studentIds.includes(id)
        ? draft.studentIds.filter((item) => item !== id)
        : [...draft.studentIds, id],
    });
  const setExtra = (id: string, minutes: number) => update({ extraTime: { ...draft.extraTime, [id]: minutes } });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Butun sinfni yoki alohida o‘quvchilarni tanlang. Tayinlangan o‘quvchilar ro‘yxati sessiya tarixida saqlanadi.
        Maxsus qo‘shimcha vaqt (masalan, alohida ehtiyojli o‘quvchi uchun) daqiqalarda beriladi.
      </p>
      <ul className="space-y-3">
        {classes.data.map((item) => {
          const whole = draft.classIds.includes(item.id);
          const open = expanded.includes(item.id);
          const detail = details.find((entry) => entry.data?.id === item.id)?.data;
          return (
            <li
              key={item.id}
              className={cn('rounded-xl border bg-surface', whole ? 'border-brand-300' : 'border-slate-200')}
            >
              <div className="flex flex-wrap items-center gap-3 p-3">
                <Checkbox
                  checked={whole}
                  onChange={() => toggleClass(item.id)}
                  label={
                    <span className="font-medium">
                      {item.name} <span className="font-normal text-slate-500">· {item.studentCount} o‘quvchi</span>
                    </span>
                  }
                />
                {item.gradeLevel !== test.gradeLevel && <Badge tone="amber">Test {test.gradeLevel}-sinf uchun</Badge>}
                <span className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  onClick={() =>
                    setExpanded((current) => (open ? current.filter((id) => id !== item.id) : [...current, item.id]))
                  }
                >
                  O‘quvchilar
                </Button>
              </div>
              {open && (
                <div className="border-t border-slate-100 p-3">
                  {!detail ? (
                    <PageLoader />
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {detail.students.map((student) => {
                        const included = whole || draft.studentIds.includes(student.id);
                        return (
                          <li key={student.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              className="flex-1"
                              checked={included}
                              disabled={whole}
                              onChange={() => toggleStudent(student.id)}
                              label={
                                <span className="inline-flex items-center gap-2">
                                  <Avatar name={student.fullName} src={student.avatarUrl ?? null} size="xs" />
                                  {student.fullName}
                                </span>
                              }
                            />
                            {included && (
                              <label className="flex items-center gap-1 text-xs text-slate-500">
                                +
                                <input
                                  type="number"
                                  min={0}
                                  max={240}
                                  value={draft.extraTime[student.id] ?? 0}
                                  onChange={(event) =>
                                    setExtra(student.id, Math.max(0, Math.min(240, Number(event.target.value) || 0)))
                                  }
                                  className="h-7 w-14 rounded border border-slate-300 px-1 text-right"
                                  aria-label={`${student.fullName}: qo‘shimcha daqiqa`}
                                />
                                daq
                              </label>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ 8. Vaqt va tartib

export function TimingStep({ draft, update }: { draft: SessionDraft; update: Update }) {
  const [now] = useState(() => Date.now());
  const startsAt = schoolInputToDate(draft.startsAt).getTime();
  const endsAt = schoolInputToDate(draft.endsAt).getTime();
  const windowMinutes = Math.round((endsAt - startsAt) / 60_000);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Boshlanish (Toshkent vaqti)" required>
          <Input
            type="datetime-local"
            value={draft.startsAt}
            onChange={(event) => update({ startsAt: event.target.value })}
          />
        </Field>
        <Field label="Yopilish" required>
          <Input
            type="datetime-local"
            value={draft.endsAt}
            onChange={(event) => update({ endsAt: event.target.value })}
          />
        </Field>
        <Field
          label="Kirish muddati (ixtiyoriy)"
          hint="Shu vaqtdan keyin yangi urinish boshlab bo‘lmaydi. Bo‘sh — yopilishgacha."
        >
          <Input
            type="datetime-local"
            value={draft.entryClosesAt}
            onChange={(event) => update({ entryClosesAt: event.target.value })}
          />
        </Field>
        <Field label="Davomiylik (daqiqa)" required hint="Har bir o‘quvchi uchun boshlagan paytidan hisoblanadi.">
          <Input
            type="number"
            min={1}
            max={600}
            value={draft.durationMinutes}
            onChange={(event) => update({ durationMinutes: Number(event.target.value) || 0 })}
          />
        </Field>
      </div>
      {endsAt <= now ? (
        <Alert tone="danger">Yopilish vaqti o‘tib ketgan — boshlanish va yopilish vaqtini yangilang.</Alert>
      ) : (
        startsAt < now - 60_000 && (
          <Alert tone="info">Boshlanish vaqti o‘tgan: sessiya e’lon qilinishi bilan darhol ochiladi.</Alert>
        )
      )}
      {windowMinutes > 0 && draft.durationMinutes > windowMinutes && (
        <Alert tone="warning">
          Davomiylik ({draft.durationMinutes} daq) sessiya oynasidan ({windowMinutes} daq) uzun. Yakun vaqti sessiya
          yopilishi bilan cheklanadi.
        </Alert>
      )}
      <Alert tone="info">
        Yakun vaqti = sessiya yopilishi va (boshlangan vaqt + davomiylik + individual qo‘shimcha vaqt) ning ertarog‘i.
        Kech kirgan o‘quvchi kamaygan vaqtni oladi.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Urinishlar soni" hint="Nazorat ishi uchun standart — bitta urinish.">
          <Input
            type="number"
            min={1}
            max={10}
            value={draft.maxAttempts}
            onChange={(event) => update({ maxAttempts: Math.max(1, Number(event.target.value) || 1) })}
          />
        </Field>
        {draft.maxAttempts > 1 && (
          <Field
            label="Qaysi urinish hisoblanadi"
            hint="Sessiya boshlanishidan oldin belgilanadi va hisobotda yoziladi."
          >
            <Select
              value={draft.attemptPolicy}
              onChange={(event) => update({ attemptPolicy: event.target.value as AttemptPolicy })}
            >
              {ATTEMPT_POLICIES.map((policy) => (
                <option key={policy} value={policy}>
                  {ATTEMPT_POLICY_LABELS[policy]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-surface p-4">
        <Checkbox
          checked={draft.shuffleQuestions}
          onChange={(event) => update({ shuffleQuestions: event.target.checked })}
          label="Savollarni aralashtirish"
          description="Har o‘quvchida savollar boshqa tartibda. Tartib urinish boshida saqlanadi va sahifa yangilanganda o‘zgarmaydi."
        />
        <Checkbox
          checked={draft.shuffleOptions}
          onChange={(event) => update({ shuffleOptions: event.target.checked })}
          label="Javob variantlarini aralashtirish"
        />
        <Checkbox
          checked={draft.allowBackNavigation}
          onChange={(event) => update({ allowBackNavigation: event.target.checked })}
          label="Oldingi savollarga qaytishga ruxsat"
          description="O‘chirilsa, o‘quvchi faqat oldinga yuradi."
        />
      </div>
      <div
        className={cn(
          'flex gap-3 rounded-xl border p-4',
          draft.requireFullscreen ? 'border-brand-200 bg-brand-50/60' : 'border-slate-200 bg-surface',
        )}
      >
        <Maximize className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
        <Checkbox
          checked={draft.requireFullscreen}
          onChange={(event) => update({ requireFullscreen: event.target.checked })}
          label={<span className="font-medium">To‘liq ekran nazorati</span>}
          description="O‘quvchi to‘liq ekrandan chiqsa yoki boshqa oynaga o‘tsa, test to‘xtatiladi va faqat sizning ruxsatingiz bilan davom etadi."
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 9. Natija siyosati

export function ResultPolicyStep({ draft, update }: { draft: SessionDraft; update: Update }) {
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">Ball qachon ko‘rsatiladi</legend>
        {SCORE_VISIBILITIES.map((value) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
              draft.scoreVisibility === value ? 'border-brand-400 bg-brand-50' : 'border-slate-200',
            )}
          >
            <input
              type="radio"
              className="mt-0.5"
              checked={draft.scoreVisibility === value}
              onChange={() => update({ scoreVisibility: value })}
            />
            <span>
              {SCORE_VISIBILITY_LABELS[value]}
              {value === 'AFTER_ALL_DONE' && (
                <span className="block text-xs text-slate-500">
                  Standart. Natija hamma topshirgach yoki sessiya yopilgach avtomatik e’lon qilinadi.
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-slate-700">To‘g‘ri javoblar va izohlar qachon ochiladi</legend>
        {REVIEW_VISIBILITIES.map((value) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
              draft.reviewVisibility === value ? 'border-brand-400 bg-brand-50' : 'border-slate-200',
            )}
          >
            <input
              type="radio"
              className="mt-0.5"
              checked={draft.reviewVisibility === value}
              onChange={() => update({ reviewVisibility: value })}
            />
            <span>{REVIEW_VISIBILITY_LABELS[value]}</span>
          </label>
        ))}
        <p className="text-xs text-slate-500">Kimdir hali ishlayotgan bo‘lsa, javoblar hech qachon ochilmaydi.</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kategoriya mezoni (%)" hint="“Mezonga yetganlar ulushi” shu chegara bo‘yicha hisoblanadi.">
          <Input
            type="number"
            min={0}
            max={100}
            value={draft.categoryThresholdPercent}
            onChange={(event) => update({ categoryThresholdPercent: Number(event.target.value) || 0 })}
          />
        </Field>
        <Field label="O‘tish chegarasi (%, ixtiyoriy)">
          <Input
            type="number"
            min={0}
            max={100}
            value={draft.passPercent}
            onChange={(event) => update({ passPercent: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Qayta topshirish qoidasi (ixtiyoriy)">
        <Textarea
          rows={2}
          value={draft.retakeRule}
          onChange={(event) => update({ retakeRule: event.target.value })}
          placeholder="Masalan: 50% dan past natija olganlar bir hafta ichida qayta topshiradi."
        />
      </Field>
    </div>
  );
}

// ------------------------------------------------------------ 10. Tasdiqlash va e’lon

/** Sessiya yaratish so‘rovi tanasi (qoralamadan). */
export function sessionPayload(testId: string, draft: SessionDraft) {
  return {
    testId,
    title: draft.title.trim() || undefined,
    conductorId: draft.conductorId || undefined,
    audience: { classIds: draft.classIds, studentIds: draft.studentIds },
    extraTime: Object.entries(draft.extraTime)
      .filter(([, minutes]) => minutes > 0)
      .map(([studentId, minutes]) => ({ studentId, minutes })),
    startsAt: draft.startsAt ? schoolInputToDate(draft.startsAt).toISOString() : '',
    endsAt: draft.endsAt ? schoolInputToDate(draft.endsAt).toISOString() : '',
    entryClosesAt: draft.entryClosesAt ? schoolInputToDate(draft.entryClosesAt).toISOString() : null,
    durationMinutes: draft.durationMinutes,
    maxAttempts: draft.maxAttempts,
    attemptPolicy: draft.attemptPolicy,
    shuffleQuestions: draft.shuffleQuestions,
    shuffleOptions: draft.shuffleOptions,
    allowBackNavigation: draft.allowBackNavigation,
    requireFullscreen: draft.requireFullscreen,
    scoreVisibility: draft.scoreVisibility,
    reviewVisibility: draft.reviewVisibility,
    passPercent: draft.passPercent === '' ? null : Number(draft.passPercent),
    categoryThresholdPercent: draft.categoryThresholdPercent,
    retakeRule: draft.retakeRule.trim() || null,
  };
}

/**
 * Tasdiqlash va e’lon: test ustasining 10-bosqichi va yangi sessiya sahifasida ishlatiladi.
 * `blockingHint` — testda qat’iy xato bo‘lsa, uni qayerda tuzatish haqidagi matn;
 * `links` — muvaffaqiyatdan keyingi qo‘shimcha havolalar.
 */
export function PublishStep({
  test,
  draft,
  update,
  onPublished,
  blockingHint = '5-bosqichdagi (Tekshiruv) xatolarni tuzating — shundan keyin e’lon qilish mumkin.',
  links = [{ href: '/teacher/tests', label: 'Testlar ro‘yxati' }],
}: {
  test: TestDetail;
  draft: SessionDraft;
  update: Update;
  onPublished: (session: SessionDetail) => void;
  blockingHint?: ReactNode;
  links?: { href: string; label: string }[];
}) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const classes = useAudienceClasses(test);
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffItem[]>('/users/staff') });
  const taught = useTaughtSubjects();
  const [created, setCreated] = useState<SessionDetail | null>(null);

  // Eskirgan qoralamadagi (endi mavjud bo‘lmagan yoki boshqa fanga tegishli) sinflar yuborilmaydi.
  const classIds = classes.data
    ? draft.classIds.filter((classId) => classes.data.some((item) => item.id === classId))
    : draft.classIds;
  const payload = sessionPayload(test.id, { ...draft, classIds });
  const check = createSessionSchema.safeParse(payload);
  const blocking = hasBlockingIssues(test.issues);
  const unavailable =
    conductBlockReason({ ...test, questionCount: test.version?.questions.length ?? 0 }) ??
    subjectBlockReason(test, taught);
  // Bankdagi testning qoralamasi sessiyada muzlatilsa, bankdagi versiya ham yangilanadi.
  const updatesBank = test.visibility === 'SCHOOL' && test.canEdit && test.isDraft;
  const expired = Boolean(payload.endsAt) && new Date(payload.endsAt).getTime() <= Date.now();

  const publish = useMutation({
    mutationFn: () => api.post<SessionDetail>('/sessions', payload),
    onSuccess: (session) => {
      setCreated(session);
      void queryClient.invalidateQueries({ queryKey: ['test', test.id] });
      void queryClient.invalidateQueries({ queryKey: ['tests'] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onPublished(session);
    },
  });

  if (created) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title="Sessiya yaratildi">
          Sessiya testning muzlatilgan v{created.test.versionNo} versiyasida o‘tkaziladi, {created.assignedCount} nafar
          o‘quvchiga bildirishnoma yuborildi. Testdagi keyingi tahrirlar bu sessiyani o‘zgartirmaydi.
        </Alert>
        <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 p-6 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-medium text-brand-800">
            <KeyRound className="size-4" aria-hidden /> Kirish kodi
          </p>
          <p className="mt-2 font-mono text-4xl font-bold tracking-[0.2em] break-all text-brand-900 sm:text-5xl">
            {created.accessCode}
          </p>
          <p className="mt-2 text-sm text-brand-800">
            Kodni test boshlanganda o‘quvchilarga o‘zingiz ayting — u bildirishnomada yuborilmaydi.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={sessionPageHref(me, created.id)}>Sessiyani ochish</ButtonLink>
          {links.map((link) => (
            <ButtonLink key={link.href} href={link.href} variant="outline">
              {link.label}
            </ButtonLink>
          ))}
        </div>
      </div>
    );
  }

  const selectedClasses = (classes.data ?? []).filter((item) => draft.classIds.includes(item.id));
  const audienceCount = selectedClasses.reduce((sum, item) => sum + item.studentCount, 0) + draft.studentIds.length;
  const issues = check.success ? [] : check.error.issues.map((issue) => issue.message);
  const versionNote =
    test.canEdit && test.isDraft
      ? `Qoralama v${test.version?.versionNo} e’lon qilinganda tekshirilib muzlatiladi`
      : test.conductVersionNo
        ? `Tayyor (muzlatilgan) v${test.conductVersionNo} ishlatiladi`
        : 'Tayyor versiya yo‘q';

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sessiya nomi (ixtiyoriy)" hint="Bo‘sh bo‘lsa test nomi ishlatiladi">
          <Input
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
            placeholder={test.title}
          />
        </Field>
        <Field label="O‘tkazuvchi" hint="Jonli kuzatuv va to‘xtatilgan o‘quvchilarga ruxsat berish uning ekranida.">
          <Select value={draft.conductorId} onChange={(event) => update({ conductorId: event.target.value })}>
            <option value="">Men</option>
            {(staff.data ?? [])
              .filter((person) => person.id !== me?.id)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
          </Select>
        </Field>
      </div>

      <dl className="grid gap-3 rounded-xl border border-slate-200 bg-surface p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Test</dt>
          <dd className="font-medium">
            {test.title} · {test.version?.questions.length ?? 0} ta savol ·{' '}
            {formatPoints(test.version?.totalPoints ?? 0)} ball
          </dd>
          <dd className="text-xs text-slate-500">{versionNote}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Auditoriya</dt>
          <dd className="font-medium">
            {selectedClasses.map((item) => item.name).join(', ') || '—'}
            {draft.studentIds.length > 0 && ` + ${draft.studentIds.length} alohida o‘quvchi`}
          </dd>
          <dd className="text-xs text-slate-500">Taxminan {audienceCount} nafar o‘quvchi</dd>
        </div>
        <div>
          <dt className="text-slate-500">Vaqt</dt>
          <dd className="font-medium">
            {draft.startsAt && draft.endsAt
              ? `${formatDateTime(schoolInputToDate(draft.startsAt))} – ${formatDateTime(schoolInputToDate(draft.endsAt))}`
              : '—'}
          </dd>
          <dd className="text-xs text-slate-500">
            Davomiylik {draft.durationMinutes} daqiqa · {draft.maxAttempts} ta urinish · to‘liq ekran nazorati{' '}
            {draft.requireFullscreen ? 'yoqilgan' : 'o‘chirilgan'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Natija</dt>
          <dd className="font-medium">{SCORE_VISIBILITY_LABELS[draft.scoreVisibility]}</dd>
          <dd className="text-xs text-slate-500">
            Javoblar: {REVIEW_VISIBILITY_LABELS[draft.reviewVisibility].toLowerCase()}
          </dd>
        </div>
      </dl>

      {unavailable && (
        <Alert tone="danger" title="Bu test bilan sessiya yaratib bo‘lmaydi">
          {unavailable}
        </Alert>
      )}
      {!unavailable && blocking && (
        <Alert tone="danger" title="Testda qat’iy xatolar bor">
          {blockingHint}
        </Alert>
      )}
      {!unavailable && updatesBank && (
        <Alert tone="info" title="Test maktab bankida">
          E’lon qilinganda qoralama v{test.version?.versionNo} muzlatiladi va maktab bankidagi versiya ham shu versiyaga
          yangilanadi: boshqa o‘qituvchilar yangi savollarni ko‘radi va o‘z sessiyalarida ishlatadi.
        </Alert>
      )}
      {expired && (
        <Alert tone="danger" title="Yopilish vaqti o‘tib ketgan">
          “Vaqt va tartib” bosqichida boshlanish va yopilish vaqtini yangilang.
        </Alert>
      )}
      {!check.success && (
        <Alert tone="warning" title="Sozlamalarni to‘ldiring">
          <ul className="list-disc pl-4">
            {[...new Set(issues)].map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}
      {publish.isError && <Alert tone="danger">{errorMessage(publish.error)}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          icon={<CheckCircle2 className="size-5" />}
          disabled={Boolean(unavailable) || blocking || expired || !check.success}
          loading={publish.isPending}
          onClick={() => publish.mutate()}
        >
          Tasdiqlash va e’lon qilish
        </Button>
        <p className="text-xs text-slate-500">
          E’lon qilinganda test versiyasi muzlatiladi va tayinlangan o‘quvchilarga bildirishnoma yuboriladi.
        </p>
      </div>
    </div>
  );
}
