'use client';

import { Table2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';

export interface ColumnDatum {
  key: string;
  label: string;
  value: number | null;
  /** Tooltip va jadvaldagi qiymat matni (masalan, “12 ta” yoki “66,7%”). */
  display: string;
  detail?: string;
}

const PLOT_HEIGHT = 180;
/** Eng baland ustun ustidagi yorliq uchun joy. */
const TOP = 22;
const AXIS_BAND = 28;
const LEFT = 36;
const BAR_MAX = 24;

/** Sanoq qiymatlari uchun butun sonli shkala: kichik qiymatlarda qadam 1, kattalarida 4 ta teng oraliq. */
function integerScale(value: number) {
  const maxValue = Math.max(1, Math.ceil(value));
  if (maxValue <= 4) return { top: maxValue, ticks: Array.from({ length: maxValue + 1 }, (_, index) => index) };
  const step = Math.ceil(maxValue / 4);
  return { top: step * 4, ticks: [0, 1, 2, 3, 4].map((index) => index * step) };
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * Bitta qatorli ustunli diagramma: ingichka ustunlar (≤24px), yumaloq uchi, ingichka qo‘shimcha
 * chiziqlar, har ustunda hover/fokus tooltip va jadval ko‘rinishi (qiymatlar faqat rangga bog‘liq emas).
 */
export function ColumnChart({
  data,
  title,
  valueLabel,
  max,
  tickFormat = (value: number) => String(value),
  emptyText = 'Ma’lumot yo‘q',
  labelHeader = 'Oraliq',
  integer = false,
  footer,
}: {
  data: ColumnDatum[];
  title: string;
  valueLabel: string;
  /** Jadval ko‘rinishidagi birinchi ustun nomi. */
  labelHeader?: string;
  /** Qiymatlar sanoq (butun son) — o‘q belgilari ham butun sonlarda. */
  integer?: boolean;
  max?: number;
  tickFormat?: (value: number) => string;
  emptyText?: string;
  footer?: ReactNode;
}) {
  const id = useId();
  const [active, setActive] = useState<string | null>(null);
  const [asTable, setAsTable] = useState(false);
  const values = data.map((item) => item.value ?? 0);
  const largest = Math.max(0, ...values);
  const scale = integer && max === undefined ? integerScale(largest) : null;
  const top = scale?.top ?? max ?? niceMax(largest);
  const width = Math.max(320, data.length * 56 + LEFT + 8);
  const slot = (width - LEFT - 8) / Math.max(1, data.length);
  const barWidth = Math.min(BAR_MAX, slot * 0.6);
  const ticks = scale?.ticks ?? [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * top);
  const maxIndex = values.indexOf(largest);
  const y = (value: number) => TOP + PLOT_HEIGHT - (value / top) * PLOT_HEIGHT;
  const activeDatum = data.find((item) => item.key === active);

  return (
    <figure className="space-y-2" aria-labelledby={`${id}-title`}>
      <figcaption className="flex items-center justify-between gap-2">
        <span id={`${id}-title`} className="text-sm font-medium text-slate-700">
          {title}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={<Table2 className="size-4" />}
          onClick={() => setAsTable((value) => !value)}
          aria-pressed={asTable}
        >
          {asTable ? 'Diagramma' : 'Jadval'}
        </Button>
      </figcaption>

      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>
      ) : asTable ? (
        <Table caption={title}>
          <THead>
            <tr>
              <TH>{labelHeader}</TH>
              <TH className="text-right">{valueLabel}</TH>
            </tr>
          </THead>
          <tbody>
            {data.map((item) => (
              <TR key={item.key}>
                <TD>{item.label}</TD>
                <TD className="text-right tabular">
                  {item.display}
                  {item.detail && <span className="ml-1 text-slate-500">{item.detail}</span>}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <div className="relative overflow-x-auto">
          <svg
            role="img"
            aria-label={`${title}. Qiymatlarni “Jadval” tugmasi orqali ko‘rish mumkin.`}
            viewBox={`0 0 ${width} ${TOP + PLOT_HEIGHT + AXIS_BAND}`}
            className="h-auto w-full min-w-[320px]"
          >
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={LEFT} x2={width - 8} y1={y(tick)} y2={y(tick)} className="stroke-viz-grid" strokeWidth={1} />
                <text x={LEFT - 6} y={y(tick) + 4} textAnchor="end" className="fill-viz-muted text-[11px] tabular">
                  {tickFormat(tick)}
                </text>
              </g>
            ))}
            <line x1={LEFT} x2={width - 8} y1={y(0)} y2={y(0)} className="stroke-viz-axis" strokeWidth={1} />
            {data.map((item, index) => {
              const value = item.value ?? 0;
              const cx = LEFT + slot * index + slot / 2;
              const height = (value / top) * PLOT_HEIGHT;
              const x = cx - barWidth / 2;
              const radius = Math.min(4, height);
              const barTop = y(value);
              const base = y(0);
              const path =
                height <= 0
                  ? ''
                  : `M${x},${base} V${barTop + radius} Q${x},${barTop} ${x + radius},${barTop} H${x + barWidth - radius} Q${x + barWidth},${barTop} ${x + barWidth},${barTop + radius} V${base} Z`;
              const isActive = active === item.key;
              return (
                <g
                  key={item.key}
                  tabIndex={0}
                  role="button"
                  aria-label={`${item.label}: ${item.display}${item.detail ? `, ${item.detail}` : ''}`}
                  onPointerEnter={() => setActive(item.key)}
                  onPointerLeave={() => setActive((current) => (current === item.key ? null : current))}
                  onFocus={() => setActive(item.key)}
                  onBlur={() => setActive((current) => (current === item.key ? null : current))}
                  className="cursor-default outline-none"
                >
                  {/* Kattaroq ko‘rinmas nishon — sichqoncha aniq tegishi shart emas */}
                  <rect x={cx - slot / 2} y={TOP} width={slot} height={PLOT_HEIGHT} fill="transparent" />
                  {path && <path d={path} className={isActive ? 'fill-viz-series-hover' : 'fill-viz-series'} />}
                  {index === maxIndex && value > 0 && (
                    <text
                      x={cx}
                      y={barTop - 6}
                      textAnchor="middle"
                      className="fill-slate-700 text-[11px] font-medium tabular"
                    >
                      {item.display}
                    </text>
                  )}
                  <text x={cx} y={TOP + PLOT_HEIGHT + 18} textAnchor="middle" className="fill-slate-500 text-[11px]">
                    {item.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {activeDatum && (
            <div
              className="pointer-events-none absolute top-1 right-2 rounded-lg border border-slate-200 bg-surface px-3 py-2 text-xs shadow-pop dark:shadow-none"
              role="status"
            >
              <p className="text-sm font-semibold text-slate-900 tabular">{activeDatum.display}</p>
              <p className="text-slate-500">
                {activeDatum.label}
                {activeDatum.detail ? ` · ${activeDatum.detail}` : ''}
              </p>
            </div>
          )}
        </div>
      )}
      {footer}
    </figure>
  );
}
