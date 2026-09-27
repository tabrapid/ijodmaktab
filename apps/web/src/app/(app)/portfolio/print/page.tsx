'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileQuestion, Printer } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { PORTFOLIO_STATUS_LABELS, formatDate, formatDateTime, formatInternalId } from '@ijod/shared';
import { RequireRole } from '@/components/app-shell';
import { isCreativeType, isUuid, levelLabel, portfolioKeys } from '@/components/portfolio/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { PortfolioItemView, PrintablePortfolio } from '@/lib/types';

/** A4 sahifa va chetlar (faqat chop etishda). */
const PAGE_STYLE = '@page { size: A4; margin: 16mm 14mm; }';

const cell = 'border border-slate-300 px-2 py-1.5 align-top print:border-slate-500';
const headCell = cn(
  cell,
  'bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase print:bg-transparent print:text-black',
);

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8 print:mt-6">
      <h2 className="border-b border-slate-300 pb-1 text-base font-bold tracking-wide text-slate-900 uppercase print:break-after-avoid print:border-slate-500 print:text-black">
        {title}
      </h2>
      {note && <p className="mt-2 text-sm text-slate-600 print:text-black">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ReviewerLine({ item }: { item: PortfolioItemView }) {
  if (!item.reviewer) return null;
  return (
    <span className="block text-xs text-slate-600 print:text-black">
      Tasdiqladi: {item.reviewer.fullName}
      {item.reviewedAt ? `, ${formatDate(item.reviewedAt)}` : ''}
    </span>
  );
}

function AchievementsTable({ items }: { items: PortfolioItemView[] }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-sm">
        <thead className="print:table-header-group">
          <tr>
            <th scope="col" className={cn(headCell, 'w-8 text-center')}>
              №
            </th>
            <th scope="col" className={headCell}>
              Sana
            </th>
            <th scope="col" className={headCell}>
              Nomi
            </th>
            <th scope="col" className={headCell}>
              Turi
            </th>
            <th scope="col" className={headCell}>
              Bosqich
            </th>
            <th scope="col" className={headCell}>
              Natija / o‘rin
            </th>
            <th scope="col" className={headCell}>
              Tashkilot
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} className="break-inside-avoid">
              <td className={cn(cell, 'text-center tabular')}>{index + 1}</td>
              <td className={cn(cell, 'whitespace-nowrap tabular')}>{item.date ? formatDate(item.date) : '—'}</td>
              <td className={cell}>
                <span className="font-medium">{item.title}</span>
                {item.subject && (
                  <span className="block text-xs text-slate-600 print:text-black">Fan: {item.subject.name}</span>
                )}
                <ReviewerLine item={item} />
              </td>
              <td className={cell}>{item.typeLabel}</td>
              <td className={cell}>{levelLabel(item.level) ?? '—'}</td>
              <td className={cell}>{item.result ?? '—'}</td>
              <td className={cell}>{item.organization ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreativeWorks({ items, author }: { items: PortfolioItemView[]; author: string }) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => {
        const details = [
          item.typeLabel,
          item.date ? formatDate(item.date) : null,
          item.level ? `${levelLabel(item.level)} bosqichi` : null,
          item.result,
          item.organization,
        ].filter(Boolean);
        return (
          <li key={item.id} className="break-inside-avoid border-l-2 border-slate-300 pl-4 print:border-slate-500">
            <p className="font-semibold text-slate-900 print:text-black">
              {index + 1}. {item.title}
            </p>
            <p className="text-xs text-slate-600 print:text-black">{details.join(' · ')}</p>
            <p className="mt-1 text-sm">
              Muallif: <span className="font-medium">{author}</span>
            </p>
            {item.description && <p className="mt-2 text-sm whitespace-pre-wrap">{item.description}</p>}
            <ReviewerLine item={item} />
          </li>
        );
      })}
    </ol>
  );
}

/** Qo‘shimcha ma’lumot satri: “Xalqaro bosqichi · 1-o‘rin · Tashkilot”. */
const detailsLine = (item: PortfolioItemView) =>
  [item.level ? `${levelLabel(item.level)} bosqichi` : null, item.result, item.organization]
    .filter(Boolean)
    .join(' · ');

