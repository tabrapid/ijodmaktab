'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  FileQuestion,
  FolderOpen,
  GitCompare,
  Pencil,
  Printer,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  PORTFOLIO_VISIBILITY_LABELS,
  ROLE_LABELS,
  formatDate,
  formatDateTime,
  formatHumanDateTime,
  formatInternalId,
} from '@ijod/shared';
import { RequireRole, useActiveNav } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { DetailsView } from '@/components/portfolio/details-view';
import { AuthorshipNote, EvidenceLinks, LevelBadge, ReturnReasonAlert } from '@/components/portfolio/parts';
import { ChangeKindBadge } from '@/components/portfolio/pending-item';
import { PortfolioFormDialog } from '@/components/portfolio/portfolio-form';
import { usePortfolioActions } from '@/components/portfolio/queries';
import { ChangesTable } from '@/components/portfolio/review-diff';
import { ReviewDialog, type ReviewTarget } from '@/components/portfolio/review-dialog';
import {
  canDeleteItem,
  canSubmitItem,
  isCreativeType,
  isUuid,
  portfolioKeys,
  printHref,
} from '@/components/portfolio/utils';
import { PortfolioStatusBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import type { Me, PortfolioItemView } from '@/lib/types';

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-slate-900 sm:col-span-2">{children}</dd>
    </div>
  );
}

const empty = <span className="text-slate-500">Ko‘rsatilmagan</span>;

function statusExplanation(item: PortfolioItemView) {
  switch (item.status) {
    case 'DRAFT':
      return item.isMine
        ? 'Qoralama. Tasdiqlanishi uchun tekshiruvga yuboring — tasdiqlanmagan yozuv tasdiqlangan yutuqlar hisobiga kirmaydi.'
        : 'Qoralama: egasi hali tekshiruvga yubormagan. Tasdiqlangan yutuq hisoblanmaydi.';
    case 'SUBMITTED':
      return 'Tekshiruvga yuborilgan. O‘quvchi yozuvini sinf rahbari, o‘qituvchi yozuvini rahbariyat ko‘rib chiqadi.';
    case 'APPROVED':
      return item.isMine
        ? 'Tasdiqlangan yutuq. Muhim maydonlar o‘zgartirilsa, yozuv qayta tasdiqlanishi kerak bo‘ladi. Tasdiqlangan yozuvni o‘chirib bo‘lmaydi.'
        : 'Tasdiqlangan yutuq.';
    case 'RETURNED':
      return item.isMine
        ? 'Tuzatishga qaytarilgan. Sababni o‘qib, yozuvni tahrirlang va tekshiruvga qayta yuboring.'
        : 'Tuzatishga qaytarilgan: egasi tuzatib, qayta yuborishi kerak.';
  }
}

function backLink(item: PortfolioItemView | undefined, me: Me | undefined) {
  if (!item || item.isMine) return { href: '/portfolio', label: 'Portfoliom' };
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  const owner = encodeURIComponent(item.owner.id);
  // Tekshiruvchi — shu o‘quvchining tekshiruv navbatiga qaytadi.
  if (item.canReview) {
    return leadership
      ? { href: `/management/portfolio?tab=review&owner=${owner}`, label: 'Tasdiqlash navbati' }
      : { href: `/portfolio/review?owner=${owner}`, label: 'Tasdiqlash navbati' };
  }
  return { href: `/portfolio/students/${owner}`, label: `${item.owner.fullName} portfoliosi` };
}

function ItemDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const { submit, remove } = usePortfolioActions();
  const valid = isUuid(id);

  const query = useQuery({
    queryKey: portfolioKeys.item(id),
    queryFn: () => api.get<PortfolioItemView>(`/portfolio/${id}`),
    enabled: valid,
  });
  const item = query.data;
  // Boshqa foydalanuvchining yozuvi “Portfoliom” emas: menyuda uning portfoliosi turgan band faol bo‘ladi.
  useActiveNav(
    item && !item.isMine
      ? hasRole(me, 'DEPUTY', 'SUPER_ADMIN')
        ? '/management/portfolio'
        : item.canReview || (me?.homeroomClassIds.length ?? 0) > 0
          ? '/portfolio/review'
          : '/teacher/classes'
      : null,
  );
  const back = backLink(item, me);
  const backElement = (
    <Link
      href={back.href}
      className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {back.label}
    </Link>
  );

  if (!valid) {
    return (
      <div className="space-y-6">
        {backElement}
        <Card>
          <EmptyState
            icon={FileQuestion}
            title="Yozuv topilmadi"
            description="Havola noto‘g‘ri yoki yozuv o‘chirilgan."
          />
        </Card>
      </div>
    );
  }
  if (query.isPending) return <PageLoader />;
  if (query.isError || !item) {
    return (
      <div className="space-y-6">
        {backElement}
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const reviews = item.reviews ?? [];
  const isReviewer = hasRole(me, 'TEACHER', 'DEPUTY', 'SUPER_ADMIN');

  const ownerActions = item.isMine && (
    <>
      <Button variant="outline" onClick={() => setEditing(true)} icon={<Pencil className="size-4" aria-hidden />}>
        Tahrirlash
      </Button>
      {canSubmitItem(item.status) && (
        <Button
          onClick={() => submit.mutate(item.id)}
          loading={submit.isPending}
          icon={<Send className="size-4" aria-hidden />}
        >
          Tekshiruvga yuborish
        </Button>
      )}
      <ButtonLink
        href={printHref(item.owner.id, [item.id])}
        variant="outline"
        icon={<Printer className="size-4" aria-hidden />}
      >
        Chop etish
      </ButtonLink>
      {canDeleteItem(item.status) && (
        <Button
          variant="ghost"
          onClick={() => setDeleting(true)}
          icon={<Trash2 className="size-4 text-red-700" aria-hidden />}
        >
          <span className="text-red-700">O‘chirish</span>
        </Button>
      )}
    </>
  );

  const reviewActions = item.canReview && (
    <>
      <Button onClick={() => setReview({ item, decision: 'APPROVED' })} icon={<Check className="size-4" aria-hidden />}>
        Tasdiqlash
      </Button>
      <Button
        variant="outline"
        onClick={() => setReview({ item, decision: 'RETURNED' })}
        icon={<Undo2 className="size-4" aria-hidden />}
      >
        Tuzatishga qaytarish
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        back={backElement}
        title={<span className="break-words">{item.title}</span>}
        description={
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <PortfolioStatusBadge status={item.status} />
            {item.canReview && <ChangeKindBadge item={item} />}
            <Badge tone="gray">{item.typeLabel}</Badge>
            {item.level && <LevelBadge level={item.level} />}
          </span>
        }
        actions={
          (ownerActions || reviewActions) && (
            <>
              {reviewActions}
              {ownerActions}
            </>
          )
        }
      />

      {item.status === 'RETURNED' && <ReturnReasonAlert reason={item.returnReason} />}
      {item.canReview && (
        <Alert tone="info" title="Yozuv sizning tasdiqlashingizni kutmoqda">
          {item.changeKind === 'CHANGED'
            ? 'Yozuv avval tasdiqlangan, keyin o‘zgartirilgan. Quyidagi farqlarni va dalilni ko‘rib chiqing.'
            : 'Yangi yozuv. Dalilni ko‘rib chiqing va yozuvni tasdiqlang yoki sababini yozib tuzatishga qaytaring.'}
        </Alert>
      )}
      {item.canReview && item.wasReturned && (
        <Alert tone="warning" title="Avval tuzatishga qaytarilgan">
          {item.lastReturnReason ? `Sabab: ${item.lastReturnReason}` : 'Sabab ko‘rsatilmagan.'}
        </Alert>
      )}
      {item.canReview && item.changeKind === 'CHANGED' && (
        <Card>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <GitCompare className="size-4 text-amber-700" aria-hidden />
                Nima o‘zgardi
              </span>
            }
            description={
              item.lastApprovedAt
                ? `Oxirgi tasdiqlangan holat (${formatDate(item.lastApprovedAt)}) bilan solishtirildi.`
                : 'Oxirgi tasdiqlangan holat bilan solishtirildi.'
            }
          />
          <CardBody>
            <ChangesTable changes={item.changes ?? []} type={item.type} />
          </CardBody>
        </Card>
      )}
      {item.isMine && item.status === 'SUBMITTED' && isReviewer && (
        <Alert tone="info">
          O‘z yozuvingizni o‘zingiz tasdiqlay olmaysiz — uni boshqa tasdiqlovchi ko‘rib chiqadi.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Ma’lumotlar" />
          <CardBody className="py-1">
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Turi">{item.typeLabel}</DetailRow>
              {item.details && (
                <DetailRow label={item.type === 'OLYMPIAD' ? 'Olimpiada natijasi' : 'Sertifikat ma’lumotlari'}>
                  <DetailsView type={item.type} details={item.details} />
                </DetailRow>
              )}
              <DetailRow label="Fan">{item.subject?.name ?? empty}</DetailRow>
              <DetailRow label="Yo‘nalish">{item.direction ?? empty}</DetailRow>
              <DetailRow label="Tashkilot">{item.organization ?? empty}</DetailRow>
              <DetailRow label="Sana">{item.date ? formatDate(item.date) : empty}</DetailRow>
              <DetailRow label="Bosqich">{item.level ? <LevelBadge level={item.level} /> : empty}</DetailRow>
              <DetailRow label={item.details ? 'Natija (avtomatik)' : 'Natija yoki o‘rin'}>
                {item.result ?? empty}
              </DetailRow>
              <DetailRow label="Dalil">
                <EvidenceLinks file={item.evidenceFile} url={item.evidenceUrl} />
              </DetailRow>
              <DetailRow label="Kim ko‘ra oladi">
                {PORTFOLIO_VISIBILITY_LABELS[item.visibility]}
                <span className="block text-xs text-slate-500">Portfolio ommaga ochiq emas.</span>
              </DetailRow>
              <DetailRow label="Tavsif">
                {item.description ? <p className="whitespace-pre-wrap">{item.description}</p> : empty}
              </DetailRow>
            </dl>
            {isCreativeType(item.type) && (
              <div className="border-t border-slate-100 py-3">
                <AuthorshipNote author={item.owner.fullName} />
                <p className="mt-1 text-xs text-slate-500">
                  Muallifligi chop etilgan portfolio va eksportlarda saqlanadi.
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Holat" />
            <CardBody className="space-y-3 text-sm">
              <PortfolioStatusBadge status={item.status} />
              <p className="text-slate-600">{statusExplanation(item)}</p>
              <dl className="space-y-1.5">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Yaratilgan</dt>
                  <dd className="text-right tabular">{formatDateTime(item.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">O‘zgartirilgan</dt>
                  <dd className="text-right tabular">{formatDateTime(item.updatedAt)}</dd>
                </div>
                {item.submittedAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Yuborilgan</dt>
                    <dd className="text-right tabular">{formatDateTime(item.submittedAt)}</dd>
                  </div>
                )}
                {item.reviewer && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Tekshiruvchi</dt>
                    <dd className="text-right">{item.reviewer.fullName}</dd>
                  </div>
                )}
                {item.reviewedAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Ko‘rib chiqilgan</dt>
                    <dd className="text-right tabular">{formatDateTime(item.reviewedAt)}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Egasi" />
            <CardBody className="space-y-1 text-sm">
              <div className="flex items-center gap-3">
                <Avatar name={item.owner.fullName} src={item.owner.avatarUrl} size="md" />
                <p className="font-medium text-slate-900">{item.owner.fullName}</p>
              </div>
              <p className="text-slate-600">
                {item.owner.className
                  ? `${item.owner.className} sinf`
                  : item.owner.roles.map((role) => ROLE_LABELS[role]).join(', ')}
              </p>
              <p className="text-xs text-slate-500 tabular">Ichki ID: {formatInternalId(item.owner.internalId)}</p>
              {!item.isMine && isReviewer && (
                <Link
                  href={`/portfolio/students/${item.owner.id}`}
                  className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-brand-700 hover:underline"
                >
                  <FolderOpen className="size-4" aria-hidden />
                  To‘liq portfolio
                </Link>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tekshiruv tarixi" />
            <CardBody>
              {reviews.length === 0 ? (
                <p className="text-sm text-slate-500">Hali ko‘rib chiqilmagan.</p>
              ) : (
                <ol className="space-y-3">
                  {reviews.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <PortfolioStatusBadge status={entry.decision} />
                        <time dateTime={entry.createdAt} className="text-xs text-slate-500">
                          {formatHumanDateTime(entry.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1.5 text-sm text-slate-700">{entry.reviewer.fullName}</p>
                      {entry.reason && (
                        <p className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{entry.reason}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {item.isMine && <PortfolioFormDialog open={editing} item={item} onClose={() => setEditing(false)} />}
      <ReviewDialog target={review} onClose={() => setReview(null)} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() =>
          remove.mutate(item.id, {
            onSuccess: () => router.replace('/portfolio'),
            onSettled: () => setDeleting(false),
          })
        }
        loading={remove.isPending}
        tone="danger"
        title="Yozuvni o‘chirish"
        confirmLabel="O‘chirish"
      >
        “{item.title}” yozuvi butunlay o‘chiriladi. Bu amalni ortga qaytarib bo‘lmaydi.
      </ConfirmDialog>
    </div>
  );
}

export default function PortfolioItemPage() {
  return (
    <RequireRole roles={['STUDENT', 'TEACHER', 'DEPUTY', 'SUPER_ADMIN']}>
      <ItemDetail />
    </RequireRole>
  );
}
