'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, CheckCheck, FolderOpen, SearchX, Users } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ROLE_LABELS, formatHumanDateTime, normalizeForSearch } from '@ijod/shared';
import { Avatar } from '@/components/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, qs } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { PortfolioItemView, PortfolioOwnerRef, PortfolioReviewGroup } from '@/lib/types';
import { PendingItemCard } from './pending-item';
import { batchReviewInput, changedSinceView, useReviewActions } from './queries';
import { ReviewDialog, type ReviewTarget } from './review-dialog';
import { useUrlState } from './use-url-state';
import { isUuid, portfolioKeys } from './utils';

const URL_DEFAULTS = { owner: '' };

/** “2 ta yangi · 1 ta o‘zgartirilgan” */
export function pendingSummary(group: Pick<PortfolioReviewGroup, 'newCount' | 'changedCount'>) {
  return [
    group.newCount ? `${group.newCount} ta yangi` : null,
    group.changedCount ? `${group.changedCount} ta o‘zgartirilgan` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const ownerLine = (owner: Pick<PortfolioOwnerRef, 'className' | 'roles'>) =>
  owner.className ? `${owner.className} sinf` : owner.roles.map((role) => ROLE_LABELS[role]).join(', ');

/** “3 ta o‘quvchi, 1 ta o‘qituvchi”: rahbariyat o‘qituvchilar portfoliosini ham tekshiradi. */
function ownersSummary(owners: Pick<PortfolioOwnerRef, 'className' | 'roles'>[]) {
  const staff = owners.filter((owner) => !owner.className && !owner.roles.includes('STUDENT'));
  const students = owners.length - staff.length;
  if (staff.length === 0) return `${students} ta o‘quvchi`;
  const staffLabel = `${staff.length} ta ${staff.every((owner) => owner.roles.includes('TEACHER')) ? 'o‘qituvchi' : 'xodim'}`;
  return students ? `${students} ta o‘quvchi, ${staffLabel}` : staffLabel;
}

function StudentList({
  groups,
  selectedId,
  onSelect,
}: {
  groups: PortfolioReviewGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const needle = normalizeForSearch(search);
  const visible = useMemo(
    () =>
      needle
        ? groups.filter((group) =>
            normalizeForSearch(`${group.owner.fullName} ${group.owner.className ?? ''}`).includes(needle),
          )
        : groups,
    [groups, needle],
  );
  const total = groups.reduce((sum, group) => sum + group.pending, 0);

  return (
    <Card className="overflow-hidden">
      <div className="space-y-2 border-b border-slate-100 p-3">
        <p className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
            <Users className="size-4 text-slate-500" aria-hidden />
            {ownersSummary(groups.map((group) => group.owner))}
          </span>
          <span className="tabular">{total} ta yozuv</span>
        </p>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="F.I.Sh. yoki sinf…"
          aria-label="O‘quvchini qidirish"
        />
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="Navbat bo‘sh" description="Tekshiruvni kutayotgan yozuv qolmadi." />
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX} title="Topilmadi" description="Qidiruv so‘zini o‘zgartiring." />
      ) : (
        <ul
          className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto"
          aria-label="Tekshiruvni kutayotgan o‘quvchilar"
        >
          {visible.map((group) => {
            const active = group.owner.id === selectedId;
            return (
              <li key={group.owner.id}>
                <button
                  type="button"
                  onClick={() => onSelect(group.owner.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-slate-50',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2',
                    active && 'bg-brand-50 hover:bg-brand-50',
                  )}
                >
                  <Avatar name={group.owner.fullName} src={group.owner.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span
                        className={cn('min-w-0 font-medium break-words text-slate-900', active && 'text-brand-800')}
                      >
                        {group.owner.fullName}
                      </span>
                      <Badge tone={group.changedCount ? 'amber' : 'brand'} className="shrink-0 tabular">
                        {group.pending}
                      </Badge>
                    </span>
                    <span className="block text-xs text-slate-500">{ownerLine(group.owner)}</span>
                    <span className="mt-0.5 block text-xs font-medium text-slate-700">{pendingSummary(group)}</span>
                    <span className="block text-xs text-slate-500">
                      Kutmoqda: {formatHumanDateTime(group.oldestSubmittedAt)} dan
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * O‘quvchilar bo‘yicha guruhlangan tasdiqlash: chapda tekshiruvni kutayotgan o‘quvchilar, o‘ngda
 * tanlangan o‘quvchining yozuvlari (yangi va o‘zgartirilganlari farqi bilan). Tanlov URLdagi `owner`
 * parametrida saqlanadi. Komponent <Suspense> ichida ishlatilishi shart.
 */
export function GroupedReview({ note, emptyDescription }: { note?: ReactNode; emptyDescription?: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [state, setState] = useUrlState(URL_DEFAULTS);
  const ownerId = isUuid(state.owner) ? state.owner : null;
  const [returning, setReturning] = useState<ReviewTarget | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const handled = useRef(new Set<string>());
  const { approve, batch } = useReviewActions();

  const groups = useQuery({
    queryKey: portfolioKeys.reviewGroups,
    queryFn: () => api.get<PortfolioReviewGroup[]>('/portfolio/review-queue/students'),
    refetchInterval: 60_000,
  });
  const items = useQuery({
    queryKey: portfolioKeys.reviewOwner(ownerId ?? ''),
    queryFn: () => api.get<PortfolioItemView[]>(`/portfolio/review-queue${qs({ ownerId })}`),
    enabled: ownerId !== null,
  });

  const list = groups.data ?? [];
  const group = list.find((entry) => entry.owner.id === ownerId) ?? null;
  const owner = group?.owner ?? items.data?.[0]?.owner ?? null;
  const reviewable = (items.data ?? []).filter((item) => item.canReview);

  const select = (id: string | null) => {
    handled.current = new Set();
    setState({ owner: id ?? '' });
    if (id && typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  /** O‘quvchining oxirgi yozuvi ko‘rib chiqilgach, keyingi o‘quvchiga o‘tiladi. */
  const markHandled = (ids: string[]) => {
    for (const id of ids) handled.current.add(id);
    if (!ownerId) return;
    const current = queryClient.getQueryData<PortfolioItemView[]>(portfolioKeys.reviewOwner(ownerId)) ?? [];
    if (current.some((item) => !handled.current.has(item.id))) return;
    const index = list.findIndex((entry) => entry.owner.id === ownerId);
    const rest = list.filter((entry) => entry.owner.id !== ownerId);
    const next = index >= 0 ? (rest[index] ?? rest[index - 1] ?? null) : (rest[0] ?? null);
    if (next) {
      toast.info(`${owner?.fullName ?? 'O‘quvchi'} yozuvlari ko‘rib chiqildi. Keyingisi: ${next.owner.fullName}.`);
      select(next.owner.id);
    } else {
      toast.success('Tasdiqlash navbati bo‘shadi — barcha yozuvlar ko‘rib chiqildi.');
      select(null);
    }
  };

  const approveAll = () =>
    batch.mutate(batchReviewInput(reviewable, 'APPROVED'), {
      // Ko‘rilgandan keyin o‘zgartirilganlari navbatda qoladi — o‘quvchidan keyingisiga o‘tilmaydi.
      onSuccess: (result) => {
        const changed = changedSinceView(result);
        markHandled(reviewable.map((item) => item.id).filter((id) => !changed.has(id)));
      },
      onSettled: () => setConfirmAll(false),
    });

  if (groups.isPending) return <PageLoader />;
  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />;

  if (list.length === 0 && !ownerId) {
    return (
      <div className="space-y-4">
        {note && <Alert tone="info">{note}</Alert>}
        <Card>
          <EmptyState
            icon={BadgeCheck}
            title="Tasdiqlash navbati bo‘sh"
            description={
              emptyDescription ??
              'Yangi yozuv tekshiruvga yuborilganda shu yerda paydo bo‘ladi va sizga bildirishnoma keladi.'
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {note && <Alert tone="info">{note}</Alert>}
      <div className="grid items-start gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className={cn(ownerId && 'hidden lg:block', 'lg:sticky lg:top-4')}>
          <StudentList groups={list} selectedId={ownerId} onSelect={select} />
        </div>

        <div className={cn('min-w-0 space-y-4', !ownerId && 'hidden lg:block')}>
          {!ownerId ? (
            <Card>
              <EmptyState
                icon={Users}
                title="O‘quvchini tanlang"
                description="Chapdagi ro‘yxatdan o‘quvchini tanlang — uning yangi va o‘zgartirilgan yozuvlari shu yerda ochiladi."
              />
            </Card>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => select(null)}
                icon={<ArrowLeft className="size-4" aria-hidden />}
              >
                Barcha o‘quvchilar ({list.length})
              </Button>
              {owner && (
                <Card>
                  <CardBody className="flex flex-wrap items-center gap-4">
                    <Avatar name={owner.fullName} src={owner.avatarUrl} size="lg" />
                    {/* Ism bloki kamida 12rem: joy yetmasa, tugmalar ism ostiga tushadi (ism so‘z o‘rtasida bo‘linmaydi). */}
                    <div className="min-w-0 grow basis-48">
                      <h2 className="text-lg font-semibold break-words text-slate-900">{owner.fullName}</h2>
                      <p className="text-sm text-slate-500">{ownerLine(owner)}</p>
                      {group && (
                        <p className="mt-0.5 text-sm font-medium text-slate-700">
                          {group.pending} ta yozuv kutmoqda · {pendingSummary(group)}
                        </p>
                      )}
                    </div>
                    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                      <ButtonLink
                        href={`/portfolio/students/${owner.id}`}
                        variant="outline"
                        size="sm"
                        icon={<FolderOpen className="size-4" aria-hidden />}
                      >
                        To‘liq portfolio
                      </ButtonLink>
                      {reviewable.length > 1 && (
                        <Button
                          size="sm"
                          onClick={() => setConfirmAll(true)}
                          disabled={batch.isPending || approve.isPending}
                          icon={<CheckCheck className="size-4" aria-hidden />}
                        >
                          Hammasini tasdiqlash ({reviewable.length})
                        </Button>
                      )}
                    </div>
                  </CardBody>
                </Card>
              )}

              {items.isPending ? (
                <PageLoader />
              ) : items.isError ? (
                <ErrorState error={items.error} onRetry={() => items.refetch()} />
              ) : items.data.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={BadgeCheck}
                    title="Tekshiruvni kutayotgan yozuv yo‘q"
                    description="Bu o‘quvchining barcha yozuvlari ko‘rib chiqilgan yoki u yozuvni tahrirlash uchun qaytarib olgan."
                    action={
                      <Button variant="outline" onClick={() => select(null)}>
                        Navbatga qaytish
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <>
                  {items.isFetching && (
                    <p className="text-brand-700">
                      <Spinner className="size-4" label="Yangilanmoqda…" />
                    </p>
                  )}
                  <ul className="space-y-3">
                    {items.data.map((item) => (
                      <PendingItemCard
                        key={item.id}
                        item={item}
                        approving={approve.isPending && approve.variables?.id === item.id}
                        disabled={batch.isPending || (approve.isPending && approve.variables?.id !== item.id)}
                        onApprove={() => approve.mutate(item, { onSuccess: () => markHandled([item.id]) })}
                        onReturn={() => setReturning({ item, decision: 'RETURNED' })}
                      />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ReviewDialog
        target={returning}
        onClose={() => setReturning(null)}
        onReviewed={(item) => markHandled([item.id])}
      />
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={approveAll}
        loading={batch.isPending}
        title="Hammasini tasdiqlash"
        confirmLabel={`${reviewable.length} ta yozuvni tasdiqlash`}
      >
        {owner?.fullName ?? 'O‘quvchi'}ning tekshiruvdagi {reviewable.length} ta yozuvi tasdiqlanadi. Har biri tekshiruv
        tarixida saqlanadi, egasiga bitta umumiy bildirishnoma yuboriladi. Dalillarni ko‘rib chiqqaningizga ishonch
        hosil qiling.
      </ConfirmDialog>
    </div>
  );
}
