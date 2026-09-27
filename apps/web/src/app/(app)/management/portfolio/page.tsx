'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SearchX, Trophy } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  ACHIEVEMENT_LEVELS,
  ACHIEVEMENT_LEVEL_LABELS,
  PORTFOLIO_ITEM_TYPES,
  PORTFOLIO_ITEM_TYPE_LABELS,
  PORTFOLIO_STATUSES,
  PORTFOLIO_STATUS_LABELS,
  ROLE_LABELS,
  formatDate,
  formatInternalId,
} from '@ijod/shared';
import { RequireRole } from '@/components/app-shell';
import { LevelBadge } from '@/components/portfolio/parts';
import { useSubjects } from '@/components/portfolio/queries';
import { pageNumber, pickEnum, useSearchDraft, useUrlState } from '@/components/portfolio/use-url-state';
import { isUuid, portfolioKeys } from '@/components/portfolio/utils';
import { PortfolioStatusBadge } from '@/components/status';
import { Button } from '@/components/ui/button';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';
import { api, qs } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Page, PortfolioItemView } from '@/lib/types';

const PAGE_SIZE = 25;
const ALL = 'ALL';

const FILTER_DEFAULTS = {
  status: 'APPROVED',
  type: '',
  level: '',
  subjectId: '',
  from: '',
  to: '',
  q: '',
  sort: 'date:desc',
  page: '1',
};

