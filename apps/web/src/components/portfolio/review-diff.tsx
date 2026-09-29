import { ArrowRight } from 'lucide-react';
import {
  ACHIEVEMENT_LEVEL_LABELS,
  PORTFOLIO_ITEM_TYPE_LABELS,
  PORTFOLIO_VISIBILITY_LABELS,
  formatDate,
  portfolioDetailChanges,
  type AchievementLevel,
  type PortfolioFieldChange,
  type PortfolioItemType,
  type PortfolioVisibility,
} from '@ijod/shared';
import { cn } from '@/lib/cn';
import { safeExternalUrl } from './utils';

interface Row {
  key: string;
  label: string;
  before: string;
  after: string;
  note?: string;
}

const EMPTY = '—';

function display(field: PortfolioFieldChange['field'], value: unknown): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  switch (field) {
    case 'type':
      return PORTFOLIO_ITEM_TYPE_LABELS[value as PortfolioItemType] ?? String(value);
    case 'level':
      return ACHIEVEMENT_LEVEL_LABELS[value as AchievementLevel] ?? String(value);
    case 'visibility':
      return PORTFOLIO_VISIBILITY_LABELS[value as PortfolioVisibility] ?? String(value);
    case 'date':
      return formatDate(String(value));
    case 'evidenceUrl':
      return safeExternalUrl(String(value))?.hostname.replace(/^www\./, '') ?? String(value);
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

/** Farqlar jadvali qatorlari: details maydonma-maydon, nomlari bilan ochib ko‘rsatiladi. */
function rowsOf(changes: PortfolioFieldChange[], currentType: PortfolioItemType): Row[] {
  const typeChange = changes.find((change) => change.field === 'type');
  const beforeType = (typeChange?.before as PortfolioItemType | null | undefined) ?? currentType;
  const rows: Row[] = [];
  for (const change of changes) {
    if (change.field === 'details') {
      for (const detail of portfolioDetailChanges(beforeType, change.before, currentType, change.after)) {
        rows.push({ key: `details.${detail.field}`, label: detail.label, before: detail.before, after: detail.after });
      }
      continue;
    }
    const before = display(change.field, change.before);
    const after = display(change.field, change.after);
    rows.push({
      key: change.field,
      label: change.label,
      before,
      after,
      note: change.field === 'evidenceFileId' && before === after ? 'Fayl almashtirilgan' : undefined,
    });
  }
  return rows;
}

/**
 * Tasdiqlangandan keyin nima o‘zgardi: maydon, eski va yangi qiymat. Kichik ekranda har bir qator
 * ustma-ust ko‘rsatiladi.
 */
export function ChangesTable({
  changes,
  type,
  className,
}: {
  changes: PortfolioFieldChange[];
  type: PortfolioItemType;
  className?: string;
}) {
  const rows = rowsOf(changes, type);
  if (rows.length === 0) {
    return (
      <p className={cn('text-sm text-slate-500', className)}>
        Tasdiqlangan holatdan farq topilmadi (faqat tavsif kabi ikkinchi darajali maydonlar o‘zgargan bo‘lishi mumkin).
      </p>
    );
  }
  return (
    <div className={cn('overflow-hidden rounded-lg border border-slate-200', className)}>
      <div className="hidden grid-cols-[minmax(8rem,1fr)_2fr_2fr] gap-3 bg-slate-50 px-3 py-2 text-xs font-medium tracking-wide text-slate-500 uppercase sm:grid">
        <span>Maydon</span>
        <span>Avval tasdiqlangan</span>
        <span>Yangi qiymat</span>
      </div>
      <dl className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.key} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(8rem,1fr)_2fr_2fr] sm:gap-3">
            <dt className="font-medium text-slate-700">{row.label}</dt>
            <dd className="min-w-0 break-words text-slate-500">
              <span className="sr-only">Avval: </span>
              {row.before}
            </dd>
            <dd className="flex min-w-0 items-start gap-1.5 font-medium break-words text-slate-900">
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-amber-700 sm:hidden" aria-hidden />
              <span className="min-w-0">
                <span className="sr-only">Yangi: </span>
                <mark className="rounded bg-amber-50 px-1 text-amber-900">{row.after}</mark>
                {row.note && <span className="block text-xs font-normal text-slate-500">{row.note}</span>}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
