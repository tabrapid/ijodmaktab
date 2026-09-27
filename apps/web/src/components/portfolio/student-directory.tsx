'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, GraduationCap, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PORTFOLIO_ITEM_TYPES,
  PORTFOLIO_ITEM_TYPE_LABELS,
  TEACHER_ONLY_PORTFOLIO_TYPES,
  formatDate,
  formatInternalId,
} from '@ijod/shared';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { Table, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, downloadFile, errorMessage, qs } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { ClassListItem, Page, PortfolioDirectoryItem } from '@/lib/types';
import { pageNumber, pickEnum, useSearchDraft, useUrlState } from './use-url-state';
import { isUuid, portfolioKeys } from './utils';

const PAGE_SIZE = 25;

/** `type` va `status` nomlari “Barcha yozuvlar” yorlig‘iga tegishli, shuning uchun bu yerda boshqa nomlar. */
const FILTER_DEFAULTS = { q: '', class: '', grade: '', pending: '', has: '', sort: 'class', page: '1' };

const SORTS = [
  { value: 'class', label: 'Sinf, keyin F.I.Sh.', sort: 'class', order: 'asc' },
  { value: 'name', label: 'F.I.Sh. (A → Z)', sort: 'name', order: 'asc' },
  { value: 'approved', label: 'Eng ko‘p tasdiqlangan yutuq', sort: 'approved', order: 'desc' },
  { value: 'pending', label: 'Eng ko‘p kutilayotgan', sort: 'pending', order: 'desc' },
  { value: 'lastActivity', label: 'Oxirgi faollik', sort: 'lastActivity', order: 'desc' },
] as const;

const TYPE_OPTIONS = PORTFOLIO_ITEM_TYPES.filter((type) => !TEACHER_ONLY_PORTFOLIO_TYPES.includes(type));

function Highlights({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <span className={cn('flex flex-wrap gap-1', className)}>
      {items.map((text) => (
        <Badge key={text} tone="violet">
          {text}
        </Badge>
      ))}
    </span>
  );
}

function PendingBadge({ count }: { count: number }) {
  return count > 0 ? (
    <Badge tone="amber" className="tabular">
      {count} ta kutmoqda
    </Badge>
  ) : (
    <span className="text-slate-400">—</span>
  );
}

/**
 * Rahbariyat uchun maktab o‘quvchilari katalogi: har bir o‘quvchi — bitta qator, sinf va boshqa
 * filtrlar bilan. Qatorni bosish o‘quvchining jamlangan portfoliosini ochadi.
 */
