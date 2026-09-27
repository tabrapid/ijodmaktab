import { cn } from '@/lib/cn';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-xl',
  xl: 'size-24 text-3xl',
} as const;

/** Ism va familiyadan bosh harflar: “Karimova Dilnoza” → “KD”. */
export function initialsOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
}

/**
 * Profil rasmi; rasm bo‘lmasa bosh harflar ko‘rsatiladi. `src` — API qaytargan manzil
 * (masalan, `/api/files/<id>`), rasm yuklanmasa ham bosh harflar qoladi.
 */
export function Avatar({
  name,
  src,
  size = 'md',
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-800 ring-2 ring-surface select-none',
        SIZES[size],
        className,
      )}
      aria-hidden={src ? undefined : true}
    >
      <span>{initialsOf(name)}</span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- yopiq API fayli, next/image optimallashtirishi kerak emas
        <img src={src} alt={name} className="absolute inset-0 size-full object-cover" loading="lazy" />
      )}
    </span>
  );
}
