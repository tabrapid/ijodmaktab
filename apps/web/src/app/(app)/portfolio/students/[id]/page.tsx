'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Award,
  CheckCheck,
  Download,
  Eye,
  FileBadge,
  FolderHeart,
  Hourglass,
  Medal,
  PenLine,
  Printer,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  PORTFOLIO_CATEGORIES,
  PORTFOLIO_CATEGORY_LABELS,
  ROLE_LABELS,
  formatDate,
  formatInternalId,
  portfolioCategoryOf,
  type PortfolioCategory,
} from '@ijod/shared';
import { RequireRole } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { DetailsView } from '@/components/portfolio/details-view';
import {
  AuthorshipNote,
  EvidenceLinks,
  LevelBadge,
  PortfolioMeta,
  ReturnReasonAlert,
} from '@/components/portfolio/parts';
import { PendingItemCard } from '@/components/portfolio/pending-item';
import { useReviewActions } from '@/components/portfolio/queries';
import { ReviewDialog, type ReviewTarget } from '@/components/portfolio/review-dialog';
import { isCreativeType, isUuid, portfolioKeys, printHref } from '@/components/portfolio/utils';
import { PortfolioStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import type { Me, PortfolioItemView, StudentPortfolioView } from '@/lib/types';

const SECTION_ICONS: Record<PortfolioCategory, LucideIcon> = {
  CERTIFICATES: FileBadge,
  OLYMPIADS: Medal,
  CREATIVE: PenLine,
  OTHER: Award,
};

function ItemCard({ item }: { item: PortfolioItemView }) {
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 bg-surface p-4 shadow-xs">
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

function backLinkFor(me: Me | undefined, data: StudentPortfolioView | undefined, id: string) {
  if (hasRole(me, 'DEPUTY', 'SUPER_ADMIN')) return { href: '/management/portfolio', label: 'Portfoliolar' };
  if (data && !data.owner.roles.includes('STUDENT')) return { href: '/portfolio/review', label: 'Tasdiqlash navbati' };
  return { href: `/teacher/students/${id}`, label: 'O‘quvchi sahifasi' };
}

function StudentPortfolio() {
  const { id } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const toast = useToast();
  const valid = isUuid(id);
  const [returning, setReturning] = useState<ReviewTarget | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const { approve, batch } = useReviewActions();

  const query = useQuery({
    queryKey: portfolioKeys.student(id),
    queryFn: () => api.get<StudentPortfolioView>(`/portfolio/students/${id}`),
    enabled: valid,
  });
  const data = query.data;

  const zip = useMutation({
    mutationFn: (scope: 'approved' | 'all') =>
      downloadFile(`/portfolio/students/${id}/evidence.zip?scope=${scope}`, 'portfolio.zip'),
    onSuccess: () => toast.success('Arxiv yuklab olindi: fayllar bo‘limlar bo‘yicha, ro‘yxat esa royxat.xlsx faylida.'),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const back = backLinkFor(me, data, id);
  const backElement = (
    <Link
      href={back.href}
      className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {back.label}
    </Link>
  );

  if (!valid || query.isError) {
    return (
      <div className="space-y-6">
        {backElement}
        {valid ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <Card>
            <EmptyState icon={UserX} title="O‘quvchi topilmadi" description="Havola noto‘g‘ri." />
          </Card>
        )}
      </div>
    );
  }
  if (query.isPending || !data) return <PageLoader />;

  const { owner, counts } = data;
  const approvedIds = data.items.filter((item) => item.status === 'APPROVED').map((item) => item.id);
  // Tekshiruvdagi yozuvlar alohida bo‘limda (tekshiruvchi uchun farqi bilan) ko‘rsatiladi.
  const shown = data.items.filter((item) => item.status !== 'SUBMITTED');
  const sections = PORTFOLIO_CATEGORIES.map((category) => ({
    category,
    items: shown.filter((item) => portfolioCategoryOf(item.type) === category),
  }));
  const reviewable = data.pendingItems.filter((item) => item.canReview);
  const student = owner.roles.includes('STUDENT');

  return (
    <div className="space-y-6">
      {backElement}

      <Card>
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={owner.fullName} src={owner.avatarUrl} size="xl" />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight break-words text-slate-900">
              {owner.fullName} portfoliosi
            </h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              {student ? (
                <span>{owner.className ? `${owner.className} sinf` : 'Sinfga biriktirilmagan'}</span>
              ) : (
                <span>{owner.roles.map((role) => ROLE_LABELS[role]).join(', ')}</span>
              )}
              <span className="tabular">Ichki ID: {formatInternalId(owner.internalId)}</span>
            </p>
            {data.byType.length > 0 && (
              <p className="flex flex-wrap gap-1.5 pt-1">
                {data.byType.map((row) => (
                  <Badge key={row.type} tone={row.approved ? 'brand' : 'gray'}>
                    {row.label}: {row.approved}
                    {row.pending ? ` (+${row.pending} kutmoqda)` : ''}
                  </Badge>
                ))}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
            {data.canExport && (
              <Button
                onClick={() => zip.mutate('approved')}
                loading={zip.isPending && zip.variables === 'approved'}
                disabled={counts.approved === 0 || zip.isPending}
                icon={<Download className="size-4" aria-hidden />}
              >
                Sertifikatlarni yuklab olish (ZIP)
              </Button>
            )}
            {approvedIds.length > 0 ? (
              <ButtonLink
                href={printHref(owner.id, approvedIds)}
                variant="outline"
                icon={<Printer className="size-4" aria-hidden />}
              >
                Chop etish (PDF)
              </ButtonLink>
            ) : (
              <Button variant="outline" disabled icon={<Printer className="size-4" aria-hidden />}>
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
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tasdiqlangan" value={counts.approved} tone="success" hint="Tasdiqlangan yutuqlar" />
        <Stat
          label="Kutilmoqda"
          value={counts.pending}
          tone={counts.pending > 0 ? 'warning' : 'default'}
          hint="Tekshiruvga yuborilgan"
        />
        <Stat label="Qaytarilgan" value={counts.returned} hint="Tuzatish kutilmoqda" />
        <Stat label="Qoralama" value={counts.draft} hint="Egasi hali yubormagan" />
      </div>

      {data.pendingItems.length > 0 && (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Hourglass className="size-4 text-amber-600" aria-hidden />
                Tekshiruvni kutayotganlar ({data.pendingItems.length})
              </span>
            }
            description={
              data.canReview
                ? 'Yangi yozuvlar “Yangi”, tasdiqlangandan keyin o‘zgartirilganlari farqlari bilan ko‘rsatiladi.'
                : 'Bu yozuvlarni sinf rahbari yoki rahbariyat tasdiqlaydi.'
            }
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
                <Icon className="size-5 text-brand-600" aria-hidden />
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
          batch.mutate(
            { itemIds: reviewable.map((item) => item.id), decision: 'APPROVED' },
            { onSettled: () => setConfirmAll(false) },
          )
        }
        loading={batch.isPending}
        title="Hammasini tasdiqlash"
        confirmLabel={`${reviewable.length} ta yozuvni tasdiqlash`}
      >
        {owner.fullName}ning tekshiruvdagi {reviewable.length} ta yozuvi tasdiqlanadi. Egasiga bitta umumiy
        bildirishnoma yuboriladi. Dalillarni ko‘rib chiqqaningizga ishonch hosil qiling.
      </ConfirmDialog>
    </div>
  );
}

export default function StudentPortfolioPage() {
  return (
    <RequireRole roles={['TEACHER', 'DEPUTY', 'SUPER_ADMIN']}>
      <StudentPortfolio />
    </RequireRole>
  );
}