const SORT_OPTIONS = [
  { value: 'date:desc', label: 'Sana: avval yangilari' },
  { value: 'date:asc', label: 'Sana: avval eskilari' },
  { value: 'level:desc', label: 'Bosqich: avval yuqorisi' },
  { value: 'level:asc', label: 'Bosqich: avval maktab' },
  { value: 'owner:asc', label: 'Egasi: A → Z' },
  { value: 'owner:desc', label: 'Egasi: Z → A' },
  { value: 'updatedAt:desc', label: 'Oxirgi o‘zgartirilgan' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateParam = (value: string) => (DATE.test(value) ? value : undefined);

function SchoolPortfolio() {
  const [filters, setFilters] = useUrlState(FILTER_DEFAULTS);
  const [search, setSearch] = useSearchDraft(filters.q, (value) => setFilters({ q: value, page: '1' }));
  const subjects = useSubjects();

  const status = pickEnum(filters.status, PORTFOLIO_STATUSES);
  const type = pickEnum(filters.type, PORTFOLIO_ITEM_TYPES);
  const level = pickEnum(filters.level, ACHIEVEMENT_LEVELS);
  const subjectId = isUuid(filters.subjectId) ? filters.subjectId : undefined;
  const from = dateParam(filters.from);
  const to = dateParam(filters.to);
  const sortValue = SORT_OPTIONS.find((option) => option.value === filters.sort)?.value ?? 'date:desc';
  const [sort, order] = sortValue.split(':');
  const page = pageNumber(filters.page);
  const params = {
    status,
    type,
    level,
    subjectId,
    from,
    to,
    q: filters.q || undefined,
    sort,
    order,
    page,
    pageSize: PAGE_SIZE,
  };

  const list = useQuery({
    queryKey: portfolioKeys.school(params),
    queryFn: () => api.get<Page<PortfolioItemView>>(`/portfolio/school${qs(params)}`),
    placeholderData: keepPreviousData,
  });

  const changed =
    filters.status !== FILTER_DEFAULTS.status ||
    Boolean(type || level || subjectId || from || to || filters.q) ||
    sortValue !== 'date:desc';
  const rangeInvalid = Boolean(from && to && from > to);
  const items = list.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Maktab portfoliosi"
        description="O‘quvchi va o‘qituvchilar yutuqlari bo‘yicha qidiruv. Standart holatda faqat tasdiqlangan yozuvlar ko‘rsatiladi — tasdiqlanmaganlar yutuq hisoblanmaydi."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Qidirish" className="sm:col-span-2 lg:col-span-3">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nomi, yo‘nalish, tashkilot yoki natija…"
                maxLength={100}
              />
            </Field>
            <Field label="Holat">
              <Select value={status ?? ALL} onChange={(event) => setFilters({ status: event.target.value, page: '1' })}>
                <option value={ALL}>Barcha holatlar</option>
                {PORTFOLIO_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {PORTFOLIO_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Saralash">
              <Select value={sortValue} onChange={(event) => setFilters({ sort: event.target.value, page: '1' })}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Turi">
              <Select value={type ?? ''} onChange={(event) => setFilters({ type: event.target.value, page: '1' })}>
                <option value="">Barcha turlar</option>
                {PORTFOLIO_ITEM_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {PORTFOLIO_ITEM_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bosqich">
              <Select value={level ?? ''} onChange={(event) => setFilters({ level: event.target.value, page: '1' })}>
                <option value="">Barcha bosqichlar</option>
                {ACHIEVEMENT_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {ACHIEVEMENT_LEVEL_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fan">
              <Select
                value={subjectId ?? ''}
                onChange={(event) => setFilters({ subjectId: event.target.value, page: '1' })}
                disabled={subjects.isPending}
              >
                <option value="">{subjects.isPending ? 'Yuklanmoqda…' : 'Barcha fanlar'}</option>
                {subjects.data?.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sanadan" error={rangeInvalid ? 'Boshlanish sanasi oxirgi sanadan keyin' : null}>
              <Input
                type="date"
                value={from ?? ''}
                max={to}
                onChange={(event) => setFilters({ from: event.target.value, page: '1' })}
              />
            </Field>
            <Field label="Sanagacha">
              <Input
                type="date"
                value={to ?? ''}
                min={from}
                onChange={(event) => setFilters({ to: event.target.value, page: '1' })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600" aria-live="polite">
              {list.data ? (
                <>
                  Topildi: <span className="font-semibold tabular">{list.data.total}</span> ta yozuv
                </>
              ) : (
                ' '
              )}
            </p>
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
        ) : items.length === 0 ? (
          changed ? (
            <EmptyState
              icon={SearchX}
              title="Mos yozuv topilmadi"
              description="Filtrlarni o‘zgartiring yoki tozalang."
            />
          ) : (
            <EmptyState
              icon={Trophy}
              title="Tasdiqlangan yozuvlar hali yo‘q"
              description="Yozuvlar tasdiqlangach shu yerda ko‘rinadi."
            />
          )
        ) : (
          <div className={cn('relative', list.isPlaceholderData && 'opacity-60')}>
            {list.isPlaceholderData && (
              <div className="absolute top-2 right-3 text-brand-600">
                <Spinner className="size-4" label="Yangilanmoqda…" />
              </div>
            )}
            <Table caption="Maktab portfoliosi yozuvlari">
              <THead>
                <tr>
                  <TH>Egasi</TH>
                  <TH>Sinf</TH>
                  <TH>Yozuv</TH>
                  <TH>Bosqich</TH>
                  <TH>Sana</TH>
                  <TH>Natija</TH>
                  <TH>Holat</TH>
                </tr>
              </THead>
              <tbody>
                {items.map((item) => (
                  <TR key={item.id}>
                    <TD className="min-w-44">
                      <p className="font-medium text-slate-900">{item.owner.fullName}</p>
                      <p className="text-xs text-slate-500 tabular">
                        ID {formatInternalId(item.owner.internalId)}
                        {!item.owner.roles.includes('STUDENT') &&
                          ` · ${item.owner.roles.map((role) => ROLE_LABELS[role]).join(', ')}`}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap">{item.owner.className ?? '—'}</TD>
                    <TD className="min-w-56">
                      <Link href={`/portfolio/${item.id}`} className="font-medium text-brand-700 hover:underline">
                        {item.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {item.typeLabel}
                        {item.subject ? ` · ${item.subject.name}` : ''}
                        {item.organization ? ` · ${item.organization}` : ''}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap">{item.level ? <LevelBadge level={item.level} /> : '—'}</TD>
                    <TD className="whitespace-nowrap tabular">{item.date ? formatDate(item.date) : '—'}</TD>
                    <TD>{item.result ?? '—'}</TD>
                    <TD className="whitespace-nowrap">
                      <PortfolioStatusBadge status={item.status} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
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
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ManagementPortfolioPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RequireRole roles={['DEPUTY', 'SUPER_ADMIN']}>
        <SchoolPortfolio />
      </RequireRole>
    </Suspense>
  );
}
