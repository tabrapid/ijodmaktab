'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Award,
  CheckCheck,
  Download,
  ExternalLink,
  Eye,
  FileBadge,
  FolderHeart,
  Hourglass,
  Medal,
  PenLine,
  Printer,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  PORTFOLIO_CATEGORIES,
  PORTFOLIO_CATEGORY_LABELS,
  formatDate,
  portfolioCategoryOf,
  type PortfolioCategory,
} from '@ijod/shared';
import { DetailsView } from '@/components/portfolio/details-view';
import {
  AuthorshipNote,
  EvidenceLinks,
  LevelBadge,
  PortfolioMeta,
  ReturnReasonAlert,
} from '@/components/portfolio/parts';
import { PendingItemCard } from '@/components/portfolio/pending-item';
import { batchReviewInput, useReviewActions } from '@/components/portfolio/queries';
import { ReviewDialog, type ReviewTarget } from '@/components/portfolio/review-dialog';
import { isCreativeType, portfolioKeys, printHref } from '@/components/portfolio/utils';
import { PortfolioStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api, downloadFile, errorMessage } from '@/lib/api';
import type { PortfolioItemView, StudentPortfolioView } from '@/lib/types';

const SECTION_ICONS: Record<PortfolioCategory, LucideIcon> = {
  CERTIFICATES: FileBadge,
  OLYMPIADS: Medal,
  CREATIVE: PenLine,
  OTHER: Award,
};