export function StudentDirectory() {
  const router = useRouter();
  const toast = useToast();
  const [filters, setFilters] = useUrlState(FILTER_DEFAULTS);
  const [search, setSearch] = useSearchDraft(filters.q, (value) => setFilters({ q: value, page: '1' }));

  const classes = useQuery({
    queryKey: ['classes', 'all'],
    queryFn: () => api.get<ClassListItem[]>('/classes?scope=all'),
    staleTime: 5 * 60_000,
  });
  const grades = [...new Set((classes.data ?? []).map((item) => item.gradeLevel))].sort((a, b) => a - b);

  const classId = isUuid(filters.class) ? filters.class : undefined;
  const gradeLevel = /^\d{1,2}$/.test(filters.grade) ? Number(filters.grade) : undefined;
  const type = pickEnum(filters.has, TYPE_OPTIONS);
  const pending = filters.pending === 'true' ? 'true' : undefined;
  const sort = SORTS.find((option) => option.value === filters.sort) ?? SORTS[0];
  const page = pageNumber(filters.page);
  const params = {
    q: filters.q || undefined,
    classId,
    gradeLevel,
    pending,
    type,
    sort: sort.sort,
    order: sort.order,
  };

  const list = useQuery({
    queryKey: portfolioKeys.students({ ...params, page }),
    queryFn: () =>
      api.get<Page<PortfolioDirectoryItem>>(`/portfolio/students${qs({ ...params, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });

  const exportXlsx = useMutation({
    mutationFn: () => downloadFile(`/portfolio/students.xlsx${qs(params)}`, 'portfoliolar.xlsx'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changed = Boolean(filters.q || classId || gradeLevel || pending || type) || sort.value !== 'class';
  const items = list.data?.items ?? [];
  const open = (id: string) => router.push(`/portfolio/students/${id}`);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Qidirish" className="sm:col-span-2">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="F.I.Sh. yoki ichki ID…"
                maxLength={100}
              />
            </Field>
            <Field label="Sinf">
              <Select
                value={classId ?? ''}
                onChange={(event) => setFilters({ class: event.target.value, page: '1' })}
                disabled={classes.isPending}
              >
                <option value="">{classes.isPending ? 'Yuklanmoqda…' : 'Barcha sinflar'}</option>
                {classes.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Parallel">
              <Select
                value={gradeLevel ? String(gradeLevel) : ''}
                onChange={(event) => setFilters({ grade: event.target.value, page: '1' })}
              >
                <option value="">Barcha parallellar</option>
                {grades.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}-sinflar
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Turi bo‘yicha">
              <Select value={type ?? ''} onChange={(event) => setFilters({ has: event.target.value, page: '1' })}>
                <option value="">Farqi yo‘q</option>
                {TYPE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {PORTFOLIO_ITEM_TYPE_LABELS[value]} bor
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Saralash">
              <Select value={sort.value} onChange={(event) => setFilters({ sort: event.target.value, page: '1' })}>
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Checkbox
              label="Faqat tekshiruvni kutayotganlar"
              checked={Boolean(pending)}
              onChange={(event) => setFilters({ pending: event.target.checked ? 'true' : '', page: '1' })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-600" aria-live="polite">
                {list.data ? (
                  <>
                    Topildi: <span className="font-semibold tabular">{list.data.total}</span> ta o‘quvchi
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportXlsx.mutate()}
                loading={exportXlsx.isPending}
                disabled={!list.data?.total}
                icon={<FileSpreadsheet className="size-4" aria-hidden />}
              >
                Excelga yuklab olish
              </Button>
            </div>
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
              title="Mos o‘quvchi topilmadi"
              description="Filtrlarni o‘zgartiring yoki tozalang."
            />
          ) : (
            <EmptyState
              icon={GraduationCap}
              title="O‘quvchilar yo‘q"
              description="Joriy o‘quv yilida sinflarga biriktirilgan faol o‘quvchilar shu yerda ko‘rinadi."
            />
          )
        ) : (
          <div className={cn('relative', list.isPlaceholderData && 'opacity-60')}>
            {list.isPlaceholderData && (
              <div className="absolute top-2 right-3 text-brand-600">
                <Spinner className="size-4" label="Yangilanmoqda…" />
              </div>
            )}

            {/* Telefon: kartochkalar */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/portfolio/students/${item.id}`}
                    className="flex gap-3 px-4 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                  >
                    <Avatar name={item.fullName} src={item.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block font-medium break-words text-slate-900">{item.fullName}</span>
                      <span className="block text-xs text-slate-500">
                        {item.className} sinf · ID {formatInternalId(item.internalId)}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span>
                          Tasdiqlangan: <strong className="tabular">{item.counts.approved}</strong>
                        </span>
                        <span>
                          Sertifikatlar: <strong className="tabular">{item.certificates}</strong>
                        </span>
                        <PendingBadge count={item.counts.pending} />
                      </span>
                      {item.highlights.length > 0 && <Highlights items={item.highlights} />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Katta ekran: jadval */}
            <div className="hidden md:block">
              <Table caption="O‘quvchilar portfoliosi">
                <THead>
                  <tr>
                    <TH>O‘quvchi</TH>
                    <TH>Sinf</TH>
                    <TH className="text-right">Tasdiqlangan</TH>
                    <TH>Kutilmoqda</TH>
                    <TH className="text-right">Sertifikatlar</TH>
                    <TH className="text-right">Olimpiadalar</TH>
                    <TH>Asosiy natijalar</TH>
                    <TH>Oxirgi faollik</TH>
                  </tr>
                </THead>
                <tbody>
                  {items.map((item) => (
                    <TR key={item.id} className="cursor-pointer" onClick={() => open(item.id)}>
                      <TD className="min-w-56">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={item.fullName} src={item.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <Link
                              href={`/portfolio/students/${item.id}`}
                              onClick={(event) => event.stopPropagation()}
                              className="font-medium text-slate-900 hover:text-brand-700 hover:underline"
                            >
                              {item.fullName}
                            </Link>
                            <p className="text-xs text-slate-500 tabular">ID {formatInternalId(item.internalId)}</p>
                          </div>
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap">{item.className}</TD>
                      <TD className="text-right font-semibold tabular">{item.counts.approved}</TD>
                      <TD className="whitespace-nowrap">
                        <PendingBadge count={item.counts.pending} />
                      </TD>
                      <TD className="text-right tabular">{item.certificates}</TD>
                      <TD className="text-right tabular">{item.olympiads}</TD>
                      <TD className="min-w-48">
                        <Highlights items={item.highlights} />
                      </TD>
                      <TD className="text-sm whitespace-nowrap text-slate-600">
                        {item.lastActivityAt ? formatDate(item.lastActivityAt) : '—'}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>

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
