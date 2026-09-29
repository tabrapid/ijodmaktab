'use client';

import { Check, Eye, GitCompare, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { formatDate, formatHumanDateTime } from '@ijod/shared';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import type { PortfolioItemView } from '@/lib/types';
import { DetailsView } from './details-view';
import { AuthorshipNote, EvidenceLinks, LevelBadge, PortfolioMeta } from './parts';
import { ChangesTable } from './review-diff';
import { isCreativeType } from './utils';

/** “Yangi” yoki “O‘zgartirilgan” belgisi (tekshiruvchi uchun). */
export function ChangeKindBadge({ item }: { item: Pick<PortfolioItemView, 'changeKind'> }) {
  if (item.changeKind === 'CHANGED') return <Badge tone="amber">O‘zgartirilgan</Badge>;
  if (item.changeKind === 'NEW') return <Badge tone="green">Yangi</Badge>;
  return null;
}

/**
 * Tekshiruvdagi yozuv kartochkasi: ma’lumotlar, dalil, tasdiqlangan holatdan farq va qaror tugmalari.
 */
export function PendingItemCard({
  item,
  approving,
  disabled,
  onApprove,
  onReturn,
}: {
  item: PortfolioItemView;
  approving: boolean;
  disabled?: boolean;
  onApprove: () => void;
  onReturn: () => void;
}) {
  const changed = item.changeKind === 'CHANGED';
  return (
    <li className="rounded-xl border border-slate-200 bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-1.5">
          <Link
            href={`/portfolio/${item.id}`}
            className="font-semibold break-words text-slate-900 hover:text-brand-700 hover:underline"
          >
            {item.title}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <ChangeKindBadge item={item} />
            <Badge tone="gray">{item.typeLabel}</Badge>
            {item.level && <LevelBadge level={item.level} />}
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Yuborilgan: <time dateTime={item.submittedAt ?? undefined}>{formatHumanDateTime(item.submittedAt)}</time>
          {changed && item.lastApprovedAt && (
            <span className="block">Oxirgi tasdiq: {formatDate(item.lastApprovedAt)}</span>
          )}
        </p>
      </div>

      <div className="mt-3 space-y-3">
        {item.wasReturned && (
          <Alert tone="warning" title="Avval tuzatishga qaytarilgan">
            {item.lastReturnReason ? (
              <>
                Sabab: <span className="whitespace-pre-wrap">{item.lastReturnReason}</span>
              </>
            ) : (
              'Sabab ko‘rsatilmagan.'
            )}
          </Alert>
        )}
        <DetailsView type={item.type} details={item.details} />
        <PortfolioMeta item={item} withTypeAndLevel={false} />
        {isCreativeType(item.type) && <AuthorshipNote author={item.owner.fullName} />}
        {item.description && (
          <p className="line-clamp-3 text-sm whitespace-pre-wrap text-slate-600">{item.description}</p>
        )}
        <EvidenceLinks
          file={item.evidenceFile}
          url={item.evidenceUrl}
          emptyText="Dalil biriktirilmagan — tasdiqlashdan oldin aniqlashtiring."
        />
        {changed && (
          <section aria-label="Tasdiqlangan holatdan farqlar" className="space-y-2">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <GitCompare className="size-4 text-amber-700" aria-hidden />
              Nima o‘zgardi
            </h3>
            <ChangesTable changes={item.changes ?? []} type={item.type} />
          </section>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {item.canReview ? (
          <>
            <Button
              size="sm"
              onClick={onApprove}
              loading={approving}
              disabled={disabled}
              icon={<Check className="size-4" aria-hidden />}
            >
              Tasdiqlash
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onReturn}
              disabled={disabled || approving}
              icon={<Undo2 className="size-4" aria-hidden />}
            >
              Tuzatishga qaytarish
            </Button>
          </>
        ) : (
          <p className="text-sm text-slate-500">Bu yozuvni tasdiqlash vakolatingiz yo‘q.</p>
        )}
        <ButtonLink
          href={`/portfolio/${item.id}`}
          size="sm"
          variant="ghost"
          icon={<Eye className="size-4" aria-hidden />}
        >
          Batafsil
        </ButtonLink>
      </div>
    </li>
  );
}