function ItemCard({ item }: { item: PortfolioItemView }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-surface p-4 shadow-xs dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          href={`/portfolio/${item.id}`}
          className="min-w-0 font-semibold break-words text-slate-900 hover:text-brand-700 hover:underline"
        >
          {item.title}
        </Link>
        {item.status !== 'APPROVED' && <PortfolioStatusBadge status={item.status} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="gray">{item.typeLabel}</Badge>
        {item.level && <LevelBadge level={item.level} />}
      </div>
      <DetailsView type={item.type} details={item.details} />
      <PortfolioMeta item={item} withTypeAndLevel={false} />
      {isCreativeType(item.type) && <AuthorshipNote author={item.owner.fullName} />}
      {item.status === 'RETURNED' && <ReturnReasonAlert reason={item.returnReason} />}
      {item.status === 'APPROVED' && item.reviewer && (
        <p className="text-xs text-slate-500">
          Tasdiqladi: {item.reviewer.fullName}
          {item.reviewedAt ? `, ${formatDate(item.reviewedAt)}` : ''}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <EvidenceLinks file={item.evidenceFile} url={item.evidenceUrl} />
        <ButtonLink
          href={`/portfolio/${item.id}`}
          variant="ghost"
          size="sm"
          icon={<Eye className="size-4" aria-hidden />}
        >
          Batafsil
        </ButtonLink>
      </div>
    </li>
  );
}

/**
 * “Portfolio” yorlig‘i: o‘quvchining jamlangan portfoliosi (GET /portfolio/students/:id — portfolio
 * sahifasi bilan bir xil so‘rov va kesh): ko‘rsatkichlar, tekshiruvdagi yozuvlarni tasdiqlash,
 * bo‘limlar bo‘yicha yutuqlar, sertifikatlarni ZIP da yuklab olish va chop etish.
 */
export function StudentPortfolioPanel({ studentId }: { studentId: string }) {
  const toast = useToast();
  const [returning, setReturning] = useState<ReviewTarget | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const { approve, batch } = useReviewActions();
  const query = useQuery({
    queryKey: portfolioKeys.student(studentId),
    queryFn: () => api.get<StudentPortfolioView>(`/portfolio/students/${studentId}`),
  });
  const zip = useMutation({
    mutationFn: (scope: 'approved' | 'all') =>
      downloadFile(`/portfolio/students/${studentId}/evidence.zip?scope=${scope}`, 'portfolio.zip'),
    onSuccess: () => toast.success('Arxiv yuklab olindi: fayllar bo‘limlar bo‘yicha, ro‘yxat esa royxat.xlsx faylida.'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const data = query.data;
  const { owner, counts } = data;
  const approvedIds = data.items.filter((item) => item.status === 'APPROVED').map((item) => item.id);
  // Tekshiruvdagi yozuvlar alohida bo‘limda (farqlari bilan) ko‘rsatiladi.
  const shown = data.items.filter((item) => item.status !== 'SUBMITTED');
  const sections = PORTFOLIO_CATEGORIES.map((category) => ({
    category,
    items: shown.filter((item) => portfolioCategoryOf(item.type) === category),
  }));
  const reviewable = data.pendingItems.filter((item) => item.canReview);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tasdiqlangan" value={counts.approved} tone="success" hint="Tasdiqlangan yutuqlar" />
        <Stat
          label="Kutilmoqda"
          value={counts.pending}
          tone={counts.pending > 0 ? 'warning' : 'default'}
          hint="Tekshiruvga yuborilgan"
        />
        <Stat label="Qaytarilgan" value={counts.returned} hint="Tuzatish kutilmoqda" />
        <Stat label="Qoralama" value={counts.draft} hint="O‘quvchi hali yubormagan" />
      </div>

      <Card>
        <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {data.byType.length > 0 ? (
              <p className="flex flex-wrap gap-1.5">
                {data.byType.map((row) => (
                  <Badge key={row.type} tone={row.approved ? 'brand' : 'gray'}>
                    {row.label}: {row.approved}
                    {row.pending ? ` (+${row.pending} kutmoqda)` : ''}
                  </Badge>
                ))}
              </p>
            ) : (
              <p className="text-sm text-slate-500">Hali tasdiqlangan yoki tekshiruvdagi yozuv yo‘q.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.canExport && (
              <Button
                size="sm"
                onClick={() => zip.mutate('approved')}
                loading={zip.isPending && zip.variables === 'approved'}
                disabled={counts.approved === 0 || zip.isPending}
                icon={<Download className="size-4" aria-hidden />}
              >
                Sertifikatlar (ZIP)
              </Button>
            )}
            {approvedIds.length > 0 ? (
              <ButtonLink
                href={printHref(owner.id, approvedIds)}
                size="sm"
                variant="outline"
                icon={<Printer className="size-4" aria-hidden />}
              >
                Chop etish (PDF)
              </ButtonLink>
            ) : (
              <Button size="sm" variant="outline" disabled icon={<Printer className="size-4" aria-hidden />}>
                Chop etish (PDF)
              </Button>
            )}
            {data.canExport && counts.pending + counts.returned > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => zip.mutate('all')}
                loading={zip.isPending && zip.variables === 'all'}
                disabled={zip.isPending}
              >
                Tasdiqlanmaganlari bilan (ZIP)
              </Button>
            )}
            <ButtonLink
              href={`/portfolio/students/${owner.id}`}
              size="sm"
              variant="ghost"
              icon={<ExternalLink className="size-4" aria-hidden />}
            >
              Portfolio sahifasi
            </ButtonLink>
          </div>
        </CardBody>
      </Card>

      {data.pendingItems.length > 0 && (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Hourglass className="size-4 text-amber-700" aria-hidden />
                Tekshiruvni kutayotganlar ({data.pendingItems.length})
              </span>
            }
            description="Yangi yozuvlar “Yangi”, tasdiqlangandan keyin o‘zgartirilganlari farqlari bilan ko‘rsatiladi."
            actions={
              reviewable.length > 1 ? (
                <Button
                  size="sm"
                  onClick={() => setConfirmAll(true)}
                  disabled={batch.isPending || approve.isPending}
                  icon={<CheckCheck className="size-4" aria-hidden />}
                >
                  Hammasini tasdiqlash ({reviewable.length})
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            <ul className="space-y-3">
              {data.pendingItems.map((item) => (
                <PendingItemCard
                  key={item.id}
                  item={item}
                  approving={approve.isPending && approve.variables?.id === item.id}
                  disabled={batch.isPending || (approve.isPending && approve.variables?.id !== item.id)}
                  onApprove={() => approve.mutate(item)}
                  onReturn={() => setReturning({ item, decision: 'RETURNED' })}
                />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {shown.length === 0 && data.pendingItems.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderHeart}
            title="Portfolio hali bo‘sh"
            description="O‘quvchi sertifikat, olimpiada natijasi yoki ijodiy ishini qo‘shib, tasdiqlatganda shu yerda ko‘rinadi."
          />
        </Card>
      ) : (
        sections.map(({ category, items }) => {
          const Icon = SECTION_ICONS[category];
          return (
            <section key={category} aria-labelledby={`section-${category}`} className="space-y-3">
              <h2
                id={`section-${category}`}
                className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900"
              >
                <Icon className="size-5 text-brand-700" aria-hidden />
                {PORTFOLIO_CATEGORY_LABELS[category]}
                <span className="text-sm font-normal text-slate-500 tabular">({items.length})</span>
              </h2>
              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                  Bu bo‘limda hozircha yozuv yo‘q.
                </p>
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {items.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}

      <ReviewDialog target={returning} onClose={() => setReturning(null)} />
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() =>
          batch.mutate(batchReviewInput(reviewable, 'APPROVED'), { onSettled: () => setConfirmAll(false) })
        }
        loading={batch.isPending}
        title="Hammasini tasdiqlash"
        confirmLabel={`${reviewable.length} ta yozuvni tasdiqlash`}
      >
        {owner.fullName}ning tekshiruvdagi {reviewable.length} ta yozuvi tasdiqlanadi. O‘quvchiga bitta umumiy
        bildirishnoma yuboriladi. Dalillarni ko‘rib chiqqaningizga ishonch hosil qiling.
      </ConfirmDialog>
    </div>
  );
}
