'use client';

import { keepPreviousData, useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Eye, FolderHeart, Pencil, Plus, Printer, SearchX, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import {
  ACHIEVEMENT_LEVELS,
  ACHIEVEMENT_LEVEL_LABELS,
  PORTFOLIO_ITEM_TYPES,
  PORTFOLIO_ITEM_TYPE_LABELS,
  PORTFOLIO_STATUSES,
  PORTFOLIO_STATUS_LABELS,
  TEACHER_ONLY_PORTFOLIO_TYPES,
  formatDate,
  formatHumanDateTime,
  type PortfolioStatus,
} from '@ijod/shared';
import { RequireRole } from '@/components/app-shell';
import {
  AuthorshipNote,
  EvidenceLinks,
  LevelBadge,
  PortfolioMeta,
  ReturnReasonAlert,
} from '@/components/portfolio/parts';
import { PortfolioFormDialog } from '@/components/portfolio/portfolio-form';
import { usePortfolioActions } from '@/components/portfolio/queries';
import { pageNumber, pickEnum, useSearchDraft, useUrlState } from '@/components/portfolio/use-url-state';
import { canDeleteItem, canSubmitItem, isCreativeType, portfolioKeys, printHref } from '@/components/portfolio/utils';
import { PortfolioStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, qs } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { Page, PortfolioItemView } from '@/lib/types';

const PAGE_SIZE = 20;

const FILTER_DEFAULTS = { status: '', type: '', level: '', q: '', sort: 'date:desc', page: '1', new: '' };

const SORT_OPTIONS = [
  { value: 'date:desc', label: 'Sana: avval yangilari' },
  { value: 'date:asc', label: 'Sana: avval eskilari' },
  { value: 'level:desc', label: 'Bosqich: avval yuqorisi' },
  { value: 'level:asc', label: 'Bosqich: avval maktab' },
  { value: 'updatedAt:desc', label: 'Oxirgi o‘zgartirilgan' },
];

const STATUS_HINTS: Record<PortfolioStatus, string> = {
  DRAFT: 'Hali yuborilmagan',
  SUBMITTED: 'Tasdiqlovchida',
  APPROVED: 'Tasdiqlangan yutuqlar',
  RETURNED: 'Tuzatish kerak',
};

type StatusCounts = Record<PortfolioStatus, number>;

/** Har holat bo‘yicha aniq son (sahifalangan ro‘yxatning `total` qiymati). */
async function fetchCounts(): Promise<StatusCounts> {
  const pages = await Promise.all(
    PORTFOLIO_STATUSES.map((status) => api.get<Page<PortfolioItemView>>(`/portfolio${qs({ status, pageSize: 1 })}`)),
  );
  return Object.fromEntries(
    PORTFOLIO_STATUSES.map((status, index) => [status, pages[index]?.total ?? 0]),
  ) as StatusCounts;
}

function StatusSummary({
  counts,
  active,
  onSelect,
}: {
  counts: UseQueryResult<StatusCounts>;
  active: PortfolioStatus | undefined;
  onSelect: (status: PortfolioStatus) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Holatlar bo‘yicha yozuvlar soni">
      {PORTFOLIO_STATUSES.map((status) => {
        const pressed = active === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(status)}
            className={cn(
              'rounded-xl border bg-surface p-4 text-left shadow-xs transition-colors hover:border-brand-300',
              pressed ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200',
            )}
          >
            <PortfolioStatusBadge status={status} />
            <span className="mt-2 block text-2xl font-semibold text-slate-900 tabular">
              {counts.data ? counts.data[status] : counts.isError ? '—' : '…'}
            </span>
            <span className="block text-xs text-slate-500">{STATUS_HINTS[status]}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatusNote({ item }: { item: PortfolioItemView }) {
  const text = {
    DRAFT: 'Qoralama — tasdiqlanishi uchun tekshiruvga yuboring. Tasdiqlanmagan yozuv yutuqlar hisobiga kirmaydi.',
    SUBMITTED: `Tekshiruvga yuborilgan: ${formatHumanDateTime(item.submittedAt)}. Tasdiqlovchi ko‘rib chiqmoqda.`,
    APPROVED: `Tasdiqladi: ${item.reviewer?.fullName ?? '—'}, ${formatDate(item.reviewedAt)}.`,
    RETURNED: 'Sababni o‘qib, yozuvni tuzating va tekshiruvga qayta yuboring.',
  }[item.status];
  return <p className="text-xs text-slate-500">{text}</p>;
}

function ItemCard({
  item,
  selected,
  submitting,
  onToggle,
  onEdit,
  onSubmit,
  onDelete,
}: {
  item: PortfolioItemView;
  selected: boolean;
  submitting: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSubmit: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn(
        'rounded-xl border bg-surface p-4 shadow-xs transition-colors',
        selected ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200',
      )}
    >
      <div className="flex gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`“${item.title}” yozuvini chop etish uchun tanlash`}
          className="mt-1 size-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <Link
              href={`/portfolio/${item.id}`}
              className="min-w-0 font-semibold break-words text-slate-900 hover:text-brand-700 hover:underline"
            >
              {item.title}
            </Link>
            <PortfolioStatusBadge status={item.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gray">{item.typeLabel}</Badge>
            {item.level && <LevelBadge level={item.level} />}
          </div>
          <PortfolioMeta item={item} withTypeAndLevel={false} />
          {isCreativeType(item.type) && <AuthorshipNote author={item.owner.fullName} />}
          {item.status === 'RETURNED' && <ReturnReasonAlert reason={item.returnReason} />}
          <StatusNote item={item} />
          <EvidenceLinks file={item.evidenceFile} url={item.evidenceUrl} />
          <div className="flex flex-wrap gap-2 pt-1">
            <ButtonLink
              href={`/portfolio/${item.id}`}
              variant="ghost"
              size="sm"
              icon={<Eye className="size-4" aria-hidden />}
            >
              Batafsil
            </ButtonLink>
            <Button variant="outline" size="sm" onClick={onEdit} icon={<Pencil className="size-4" aria-hidden />}>
              Tahrirlash
            </Button>
            {canSubmitItem(item.status) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onSubmit}
                loading={submitting}
                icon={<Send className="size-4" aria-hidden />}
              >
                Tekshiruvga yuborish
              </Button>
            )}
            {canDeleteItem(item.status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                icon={<Trash2 className="size-4 text-red-600" aria-hidden />}
              >
                <span className="text-red-700">O‘chirish</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function MyPortfolio() {
  const router = useRouter();
  const toast = useToast();
  const { data: me } = useMe();
  const [filters, setFilters] = useUrlState(FILTER_DEFAULTS);
  const [search, setSearch] = useSearchDraft(filters.q, (value) => setFilters({ q: value, page: '1' }));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PortfolioItemView | null>(null);
  const [deleting, setDeleting] = useState<PortfolioItemView | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const { submit, remove } = usePortfolioActions();
  const staff = hasRole(me, 'TEACHER', 'DEPUTY', 'ADMIN', 'SUPER_ADMIN');

  const status = pickEnum(filters.status, PORTFOLIO_STATUSES);
  const type = pickEnum(filters.type, PORTFOLIO_ITEM_TYPES);
  const level = pickEnum(filters.level, ACHIEVEMENT_LEVELS);
  const sortValue = SORT_OPTIONS.find((option) => option.value === filters.sort)?.value ?? 'date:desc';
  const [sort, order] = sortValue.split(':');
  const page = pageNumber(filters.page);
  const params = { status, type, level, q: filters.q || undefined, sort, order, page, pageSize: PAGE_SIZE };

  const list = useQuery({
    queryKey: portfolioKeys.mineList(params),
    queryFn: () => api.get<Page<PortfolioItemView>>(`/portfolio${qs(params)}`),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({ queryKey: portfolioKeys.mineCounts, queryFn: fetchCounts });

  // Oxirgi sahifadagi yozuvlar o‘chirilsa, mavjud oxirgi sahifaga o‘tiladi.
  const lastPage = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  useEffect(() => {
    if (list.data && !list.isPlaceholderData && page > lastPage) setFilters({ page: String(lastPage) });
  }, [list.data, list.isPlaceholderData, page, lastPage, setFilters]);

  const selectApproved = useMutation({
    mutationFn: () => api.get<Page<PortfolioItemView>>(`/portfolio${qs({ status: 'APPROVED', pageSize: 200 })}`),
    onSuccess: (result) => {
      setSelected((current) => new Set([...current, ...result.items.map((item) => item.id)]));
      toast.info(
        result.items.length
          ? `${result.items.length} ta tasdiqlangan yozuv tanlandi.`
          : 'Tasdiqlangan yozuvlar hali yo‘q.',
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const items = list.data?.items ?? [];
  const pageIds = items.map((item) => item.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const hasFilters = Boolean(status || type || level || filters.q);
  const createOpen = creating || filters.new === '1';

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (allOnPage) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const closeCreate = () => {
    setCreating(false);
    if (filters.new) setFilters({ new: '' });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    remove.mutate(id, {
      onSuccess: () =>
        setSelected((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        }),
      onSettled: () => setDeleting(null),
    });
  };

  const print = () => {
    if (me && selected.size > 0) router.push(printHref(me.id, [...selected]));
  };

  const typeOptions = PORTFOLIO_ITEM_TYPES.filter((value) => staff || !TEACHER_ONLY_PORTFOLIO_TYPES.includes(value));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfoliom"
        description="Yutuqlar, sertifikatlar va ijodiy ishlaringiz. Portfolio ommaga ochiq emas; faqat tasdiqlangan yozuvlar tasdiqlangan yutuq hisoblanadi."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
            Yangi yozuv
          </Button>
        }
      />

      <StatusSummary
        counts={counts}
        active={status}
        onSelect={(value) => setFilters({ status: value === status ? '' : value, page: '1' })}
      />

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Qidirish" className="sm:col-span-2 lg:col-span-1">
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nomi, tashkilot, natija…"
              maxLength={100}
            />
          </Field>
          <Field label="Holat">
            <Select value={status ?? ''} onChange={(event) => setFilters({ status: event.target.value, page: '1' })}>
              <option value="">Barcha holatlar</option>
              {PORTFOLIO_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PORTFOLIO_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Turi">
            <Select value={type ?? ''} onChange={(event) => setFilters({ type: event.target.value, page: '1' })}>
              <option value="">Barcha turlar</option>
              {typeOptions.map((value) => (
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
          <Field label="Saralash">
            <Select value={sortValue} onChange={(event) => setFilters({ sort: event.target.value, page: '1' })}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {(items.length > 0 || selected.size > 0) && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-surface px-4 py-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
          <Checkbox
            label="Sahifadagi barcha yozuvlarni tanlash"
            description="Chop etilgan hujjatda faqat tasdiqlangan yozuvlar “Tasdiqlangan yutuqlar” bo‘limiga kiradi."
            checked={allOnPage}
            onChange={togglePage}
            disabled={pageIds.length === 0}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600" aria-live="polite">
              {selected.size > 0 ? `${selected.size} ta yozuv tanlandi` : 'Chop etish uchun yozuvlarni belgilang'}
            </span>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Tanlovni bekor qilish
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectApproved.mutate()}
              loading={selectApproved.isPending}
              disabled={!counts.data?.APPROVED}
            >
              Tasdiqlanganlarni tanlash
            </Button>
            <Button
              size="sm"
              onClick={print}
              disabled={selected.size === 0}
              icon={<Printer className="size-4" aria-hidden />}
            >
              Chop etish / PDF
            </Button>
          </div>
        </div>
      )}

      {list.isPending ? (
        <PageLoader />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <Card>
          {hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="Mos yozuv topilmadi"
              description="Qidiruv so‘zini yoki filtrlarni o‘zgartiring."
              action={
                <Button
                  variant="outline"
                  onClick={() => setFilters({ status: '', type: '', level: '', q: '', page: '1' })}
                >
                  Filtrlarni tozalash
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FolderHeart}
              title="Portfolio hali bo‘sh"
              description="Tanlov, olimpiada, sertifikat yoki ijodiy ishingizni qo‘shing. Tekshiruvga yuborganingizdan so‘ng tasdiqlovchi ko‘rib chiqadi."
              action={
                <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
                  Yangi yozuv
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {list.isPlaceholderData && (
            <p className="text-brand-600">
              <Spinner className="size-4" label="Yangilanmoqda…" />
            </p>
          )}
          <ul className={cn('space-y-3', list.isPlaceholderData && 'opacity-60')}>
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                submitting={submit.isPending && submit.variables === item.id}
                onToggle={() => toggle(item.id)}
                onEdit={() => setEditing(item)}
                onSubmit={() => submit.mutate(item.id)}
                onDelete={() => setDeleting(item)}
              />
            ))}
          </ul>
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

      <PortfolioFormDialog open={createOpen} onClose={closeCreate} />
      <PortfolioFormDialog open={editing !== null} item={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        tone="danger"
        title="Yozuvni o‘chirish"
        confirmLabel="O‘chirish"
      >
        “{deleting?.title}” yozuvi butunlay o‘chiriladi. Bu amalni ortga qaytarib bo‘lmaydi.
      </ConfirmDialog>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RequireRole roles={['STUDENT', 'TEACHER', 'DEPUTY', 'SUPER_ADMIN']}>
        <MyPortfolio />
      </RequireRole>
    </Suspense>
  );
}
