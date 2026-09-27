import type { ReactNode } from 'react';
import { formatPercent, formatPoints, type Ratio } from '@ijod/shared';

export interface BarListItem {
  key: string;
  label: ReactNode;
  sublabel?: ReactNode;
  ratio: Ratio;
}

/**
 * Gorizontal foiz chiziqlari (bitta qator — bitta rang). Har qatorda aniq qiymat va surat/maxraj
 * matn sifatida yoziladi, shuning uchun alohida jadval ko‘rinishi shart emas.
 */
export function BarList({
  items,
  emptyText = 'Ma’lumot yo‘q',
  caption,
}: {
  items: BarListItem[];
  emptyText?: string;
  caption: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <ul className="space-y-3" aria-label={caption}>
      {items.map((item) => {
        const width = item.ratio.percent === null ? 0 : Math.max(0, Math.min(100, item.ratio.percent));
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-800">
                {item.label}
                {item.sublabel && <span className="ml-1.5 text-xs text-slate-500">{item.sublabel}</span>}
              </span>
              <span className="shrink-0 text-slate-900 tabular">
                <span className="font-medium">{formatPercent(item.ratio.percent)}</span>{' '}
                <span className="text-xs text-slate-500">
                  ({formatPoints(item.ratio.numerator)} / {formatPoints(item.ratio.denominator)})
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full bg-slate-100 dark:bg-slate-200" aria-hidden>
              <div className="h-full rounded-r-[4px] bg-viz-series" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