function UnapprovedTable({ items, author }: { items: PortfolioItemView[]; author: string }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-sm">
        <thead className="print:table-header-group">
          <tr>
            <th scope="col" className={cn(headCell, 'w-8 text-center')}>
              №
            </th>
            <th scope="col" className={headCell}>
              Sana
            </th>
            <th scope="col" className={headCell}>
              Nomi
            </th>
            <th scope="col" className={headCell}>
              Turi
            </th>
            <th scope="col" className={headCell}>
              Holat
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} className="break-inside-avoid">
              <td className={cn(cell, 'text-center tabular')}>{index + 1}</td>
              <td className={cn(cell, 'whitespace-nowrap tabular')}>{item.date ? formatDate(item.date) : '—'}</td>
              <td className={cell}>
                <span className="font-medium">{item.title}</span>
                {isCreativeType(item.type) && (
                  <span className="block text-xs text-slate-600 print:text-black">Muallif: {author}</span>
                )}
                {detailsLine(item) && (
                  <span className="block text-xs text-slate-600 print:text-black">{detailsLine(item)}</span>
                )}
              </td>
              <td className={cell}>{item.typeLabel}</td>
              <td className={cell}>
                <span className="inline-block rounded border border-slate-500 px-1.5 py-0.5 text-xs font-semibold uppercase">
                  Tasdiqlanmagan
                </span>
                <span className="mt-0.5 block text-xs text-slate-600 print:text-black">
                  {PORTFOLIO_STATUS_LABELS[item.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PrintDocument({ data }: { data: PrintablePortfolio }) {
  const achievements = data.approved.filter((item) => !isCreativeType(item.type));
  const creative = data.approved.filter((item) => isCreativeType(item.type));
  const author = data.owner.fullName;
  return (
    <article
      className={cn(
        'mx-auto max-w-[210mm] rounded-xl border border-slate-200 bg-surface p-5 text-slate-900 shadow-xs sm:p-10',
        'print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-black print:shadow-none',
      )}
    >
      <header className="border-b-2 border-slate-800 pb-4 text-center print:border-black">
        <p className="text-xs font-semibold tracking-[0.18em] text-slate-600 uppercase print:text-black">
          {data.school}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Portfolio</h1>
      </header>

      <dl className="mt-5 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 print:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-slate-500 print:text-black">F.I.Sh.:</dt>
          <dd className="font-semibold">{data.owner.fullName}</dd>
        </div>
        {data.owner.roles.includes('STUDENT') ? (
          <div className="flex gap-2">
            <dt className="text-slate-500 print:text-black">Sinf:</dt>
            <dd className="font-medium">{data.owner.className ?? '—'}</dd>
          </div>
        ) : (
          <div className="flex gap-2">
            <dt className="text-slate-500 print:text-black">Lavozim:</dt>
            <dd className="font-medium">{data.owner.roles.includes('TEACHER') ? 'O‘qituvchi' : 'Xodim'}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-slate-500 print:text-black">Ichki ID:</dt>
          <dd className="font-medium tabular">{formatInternalId(data.owner.internalId)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-slate-500 print:text-black">Yaratilgan sana:</dt>
          <dd className="font-medium tabular">{formatDateTime(data.generatedAt)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-slate-600 print:text-black">
        Tasdiqlangan yutuqlar: <strong className="tabular">{achievements.length}</strong> · Tasdiqlangan ijodiy ishlar:{' '}
        <strong className="tabular">{creative.length}</strong> · Tasdiqlanmagan yozuvlar:{' '}
        <strong className="tabular">{data.unapproved.length}</strong>
      </p>

      <Section title="Tasdiqlangan yutuqlar">
        {achievements.length > 0 ? (
          <AchievementsTable items={achievements} />
        ) : (
          <p className="text-sm text-slate-500 print:text-black">Tanlangan yozuvlar orasida tasdiqlangan yutuq yo‘q.</p>
        )}
      </Section>

      {creative.length > 0 && (
        <Section title="Ijodiy ishlar" note="Tasdiqlangan ijodiy ishlar. Asarlarning muallifligi saqlanadi.">
          <CreativeWorks items={creative} author={author} />
        </Section>
      )}

      {data.unapproved.length > 0 && (
        <Section
          title="Tasdiqlanmagan yozuvlar"
          note="Quyidagi yozuvlar tasdiqlanmagan va tasdiqlangan yutuqlar hisobiga kirmaydi."
        >
          <UnapprovedTable items={data.unapproved} author={author} />
        </Section>
      )}

      <footer className="mt-10 border-t border-slate-300 pt-3 text-xs text-slate-500 print:border-slate-500 print:text-black">
        Hujjat “{data.school}” axborot tizimida {formatDateTime(data.generatedAt)} da shakllantirildi. “Tasdiqlangan
        yutuqlar” va “Ijodiy ishlar” bo‘limlaridagi yozuvlar sinf rahbari yoki maktab rahbariyati tomonidan
        tasdiqlangan. Portfolio ommaga ochiq emas.
      </footer>
    </article>
  );
}

function PrintView() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: me } = useMe();
  const owner = params.get('owner') ?? '';
  const idsParam = params.get('ids') ?? '';
  const ids = useMemo(
    () => [
      ...new Set(
        idsParam
          .split(',')
          .map((value) => value.trim())
          .filter(isUuid),
      ),
    ],
    [idsParam],
  );
  const valid = isUuid(owner) && ids.length > 0;

  const query = useQuery({
    queryKey: portfolioKeys.print(owner, ids),
    queryFn: () => api.post<PrintablePortfolio>(`/portfolio/print/${owner}`, { itemIds: ids }),
    enabled: valid,
    // Har yuklash audit jurnaliga “chop etildi” deb yoziladi — keraksiz qayta so‘rov yuborilmaydi.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const data = query.data;

  // Brauzer PDF fayl nomini sahifa sarlavhasidan oladi.
  useEffect(() => {
    if (!data) return;
    const previous = document.title;
    document.title = `Portfolio — ${data.owner.fullName}`;
    return () => {
      document.title = previous;
    };
  }, [data]);

  const own = me?.id === owner;
  const found = data ? data.approved.length + data.unapproved.length : 0;

  return (
    <div>
      <style>{PAGE_STYLE}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {own ? (
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Portfoliomga qaytish
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Orqaga
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <p className="max-w-xs text-xs text-slate-500">
            PDF uchun chop etish oynasida “PDF sifatida saqlash”ni tanlang.
          </p>
          <Button onClick={() => window.print()} disabled={!data} icon={<Printer className="size-4" aria-hidden />}>
            Chop etish / PDF saqlash
          </Button>
        </div>
      </div>

      {!valid ? (
        <Card>
          <EmptyState
            icon={FileQuestion}
            title="Chop etish uchun yozuvlar tanlanmagan"
            description="Portfolio sahifasida kerakli yozuvlarni belgilab, “Chop etish / PDF” tugmasini bosing."
            action={
              <Link href="/portfolio" className="text-sm font-medium text-brand-700 hover:underline">
                Portfolioga o‘tish
              </Link>
            }
          />
        </Card>
      ) : query.isPending ? (
        <PageLoader label="Hujjat tayyorlanmoqda…" />
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          {found < ids.length && (
            <Alert tone="warning" className="mb-4 print:hidden">
              Tanlangan {ids.length} ta yozuvdan {ids.length - found} tasi topilmadi yoki uni ko‘rish huquqingiz yo‘q —
              ular hujjatga kiritilmadi.
            </Alert>
          )}
          <PrintDocument data={data} />
        </>
      )}
    </div>
  );
}

export default function PortfolioPrintPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RequireRole roles={['STUDENT', 'TEACHER', 'DEPUTY', 'SUPER_ADMIN']}>
        <PrintView />
      </RequireRole>
    </Suspense>
  );
}
