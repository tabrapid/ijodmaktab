import { Medal } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  IELTS_TEST_TYPE_LABELS,
  OLYMPIAD_PLACE_LABELS,
  parsePortfolioDetails,
  portfolioDetailValue,
  type CefrDetails,
  type IeltsDetails,
  type NationalCertificateDetails,
  type NationalCertificateGrade,
  type OlympiadDetails,
  type OlympiadPlace,
  type PortfolioItemType,
  type SatDetails,
} from '@ijod/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

const GRADE_TONES: Record<NationalCertificateGrade, BadgeTone> = {
  'A+': 'green',
  A: 'green',
  'B+': 'brand',
  B: 'brand',
  'C+': 'amber',
  C: 'amber',
};

const cefrTone = (level: string): BadgeTone =>
  level.startsWith('C') ? 'violet' : level.startsWith('B') ? 'brand' : 'gray';

/** Medal rangi: oltin, kumush, bronza; qolganlari — neytral. */
const MEDAL_COLORS: Record<OlympiadPlace, string> = {
  FIRST: 'text-amber-500',
  SECOND: 'text-slate-400',
  THIRD: 'text-amber-800',
  HONORABLE: 'text-violet-500',
  PARTICIPANT: 'text-slate-300',
};

/** Katta ball: “7.5 / Overall”. */
function ScoreTile({ value, label, emphasis = false }: { value: ReactNode; label: string; emphasis?: boolean }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col items-center justify-center rounded-lg border px-2 py-1.5 text-center',
        'print:border-slate-400 print:bg-transparent',
        emphasis ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-surface',
      )}
    >
      <span
        className={cn(
          'font-semibold tabular text-slate-900 print:text-black',
          emphasis ? 'text-xl text-brand-800' : 'text-base',
        )}
      >
        {value}
      </span>
      <span className="text-[11px] tracking-wide text-slate-500 uppercase print:text-black">{label}</span>
    </div>
  );
}

function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  const visible = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== '');
  if (visible.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {visible.map((item) => (
        <div key={item.label} className="flex min-w-0 gap-1">
          <dt className="shrink-0 text-slate-500 print:text-black">{item.label}:</dt>
          <dd className="min-w-0 font-medium break-words text-slate-800 print:text-black">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Olimpiada o‘rni medal belgisi bilan. */
export function PlaceMedal({ place, className }: { place: OlympiadPlace; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium text-slate-800 print:text-black', className)}>
      <Medal className={cn('size-4 shrink-0', MEDAL_COLORS[place])} aria-hidden />
      {OLYMPIAD_PLACE_LABELS[place]}
    </span>
  );
}

/**
 * Turga xos ma’lumotlarni ko‘rsatadi: IELTS bo‘limlari, SAT bo‘limlari, milliy sertifikat darajasi,
 * CEFR darajasi, olimpiada o‘rni. `compact` — kartochkalar uchun bir qatorli ko‘rinish.
 */
export function DetailsView({
  type,
  details,
  compact = false,
  className,
}: {
  type: PortfolioItemType;
  details: unknown;
  compact?: boolean;
  className?: string;
}) {
  const parsed = parsePortfolioDetails(type, details);
  if (!parsed.success || !parsed.data) return null;

  switch (type) {
    case 'IELTS': {
      const value = parsed.data as IeltsDetails;
      const bands = [
        ['L', 'Listening', value.listening],
        ['R', 'Reading', value.reading],
        ['W', 'Writing', value.writing],
        ['S', 'Speaking', value.speaking],
      ] as const;
      if (compact) {
        return (
          <p className={cn('flex flex-wrap items-center gap-1.5 text-sm', className)}>
            <Badge tone="brand">
              {IELTS_TEST_TYPE_LABELS[value.testType]} · {value.overall}
            </Badge>
            {bands
              .filter(([, , score]) => score !== undefined)
              .map(([short, label, score]) => (
                <span key={short} className="text-slate-600 tabular print:text-black" title={label}>
                  {short} {score}
                </span>
              ))}
          </p>
        );
      }
      return (
        <div className={cn('space-y-2', className)}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <ScoreTile value={value.overall} label="Overall" emphasis />
            {bands.map(([short, label, score]) => (
              <ScoreTile key={short} value={score ?? '—'} label={label} />
            ))}
          </div>
          <Facts
            items={[
              { label: 'Imtihon turi', value: IELTS_TEST_TYPE_LABELS[value.testType] },
              { label: 'TRF raqami', value: value.trfNumber },
            ]}
          />
        </div>
      );
    }
    case 'SAT': {
      const value = parsed.data as SatDetails;
      if (compact) {
        return (
          <p className={cn('flex flex-wrap items-center gap-1.5 text-sm', className)}>
            <Badge tone="brand">SAT {value.total}</Badge>
            {value.readingWriting !== undefined && (
              <span className="text-slate-600 tabular print:text-black">RW {value.readingWriting}</span>
            )}
            {value.math !== undefined && (
              <span className="text-slate-600 tabular print:text-black">M {value.math}</span>
            )}
          </p>
        );
      }
      return (
        <div className={cn('grid max-w-md grid-cols-3 gap-2', className)}>
          <ScoreTile value={value.total} label="Umumiy" emphasis />
          <ScoreTile value={value.readingWriting ?? '—'} label="Reading & Writing" />
          <ScoreTile value={value.math ?? '—'} label="Math" />
        </div>
      );
    }
    case 'NATIONAL_CERTIFICATE': {
      const value = parsed.data as NationalCertificateDetails;
      const head = (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-900 print:text-black">{value.subject}</span>
          <Badge tone={GRADE_TONES[value.grade]}>{value.grade}</Badge>
          {value.score !== undefined && (
            <span className="text-sm text-slate-600 tabular print:text-black">{value.score} ball</span>
          )}
        </span>
      );
      if (compact) return <p className={cn('text-sm', className)}>{head}</p>;
      return (
        <div className={cn('space-y-1.5', className)}>
          {head}
          <Facts
            items={[
              { label: 'Sertifikat raqami', value: value.certificateNumber },
              {
                label: 'Amal qilish muddati',
                value: value.validUntil ? portfolioDetailValue('validUntil', value.validUntil) : null,
              },
            ]}
          />
        </div>
      );
    }
    case 'CEFR': {
      const value = parsed.data as CefrDetails;
      const head = (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-slate-900 print:text-black">{value.language}</span>
          <Badge tone={cefrTone(value.level)}>{value.level}</Badge>
          {value.provider && <span className="text-sm text-slate-600 print:text-black">{value.provider}</span>}
        </span>
      );
      if (compact) return <p className={cn('text-sm', className)}>{head}</p>;
      return (
        <div className={cn('space-y-1.5', className)}>
          {head}
          <Facts
            items={[
              { label: 'Ball', value: value.score },
              { label: 'Sertifikat raqami', value: value.certificateNumber },
            ]}
          />
        </div>
      );
    }
    case 'OLYMPIAD': {
      const value = parsed.data as OlympiadDetails;
      return (
        <p className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm', className)}>
          <span className="font-medium text-slate-900 print:text-black">{value.subject}</span>
          {value.place && <PlaceMedal place={value.place} />}
        </p>
      );
    }
    default:
      return null;
  }
}
