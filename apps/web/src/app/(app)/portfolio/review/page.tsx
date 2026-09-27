'use client';

import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Check, Eye, SearchX, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatHumanDateTime, normalizeForSearch } from '@ijod/shared';
import { RequireRole } from '@/components/app-shell';
import { AuthorshipNote, EvidenceLinks, LevelBadge, PortfolioMeta } from '@/components/portfolio/parts';
import { ReviewDialog, type ReviewTarget } from '@/components/portfolio/review-dialog';
import { isCreativeType, portfolioKeys } from '@/components/portfolio/utils';
import { RoleBadges } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardBody, PageHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { api } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import type { PortfolioItemView } from '@/lib/types';

function QueueItem({ item, onReview }: { item: PortfolioItemView; onReview: (target: ReviewTarget) => void }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{item.owner.fullName}</p>
          {item.owner.className && <Badge tone="brand">{item.owner.className} sinf</Badge>}
          <RoleBadges roles={item.owner.roles} />
        </div>
        <p className="text-xs text-slate-500">
          Yuborilgan: <time dateTime={item.submittedAt ?? undefined}>{formatHumanDateTime(item.submittedAt)}</time>
        </p>
      </div>
      <div className="mt-3 space-y-2">
        <Link
          href={`/portfolio/${item.id}`}
          className="font-semibold break-words text-slate-900 hover:text-brand-700 hover:underline"
        >
          {item.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gray">{item.typeLabel}</Badge>
          {item.level && <LevelBadge level={item.level} />}
        </div>
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
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.canReview ? (
          <>
            <Button
              size="sm"
              onClick={() => onReview({ item, decision: 'APPROVED' })}
              icon={<Check className="size-4" aria-hidden />}
            >
              Tasdiqlash
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReview({ item, decision: 'RETURNED' })}
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

function ReviewQueue() {
  const { data: me } = useMe();
  const [search, setSearch] = useState('');
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  const homeroom = (me?.homeroomClassIds.length ?? 0) > 0;

  const queue = useQuery({
    queryKey: portfolioKeys.reviewQueue,
    queryFn: () => api.get<PortfolioItemView[]>('/portfolio/review-queue'),
    refetchInterval: 60_000,
  });

  const needle = normalizeForSearch(search);
  const items = useMemo(() => {
    const all = queue.data ?? [];
    if (!needle) return all;
    return all.filter((item) =>
      normalizeForSearch(
        [item.owner.fullName, item.owner.className, item.title, item.typeLabel, item.organization]
          .filter(Boolean)
          .join(' '),
      ).includes(needle),
    );
  }, [queue.data, needle]);

  const scopeText = leadership
    ? 'Rahbariyat barcha tekshiruvga yuborilgan yozuvlarni tasdiqlashi mumkin. O‘z yozuvlaringiz bu navbatda ko‘rinmaydi — o‘zini o‘zi tasdiqlash mumkin emas.'
    : 'Sinf rahbari sifatida faqat o‘z sinfingiz o‘quvchilarining yozuvlarini tasdiqlaysiz.';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio tasdiqlash"
        description="Tekshiruvga yuborilgan yozuvlar — avval eng oldin yuborilganlari. Qaytarishda sabab majburiy."
      />

      <Alert tone="info">{scopeText}</Alert>

      {queue.isPending ? (
        <PageLoader />
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
      ) : queue.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={BadgeCheck}
            title="Tasdiqlash navbati bo‘sh"
            description={
              leadership
                ? 'Yangi yozuv tekshiruvga yuborilganda shu yerda paydo bo‘ladi va sizga bildirishnoma keladi.'
                : homeroom
                  ? 'Sinfingiz o‘quvchilari yozuvni tekshiruvga yuborganda shu yerda paydo bo‘ladi. Sinf rahbari faqat o‘z sinfi o‘quvchilarining yozuvlarini tasdiqlaydi.'
                  : 'Portfolio yozuvlarini sinf rahbarlari o‘z sinfi o‘quvchilari uchun tasdiqlaydi. Siz hozircha sinf rahbari emassiz, shuning uchun navbatga yozuv tushmaydi.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <Field label="Qidirish" className="w-full sm:max-w-sm">
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="F.I.Sh., sinf yoki yozuv nomi…"
                />
              </Field>
              <p className="text-sm text-slate-600" aria-live="polite">
                Navbatda: <span className="font-semibold tabular">{queue.data.length}</span> ta yozuv
                {needle && ` · ko‘rsatilmoqda: ${items.length}`}
              </p>
            </CardBody>
          </Card>
          {items.length === 0 ? (
            <Card>
              <EmptyState icon={SearchX} title="Mos yozuv topilmadi" description="Qidiruv so‘zini o‘zgartiring." />
            </Card>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <QueueItem key={item.id} item={item} onReview={setReview} />
              ))}
            </ul>
          )}
        </div>
      )}

      <ReviewDialog target={review} onClose={() => setReview(null)} />
    </div>
  );
}

export default function PortfolioReviewPage() {
  return (
    <RequireRole roles={['TEACHER', 'DEPUTY', 'SUPER_ADMIN']}>
      <ReviewQueue />
    </RequireRole>
  );
}
