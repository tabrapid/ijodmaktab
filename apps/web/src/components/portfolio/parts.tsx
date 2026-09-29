import { ExternalLink, Paperclip, PenLine } from 'lucide-react';
import { ACHIEVEMENT_LEVEL_LABELS, formatDate, type AchievementLevel } from '@ijod/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Alert } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import type { FileRef, PortfolioItemView } from '@/lib/types';
import { formatFileSize, levelLabel, safeExternalUrl } from './utils';

const LEVEL_TONES: Record<AchievementLevel, BadgeTone> = {
  SCHOOL: 'gray',
  DISTRICT: 'blue',
  REGION: 'brand',
  NATIONAL: 'violet',
  INTERNATIONAL: 'amber',
};

/** Yutuq bosqichi (maktab, tuman, …) — matn bilan. */
export const LevelBadge = ({ level }: { level: AchievementLevel }) => (
  <Badge tone={LEVEL_TONES[level]}>{ACHIEVEMENT_LEVEL_LABELS[level]} bosqichi</Badge>
);

/** Dalil: yopiq ombordagi fayl (yangi oynada) va/yoki tashqi havola. */
export function EvidenceLinks({
  file,
  url,
  className,
  emptyText = 'Dalil biriktirilmagan',
}: {
  file: FileRef | null;
  url: string | null;
  className?: string;
  emptyText?: string | null;
}) {
  const external = safeExternalUrl(url);
  if (!file && !external)
    return emptyText ? <p className={cn('text-sm text-slate-500', className)}>{emptyText}</p> : null;
  const linkClass = cn(
    'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-surface px-2 py-1',
    'text-xs font-medium text-brand-700 hover:border-brand-200 hover:bg-brand-50',
  );
  return (
    <ul className={cn('flex flex-wrap gap-2', className)} aria-label="Dalillar">
      {file && (
        <li className="max-w-full min-w-0">
          <a href={`/api/files/${file.id}`} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <Paperclip className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{file.originalName}</span>
            <span className="shrink-0 font-normal text-slate-500">({formatFileSize(file.sizeBytes)})</span>
            <span className="sr-only"> — dalil fayli, yangi oynada ochiladi</span>
          </a>
        </li>
      )}
      {external && (
        <li className="max-w-full min-w-0">
          <a
            href={external.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={linkClass}
            title={external.href}
          >
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">{external.hostname.replace(/^www\./, '')}</span>
            <span className="sr-only"> — tashqi havola, yangi oynada ochiladi</span>
          </a>
        </li>
      )}
    </ul>
  );
}

/**
 * Yozuvning qisqa tavsifi: tur, bosqich, sana, natija, fan, tashkilot. Tur va bosqich
 * nishon (badge) sifatida alohida ko‘rsatilgan bo‘lsa, `withTypeAndLevel={false}`.
 */
export function PortfolioMeta({
  item,
  className,
  withTypeAndLevel = true,
}: {
  item: PortfolioItemView;
  className?: string;
  withTypeAndLevel?: boolean;
}) {
  const parts: { label: string; value: string | null | undefined }[] = [
    { label: 'Turi', value: withTypeAndLevel ? item.typeLabel : null },
    { label: 'Bosqich', value: withTypeAndLevel ? levelLabel(item.level) : null },
    { label: 'Sana', value: item.date ? formatDate(item.date) : null },
    // Tuzilgan turlarda natija sertifikat ma’lumotlari bilan alohida ko‘rsatiladi (DetailsView).
    { label: 'Natija', value: item.details ? null : item.result },
    { label: 'Fan', value: item.subject?.name },
    { label: 'Yo‘nalish', value: item.direction },
    { label: 'Tashkilot', value: item.organization },
  ];
  const visible = parts.filter((part) => part.value);
  if (visible.length === 0) return null;
  return (
    <dl className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm', className)}>
      {visible.map((part) => (
        <div key={part.label} className="flex min-w-0 gap-1">
          <dt className="shrink-0 text-slate-500">{part.label}:</dt>
          <dd className="min-w-0 font-medium break-words text-slate-800">{part.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Tuzatishga qaytarilgan yozuv sababi. */
export function ReturnReasonAlert({ reason, className }: { reason: string | null; className?: string }) {
  return (
    <Alert tone="warning" title="Tuzatishga qaytarildi" className={className}>
      {reason ? (
        <>
          Sabab: <span className="whitespace-pre-wrap">{reason}</span>
        </>
      ) : (
        'Sabab ko‘rsatilmagan.'
      )}
    </Alert>
  );
}

/** Ijodiy ish muallifligi (eksport va chop etishda ham saqlanadi). */
export function AuthorshipNote({ author, className }: { author: string; className?: string }) {
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs text-slate-600', className)}>
      <PenLine className="size-3.5 shrink-0 text-brand-700" aria-hidden />
      <span>
        Ijodiy ish · Muallif: <span className="font-medium text-slate-800">{author}</span>
      </span>
    </p>
  );
}
