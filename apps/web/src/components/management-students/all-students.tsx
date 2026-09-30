'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { GraduationCap, SearchX } from 'lucide-react';
import Link from 'next/link';
import { memo, useMemo, useState, type CSSProperties } from 'react';
import { SCHOOL_GRADE_LEVELS, USER_STATUSES, USER_STATUS_LABELS } from '@ijod/shared';
import { Avatar } from '@/components/avatar';
import { pageNumber, pickEnum, useSearchDraft, useUrlState } from '@/components/portfolio/use-url-state';
import { isUuid } from '@/components/portfolio/utils';
import { UserStatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { api, qs } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { ManagementClassCard, ManagementStudentPage, ManagementStudentRow, PersonRef } from '@/lib/types';
import { classHref } from './class-cards';
import { managementKeys, useManagementClasses } from './queries';
import { isNewRegistration, NewBadge, PortfolioCounts } from './student-bits';

/** Butun maktab (~500 o‘quvchi) bitta sahifaga sig‘adi (API ruxsat bergan eng katta qiymat). */
const PAGE_SIZE = 1000;

const FILTER_DEFAULTS = { q: '', class: '', grade: '', status: '', source: '', noClass: '', page: '1' };

/** Qator ustunlari: rasm, F.I.Sh. va login, holat, portfolio (telefonda holat va portfolio ism ostida). */
const ROW_GRID = 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 md:grid-cols-[auto_minmax(0,1fr)_11rem_7rem]';

interface Group {
  key: string;
  classId: string | null;
  className: string | null;
  homeroom: PersonRef | null;
  count: number;
  rows: ManagementStudentRow[];
}

/** Server tartibidagi qatorlarni sinflar bo‘yicha guruhlaydi (guruhdagi jami son — butun natija bo‘yicha). */
function groupRows(page: ManagementStudentPage): Group[] {
  const counts = new Map(page.groups.map((group) => [group.classId, group.count]));
  const groups: Group[] = [];
  for (const row of page.items) {
    let last = groups.at(-1);
    if (!last || last.classId !== row.classId) {
      last = {
        key: row.classId ?? 'none',
        classId: row.classId,
        className: row.className,
        homeroom: row.homeroomTeacher,
        count: counts.get(row.classId) ?? 0,
        rows: [],
      };
      groups.push(last);
    }
    last.rows.push(row);
  }
  return groups;
}

const StudentRow = memo(function StudentRow({ row, now }: { row: ManagementStudentRow; now: number }) {
  return (
    <li>
      {/* Yuzlab qator: har biri ko‘ringanda sahifani oldindan yuklash so‘rovlari yuborilmasin. */}
      <Link
        href={`/management/students/${row.id}`}
        prefetch={false}
        className={cn(
          ROW_GRID,
          'items-center gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2',
        )}
      >
        <Avatar name={row.fullName} src={row.avatarUrl} size="sm" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium break-words text-slate-900">{row.fullName}</span>
            {isNewRegistration(row.registrationSource, row.createdAt, now) && <NewBadge />}
          </span>
          <span className="block truncate font-mono text-xs text-slate-500">{row.login}</span>
        </span>
        {/* Telefonda bitta qatorda ism ostida, katta ekranda alohida ustunlarda. */}
        <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
          <span>
            <UserStatusBadge status={row.status} />
          </span>
          <PortfolioCounts counts={row.portfolio} />
        </span>
      </Link>
    </li>
  );
});

function GroupSection({ group, now }: { group: Group; now: number }) {
  const headingId = `group-${group.key}`;
  // Ekrandan tashqaridagi guruhlar chizilmaydi (uzun ro‘yxat tez ochiladi); taxminiy balandlik — qatorlar soni bo‘yicha.
  const style: CSSProperties = {
    contentVisibility: 'auto',
    containIntrinsicSize: `auto ${44 + group.rows.length * 60}px`,
  };
  return (
    <section aria-labelledby={headingId} style={style}>
      <h2
        id={headingId}
        className="sticky top-16 z-10 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-y border-slate-200 bg-slate-50/95 px-4 py-2 text-sm backdrop-blur-sm"
      >
        {group.classId ? (
          <>
            <span className="font-display text-base font-semibold text-slate-900">{group.className}</span>
            <span aria-hidden className="text-slate-400">
              ·
            </span>
            <span className="text-slate-600">
              sinf rahbari:{' '}
              {group.homeroom ? (
                <span className="font-medium text-slate-800">{group.homeroom.fullName}</span>
              ) : (
                <span className="font-medium text-amber-700">tayinlanmagan</span>
              )}
            </span>
          </>
        ) : (
          <span className="font-semibold text-amber-700">Sinfga biriktirilmagan</span>
        )}
        <span aria-hidden className="text-slate-400">
          ·
        </span>
        <span className="text-slate-600 tabular">{group.count} o‘quvchi</span>
        {group.classId && (
          <Link
            href={classHref(group.classId)}
            className="ml-auto text-xs font-medium text-brand-700 hover:underline"
            aria-label={`${group.className} sinf sahifasi`}
          >
            Sinf sahifasi
          </Link>
        )}
      </h2>
      <ul className="divide-y divide-slate-100">
        {group.rows.map((row) => (
          <StudentRow key={row.id} row={row} now={now} />
        ))}
      </ul>
    </section>
  );
}

function ClassOptions({ classes }: { classes: readonly ManagementClassCard[] }) {
  const grades = [...new Set(classes.map((item) => item.gradeLevel))];
  return grades.map((grade) => (
    <optgroup key={grade} label={`${grade}-sinflar`}>
      {classes
        .filter((item) => item.gradeLevel === grade)
        .map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
    </optgroup>
  ));
}

/**
 * “Barcha o‘quvchilar” yorlig‘i: qidiruv va filtrlar (manzil satrida saqlanadi), natija sinflar bo‘yicha
 * guruhlangan (11 → 7, sinfsizlar oxirida), guruh sarlavhalari aylantirishda yuqorida turadi.
 * Komponent <Suspense> ichida ishlatilishi shart.
 */
export function AllStudents() {
  const [filters, setFilters] = useUrlState(FILTER_DEFAULTS);
  const [search, setSearch] = useSearchDraft(filters.q, (value) => setFilters({ q: value, page: '1' }));
  const classes = useManagementClasses();
  // “Yangi” belgisi uchun vaqt bir marta olinadi (har qatorda Date.now() chaqirilmaydi).
  const [now] = useState(() => Date.now());

  const noClass = filters.noClass === 'true';
  const classId = !noClass && isUuid(filters.class) ? filters.class : undefined;
  const gradeLevel = !noClass && /^\d{1,2}$/.test(filters.grade) ? Number(filters.grade) : undefined;
  const status = pickEnum(filters.status, USER_STATUSES);
  const source = filters.source === 'SELF' ? 'SELF' : undefined;
  const page = pageNumber(filters.page);
  const params = {
    q: filters.q || undefined,
    classId,
    gradeLevel,
    status,
    source,
    noClass: noClass ? 'true' : undefined,
  };

  const list = useQuery({
    queryKey: managementKeys.students({ ...params, page }),
    queryFn: () =>
      api.get<ManagementStudentPage>(`/management/students${qs({ ...params, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });
  const groups = useMemo(() => (list.data ? groupRows(list.data) : []), [list.data]);

  const classList = classes.data ?? [];
  const grades = classList.length
    ? [...new Set(classList.map((item) => item.gradeLevel))]
    : [...SCHOOL_GRADE_LEVELS].reverse();
  const changed = Boolean(filters.q || classId || gradeLevel || status || source || noClass);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <Field label="Qidirish" className="sm:col-span-2 lg:col-span-1">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="F.I.Sh., login yoki ichki ID…"
                maxLength={100}
                autoComplete="off"
              />
            </Field>
            <Field label="Sinf">
              <Select
                value={classId ?? ''}
                onChange={(event) => setFilters({ class: event.target.value, page: '1' })}
                disabled={noClass || classes.isPending}
              >
                <option value="">{classes.isPending ? 'Yuklanmoqda…' : 'Barcha sinflar'}</option>
                <ClassOptions classes={classList} />
              </Select>
            </Field>
            <Field label="Parallel">
              <Select
                value={gradeLevel ? String(gradeLevel) : ''}
                onChange={(event) => setFilters({ grade: event.target.value, page: '1' })}
                disabled={noClass}
              >
                <option value="">Barcha parallellar</option>
                {grades.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}-sinflar
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Holat">
              <Select value={status ?? ''} onChange={(event) => setFilters({ status: event.target.value, page: '1' })}>
                <option value="">Barcha holatlar</option>
                {USER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {USER_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Checkbox
                label="Faqat o‘zi ro‘yxatdan o‘tganlar"
                checked={Boolean(source)}
                onChange={(event) => setFilters({ source: event.target.checked ? 'SELF' : '', page: '1' })}
              />
              <Checkbox
                label="Faqat sinfsizlar"
                checked={noClass}
                onChange={(event) =>
                  setFilters({ noClass: event.target.checked ? 'true' : '', class: '', grade: '', page: '1' })
                }
              />
            </div>
            {changed && (
              <Button variant="ghost" size="sm" onClick={() => setFilters({ ...FILTER_DEFAULTS })}>
                Filtrlarni tozalash
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        {list.isPending ? (
          <PageLoader />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : list.data.total === 0 ? (
          changed ? (
            <EmptyState
              icon={SearchX}
              title="Mos o‘quvchi topilmadi"
              description="Filtrlarni o‘zgartiring yoki tozalang."
              action={
                <Button variant="outline" size="sm" onClick={() => setFilters({ ...FILTER_DEFAULTS })}>
                  Filtrlarni tozalash
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={GraduationCap}
              title="Hali o‘quvchilar yo‘q"
              description="O‘quvchilar o‘zi ro‘yxatdan o‘tganda yoki hisoblari yaratilganda shu yerda sinflar bo‘yicha ko‘rinadi."
            />
          )
        ) : (
          <div className={cn(list.isPlaceholderData && 'opacity-60')}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <p className="text-sm text-slate-600" aria-live="polite">
                {changed ? 'Topildi' : 'Jami'}:{' '}
                <span className="font-semibold text-slate-900 tabular">{list.data.total}</span> nafar o‘quvchi
              </p>
              {list.isPlaceholderData && <Spinner className="size-4 text-brand-700" label="Yangilanmoqda…" />}
            </div>
            <div
              aria-hidden
              className={cn(
                ROW_GRID,
                'hidden border-t border-slate-200 px-4 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase md:grid',
              )}
            >
              <span className="col-span-2">O‘quvchi</span>
              <span>Holat</span>
              <span>Portfolio</span>
            </div>
            {groups.map((group) => (
              <GroupSection key={group.key} group={group} now={now} />
            ))}
            {list.data.total > PAGE_SIZE && (
              <div className="border-t border-slate-100 px-4 py-3">
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={list.data.total}
                  onChange={(next) => {
                    setFilters({ page: String(next) });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
