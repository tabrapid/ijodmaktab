'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, FileText, Landmark, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatPoints } from '@ijod/shared';
import { Avatar } from '@/components/avatar';
import {
  conductBlockReason,
  isDeputyOnly,
  permissionLabel,
  subjectBlockReason,
  useTaughtSubjects,
} from '@/components/teacher/test-helpers';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { api, qs } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { GRADE_LEVELS, useMySubjects } from '@/lib/teaching';
import type { Page, Subject, TestListItem } from '@/lib/types';

type Scope = 'mine' | 'shared' | 'school' | 'all';

const SCOPE_LABELS: Record<Scope, string> = {
  mine: 'Mening testlarim',
  shared: 'Menga ulashilgan',
  school: 'Maktab test banki',
  all: 'Barcha testlar',
};

const EMPTY_TEXT: Record<Scope, { title: string; description: string }> = {
  mine: {
    title: 'Sizda hali test yo‘q',
    description: 'Testlar kutubxonasida yangi test tuzing yoki maktab test bankidan tayyor testni tanlang.',
  },
  shared: {
    title: 'Siz bilan hali test ulashilmagan',
    description: 'Hamkasbingiz testini siz bilan ulashsa, u shu yerda ko‘rinadi.',
  },
  school: {
    title: 'Maktab test bankida hali test yo‘q',
    description: 'O‘qituvchilar o‘z testlarini “Maktab bankiga chiqarish” tugmasi bilan bankka qo‘shadi.',
  },
  all: { title: 'Testlar topilmadi', description: 'Filtrlarni o‘zgartirib ko‘ring.' },
};

/**
 * Sessiya uchun test tanlash: o‘zimniki, ulashilgan va maktab bankidagi testlar. Sessiya yaratib
 * bo‘lmaydigan testlar sababi bilan faol emas. O‘qituvchi faqat o‘zi dars beradigan fanlar bo‘yicha
 * o‘z sinflariga test o‘tkaza oladi — boshqa fanlar ogohlantirish bilan ko‘rsatiladi.
 */
