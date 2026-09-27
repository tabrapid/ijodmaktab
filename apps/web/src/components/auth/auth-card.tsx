import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandLogo, SCHOOL_NAME_LINES, SCHOOL_TAGLINE } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/cn';

/**
 * Kirish sahifalari (kirish, tizim boshqaruvi, 2FA, parol almashtirish) uchun umumiy ko‘rinish:
 * katta ekranda chapda siyoh rangli maktab paneli, o‘ngda forma; telefonda bitta ustun.
 * `variant="system"` — super admin kirishi (xuddi shu uslub, lekin “Tizim boshqaruvi” belgisi bilan).
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  variant = 'school',
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'school' | 'system';
}) {
  const system = variant === 'system';
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <BrandPanel system={system} />

      <main className="flex flex-1 flex-col px-4 pt-4 pb-10 sm:px-6 lg:px-10">
        <div className="flex justify-end">
          <ThemeToggle variant="segmented" />
        </div>
        <div className="flex flex-1 items-start justify-center pt-4 sm:pt-10 lg:items-center lg:pt-0">
          <div className="w-full max-w-sm">
            <div className="mb-6">
              {system && (
                <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  Tizim boshqaruvi
                </span>
              )}
              <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-slate-900">
                {title}
              </h1>
              {description && <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-surface p-6 shadow-card sm:p-7 dark:shadow-none">
              {children}
            </div>
            {footer && <div className="mt-5 text-center text-xs leading-relaxed text-slate-500">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Maktab paneli: logotip oq taglikda, nom ikki qatorda, orqada logotipdagi quyosh nurlari. */
function BrandPanel({ system }: { system: boolean }) {
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-b-[1.75rem] bg-ink-900 text-white print:hidden lg:rounded-none',
        'lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[44%] lg:max-w-xl lg:flex-col',
      )}
    >
      {/* Bezak: pastdan chiqayotgan nurlar va iliq yog‘du (logotipdagi quyosh) */}
      <div
        aria-hidden
        className={cn(
          'rays pointer-events-none absolute inset-0 -z-10 [--rays-fade:115%] [--rays-y:118%]',
          system && '[--rays-color:color-mix(in_oklab,var(--color-ink-300)_16%,transparent)]',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -bottom-40 left-1/2 -z-10 size-[34rem] -translate-x-1/2 rounded-full blur-3xl',
          system ? 'bg-brand-500/25' : 'bg-accent-500/25',
        )}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-ink-950/60 to-transparent"
      />

      <div className="flex items-center gap-4 px-5 py-5 sm:px-8 lg:flex-1 lg:flex-col lg:items-start lg:justify-between lg:px-12 lg:py-12">
        <div className="flex min-w-0 items-center gap-4 lg:flex-col lg:items-start lg:gap-8">
          <BrandLogo size={56} plate className="lg:hidden" />
          <BrandLogo size={112} plate className="hidden lg:inline-flex" />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight font-semibold text-balance sm:text-xl lg:text-[2.6rem] lg:leading-[1.08]">
              {SCHOOL_NAME_LINES[0]}
            </p>
            <p className="mt-1 text-[11px] font-bold tracking-[0.28em] text-accent-400 uppercase lg:mt-3 lg:text-sm">
              {SCHOOL_NAME_LINES[1]}
            </p>
          </div>
        </div>

        <div className="hidden max-w-md lg:block">
          {system ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-ink-100 ring-1 ring-white/15 ring-inset">
              <ShieldCheck className="size-4 text-accent-400" aria-hidden />
              Tizim boshqaruvi
            </p>
          ) : (
            <p className="font-display text-2xl leading-snug text-ink-100 italic">“{SCHOOL_TAGLINE}”</p>
          )}
          <div aria-hidden className="mt-6 h-px w-24 bg-gradient-to-r from-accent-400 to-transparent" />
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            {system
              ? 'Tizim holati, maktab hisoblari va xavfsizlik sozlamalari. Faqat vakolatli xodimlar uchun.'
              : 'Portfolio, onlayn nazorat ishlari va ta’lim natijalari — bitta tizimda.'}
          </p>
        </div>
      </div>
    </div>
  );
}
