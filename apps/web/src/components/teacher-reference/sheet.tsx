import { Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatFileSize } from '@/components/portfolio/utils';
import { cn } from '@/lib/cn';
import type { FileRef } from '@/lib/types';

/** Yopiq ombordagi hujjat (yangi oynada ochiladi; ruxsatni server tekshiradi). */
export function FileLink({ file, className }: { file: FileRef; className?: string }) {
  return (
    <a
      href={`/api/files/${file.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-surface px-2 py-1',
        'text-xs font-medium text-brand-700 hover:border-brand-200 hover:bg-brand-50',
        className,
      )}
    >
      <Paperclip className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{file.originalName}</span>
      <span className="shrink-0 font-normal text-slate-500">({formatFileSize(file.sizeBytes)})</span>
      <span className="sr-only"> — hujjat, yangi oynada ochiladi</span>
    </a>
  );
}

/** Band raqami — qog‘ozdagi ma’lumotnoma tartibi (1–11) ko‘rinib tursin. */
export function SectionNumber({ value, className }: { value: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 tabular ring-1 ring-brand-200',
        className,
      )}
    >
      {value}
    </span>
  );
}

/** Band sarlavhasi: raqam, nom, izoh va (ixtiyoriy) amallar. */
export function SectionHeading({
  number,
  title,
  description,
  actions,
  as: Heading = 'h2',
}: {
  number: number;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 gap-3">
        <SectionNumber value={number} className="mt-px" />
        <div className="min-w-0">
          <Heading className="text-base font-semibold tracking-tight break-words text-slate-900">
            <span className="sr-only">{number}. </span>
            {title}
          </Heading>
          {description && <div className="mt-0.5 text-sm text-slate-500">{description}</div>}
        </div>
      </div>
      {/* Telefonda tugma sarlavha ostida, matn bilan bir chiziqda. */}
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 pl-10 sm:pl-0">{actions}</div>}
    </div>
  );
}

/** Bandlar bo‘yicha tezkor o‘tish (telefonda uzun sahifa uchun qulay). */
export function SectionNav({ items }: { items: { number: number; label: string }[] }) {
  return (
    <nav aria-label="Ma’lumotnoma bandlari" className="-mx-1 overflow-x-auto pb-1">
      <ol className="flex w-max gap-1.5 px-1">
        {items.map((item) => (
          <li key={item.number}>
            <a
              href={`#band-${item.number}`}
              title={item.label}
              className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-surface text-sm font-semibold text-slate-700 tabular transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              <span className="sr-only">{item.label}: </span>
              {item.number}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Band uchun langar (`#band-4`): o‘tilganda sarlavha yopishqoq panel ostida qolmaydi. */
export function Band({ number, children }: { number: number; children: ReactNode }) {
  return (
    <div id={`band-${number}`} className="scroll-mt-24">
      {children}
    </div>
  );
}

/** Ko‘rish rejimidagi “yorliq — qiymat” qatori. */
export function SheetRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-slate-900 sm:col-span-2">{children}</dd>
    </div>
  );
}

export const notEntered = <span className="text-slate-500">Kiritilmagan</span>;