export function TestPicker({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null;
  onSelect: (test: TestListItem) => void;
}) {
  const { data: me } = useMe();
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  const mySubjects = useMySubjects();
  const [scopeChoice, setScope] = useState<Scope | null>(null);
  const scope: Scope = scopeChoice ?? (isDeputyOnly(me) ? 'school' : 'mine');
  const [filters, setFilters] = useState({ q: '', subjectId: '', gradeLevel: '', page: 1 });
  const set = (patch: Partial<typeof filters>) => setFilters((current) => ({ ...current, page: 1, ...patch }));

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: () => api.get<Subject[]>('/subjects'),
    staleTime: 5 * 60_000,
  });
  const query = useQuery({
    queryKey: ['tests', 'picker', scope, filters],
    queryFn: () => api.get<Page<TestListItem>>(`/tests${qs({ scope, ...filters, q: filters.q.trim(), pageSize: 20 })}`),
    placeholderData: (previous) => previous,
    enabled: Boolean(me),
  });

  // O‘qituvchi uchun: dars beradigan fanlar (rahbariyat uchun cheklov yo‘q).
  const taught = useTaughtSubjects();
  const reasonFor = (test: TestListItem) => conductBlockReason(test) ?? subjectBlockReason(test, taught);
  const ownSubjects = (subjects.data ?? []).filter((subject) => !taught || taught.has(subject.id));
  const otherSubjects = taught ? (subjects.data ?? []).filter((subject) => !taught.has(subject.id)) : [];
  const scopes: Scope[] = leadership ? ['mine', 'shared', 'school', 'all'] : ['mine', 'shared', 'school'];
  const filtered = Boolean(filters.q.trim() || filters.subjectId || filters.gradeLevel);

  return (
    <div className="space-y-4">
      <Tabs<Scope>
        value={scope}
        onChange={(next) => {
          setScope(next);
          setFilters((current) => ({ ...current, page: 1 }));
        }}
        tabs={scopes.map((id) => ({ id, label: SCOPE_LABELS[id] }))}
      />
      {taught && scope !== 'mine' && (
        <Alert tone="info">
          Test faqat siz dars beradigan fan bo‘yicha o‘z sinflaringizga o‘tkaziladi
          {mySubjects.data?.length ? `: ${mySubjects.data.map((subject) => subject.name).join(', ')}` : ''}. Boshqa
          fanlardagi bank testlarini ko‘rishingiz va nusxa olishingiz mumkin, lekin sinfingizga tayinlay olmaysiz.
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Qidiruv">
          <Input
            type="search"
            value={filters.q}
            onChange={(event) => set({ q: event.target.value })}
            placeholder="Nom, mavzu, teg yoki muallif"
          />
        </Field>
        <Field label="Fan">
          <Select value={filters.subjectId} onChange={(event) => set({ subjectId: event.target.value })}>
            <option value="">Barcha fanlar</option>
            {taught ? (
              <>
                <optgroup label="Siz dars beradigan fanlar">
                  {ownSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </optgroup>
                {otherSubjects.length > 0 && (
                  <optgroup label="Boshqa fanlar">
                    {otherSubjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              ownSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))
            )}
          </Select>
        </Field>
        <Field label="Sinf darajasi">
          <Select value={filters.gradeLevel} onChange={(event) => set({ gradeLevel: event.target.value })}>
            <option value="">Barchasi</option>
            {GRADE_LEVELS.map((grade) => (
              <option key={grade} value={grade}>
                {grade}-sinf
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {query.isPending ? (
        <PageLoader />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="Mos test topilmadi" description="Qidiruv yoki filtrlarni o‘zgartiring." />
        ) : (
          <EmptyState
            icon={scope === 'school' ? Landmark : FileText}
            title={EMPTY_TEXT[scope].title}
            description={EMPTY_TEXT[scope].description}
            action={
              scope === 'mine' ? (
                <ButtonLink href="/teacher/tests" variant="outline">
                  Testlar kutubxonasi
                </ButtonLink>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <ul className="space-y-2" aria-label="Testlar">
            {query.data.items.map((test) => {
              const reason = reasonFor(test);
              const selected = test.id === selectedId;
              const mine = !taught || taught.has(test.subject.id);
              return (
                <li
                  key={test.id}
                  className={cn(
                    'flex flex-wrap items-start gap-3 rounded-xl border bg-surface p-3 sm:flex-nowrap',
                    selected ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-slate-200',
                    reason && 'bg-slate-50/60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-medium', reason ? 'text-slate-600' : 'text-slate-900')}>{test.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      <span className={cn(mine && taught && 'font-medium text-brand-700')}>
                        {mine && taught && <Check className="mr-0.5 inline size-3.5" aria-hidden />}
                        {test.subject.name}
                      </span>{' '}
                      · {test.gradeLevel}-sinf · {test.questionCount} ta savol · {formatPoints(test.totalPoints)} ball
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {test.permission === 'OWNER' ? (
                        <span>Muallif: siz</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Avatar name={test.owner.fullName} src={test.owner.avatarUrl} size="xs" />
                          {test.owner.fullName}
                        </span>
                      )}
                      {test.visibility === 'SCHOOL' && (
                        <Badge tone="brand">
                          <Landmark className="size-3" aria-hidden /> Maktab banki
                        </Badge>
                      )}
                      {test.permission !== 'OWNER' && test.permission !== 'SCHOOL' && (
                        <Badge tone="violet">Huquq: {permissionLabel(test.permission).toLowerCase()}</Badge>
                      )}
                      {test.publishedVersionNo !== null ? (
                        <Badge tone="green">Tayyor v{test.publishedVersionNo}</Badge>
                      ) : (
                        <Badge tone="gray">Hali muzlatilmagan</Badge>
                      )}
                      {test.hasDraftChanges && <Badge tone="amber">Qoralamada o‘zgarishlar bor</Badge>}
                    </div>
                    {reason && <p className="mt-1.5 text-xs font-medium text-amber-700">{reason}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/teacher/tests/${test.id}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100"
                      aria-label={`“${test.title}” testini yangi oynada ko‘rish`}
                    >
                      <ExternalLink className="size-4" aria-hidden />
                      <span className="hidden sm:inline">Ko‘rish</span>
                    </Link>
                    <Button
                      size="sm"
                      variant={selected ? 'secondary' : 'primary'}
                      disabled={Boolean(reason)}
                      icon={selected ? <Check className="size-4" /> : undefined}
                      onClick={() => onSelect(test)}
                      aria-label={reason ? `Tanlab bo‘lmaydi: ${reason}` : `“${test.title}” testini tanlash`}
                    >
                      {selected ? 'Tanlangan' : 'Tanlash'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={query.data.page}
            pageSize={query.data.pageSize}
            total={query.data.total}
            onChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        </>
      )}
    </div>
  );
}
