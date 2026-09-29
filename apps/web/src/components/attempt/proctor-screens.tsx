'use client';

import {
  Clock,
  CloudUpload,
  Loader2,
  Maximize2,
  MonitorX,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { formatDuration, formatTime, type AttemptLockReason } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';

/** O‘quvchiga tushunarli sabab (o‘qituvchi uchun yorliqlar @ijod/shared da). */
const STUDENT_REASON: Record<AttemptLockReason, string> = {
  FULLSCREEN_EXIT: 'To‘liq ekrandan chiqish',
  PAGE_HIDDEN: 'Boshqa oyna, tab yoki ilovaga o‘tish',
};

const LOCK_MESSAGE: Record<AttemptLockReason, string> = {
  FULLSCREEN_EXIT:
    'Siz to‘liq ekrandan chiqdingiz. Test to‘xtatildi. O‘qituvchingiz ruxsat bergandan so‘ng davom ettirasiz.',
  PAGE_HIDDEN:
    'Siz test sahifasidan chiqdingiz (boshqa oyna, tab yoki ilovaga o‘tdingiz). Test to‘xtatildi. O‘qituvchingiz ruxsat bergandan so‘ng davom ettirasiz.',
};

function Panel({
  tone,
  icon,
  titleId,
  children,
}: {
  tone: 'brand' | 'red' | 'emerald';
  icon: ReactNode;
  titleId: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-2xl px-4 py-6 sm:py-10" aria-labelledby={titleId}>
      <div
        className={cn(
          'rounded-2xl border bg-surface p-5 shadow-sm sm:p-8',
          tone === 'red' ? 'border-red-200' : tone === 'emerald' ? 'border-emerald-200' : 'border-slate-200',
        )}
      >
        <span
          className={cn(
            'flex size-12 items-center justify-center rounded-full',
            tone === 'red'
              ? 'bg-red-50 text-red-700'
              : tone === 'emerald'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-brand-50 text-brand-700',
          )}
          aria-hidden
        >
          {icon}
        </span>
        {children}
      </div>
    </section>
  );
}

function Rule({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-brand-700" aria-hidden>
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** To‘liq ekranga o‘tishdan oldingi sahifa: savollar yashirin, qoidalar va bitta katta tugma. */
export function FullscreenGate({ onStart, failed }: { onStart: () => void; failed: boolean }) {
  return (
    <Panel tone="brand" icon={<Maximize2 className="size-6" />} titleId="gate-title">
      <h1 id="gate-title" className="mt-4 font-display text-xl font-semibold text-slate-900">
        Test to‘liq ekranda ishlanadi
      </h1>
      <p className="mt-1 text-sm text-slate-600">Savollar to‘liq ekran rejimiga o‘tganingizdan so‘ng ko‘rinadi.</p>
      <ul className="mt-5 space-y-3 text-sm text-slate-700">
        <Rule icon={<MonitorX className="size-4" />}>
          To‘liq ekrandan chiqsangiz (Esc yoki F11 tugmasi), boshqa oyna, tab yoki ilovaga o‘tsangiz, sahifani
          yangilasangiz, yopsangiz yoki qurilma ekranini o‘chirsangiz — test <strong>avtomatik to‘xtatiladi</strong>.
        </Rule>
        <Rule icon={<ShieldCheck className="size-4" />}>
          To‘xtatilgan test faqat o‘qituvchi ruxsati bilan davom etadi.
        </Rule>
        <Rule icon={<Clock className="size-4" />}>
          Test to‘xtatilganda ham vaqt to‘xtamaydi — shuning uchun test tugaguncha shu sahifada qoling.
        </Rule>
        <Rule icon={<CloudUpload className="size-4" />}>Javoblaringiz avtomatik saqlanadi.</Rule>
      </ul>
      {failed && (
        <Alert tone="danger" title="To‘liq ekranga o‘tib bo‘lmadi" className="mt-5">
          Brauzer ruxsat bermadi. Tugmani qayta bosing. Test ilova ichidagi brauzerda (masalan, Telegram’da) ochilgan
          bo‘lsa, havolani Chrome yoki Safari’da oching. Muammo takrorlansa, o‘qituvchingizga murojaat qiling.
        </Alert>
      )}
      <Button
        size="lg"
        className="mt-6 w-full sm:w-auto"
        icon={failed ? <RefreshCw className="size-5" /> : <Maximize2 className="size-5" />}
        onClick={onStart}
        autoFocus
      >
        To‘liq ekranda boshlash
      </Button>
    </Panel>
  );
}

/** To‘xtatilgan test: savollar yashirin, o‘qituvchi ruxsatini kutish. */
export function LockedScreen({
  reason,
  lockedAt,
  remainingMs,
  pending,
}: {
  reason: AttemptLockReason;
  lockedAt: number | null;
  remainingMs: number;
  pending: number;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Ekran o‘quvchilari uchun fokus darhol xabarga o‘tadi.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <Panel tone="red" icon={<ShieldAlert className="size-6" />} titleId="locked-title">
      <h1
        id="locked-title"
        ref={heading}
        tabIndex={-1}
        className="mt-4 font-display text-xl font-semibold text-red-700 outline-none"
      >
        Test to‘xtatildi
      </h1>
      {/* Faqat xabar e’lon qilinadi: har soniyada o‘zgaruvchi qolgan vaqt jonli hududga kirmaydi. */}
      <p className="mt-2 text-base leading-relaxed text-slate-800" role="alert">
        {LOCK_MESSAGE[reason]}
      </p>
      <dl className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-500">Sabab</dt>
          <dd className="font-medium text-slate-900">{STUDENT_REASON[reason]}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">To‘xtatilgan vaqt</dt>
          <dd className="font-medium text-slate-900 tabular">{lockedAt ? formatTime(new Date(lockedAt)) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Qolgan vaqt</dt>
          <dd className={cn('font-medium tabular', remainingMs <= 60_000 ? 'text-red-700' : 'text-slate-900')}>
            {formatDuration(remainingMs / 1000)}
          </dd>
        </div>
      </dl>
      <p className="mt-5 flex items-center gap-2 text-sm text-slate-700">
        <Loader2 className="size-4 shrink-0 animate-spin text-brand-700" aria-hidden />
        O‘qituvchi ruxsatini kutmoqdamiz. Sahifani yopmang va yangilamang.
      </p>
      <Alert tone="warning" className="mt-4">
        Vaqt to‘xtamaydi. O‘qituvchingizga darhol murojaat qiling — kerak bo‘lsa, u qo‘shimcha vaqt beradi. Vaqt tugasa,
        saqlangan javoblaringiz baholanadi.
      </Alert>
      {pending > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          {pending} ta javobingiz qurilmada saqlanib turibdi — ruxsat berilgach serverga yuboriladi.
        </p>
      )}
    </Panel>
  );
}

/** O‘qituvchi ruxsat berdi: to‘liq ekranga qaytish uchun foydalanuvchi bosishi shart (brauzer talabi). */
export function UnlockedScreen({
  addedMinutes,
  needsFullscreen,
  relockWarning,
  failed,
  onResume,
}: {
  addedMinutes: number;
  needsFullscreen: boolean;
  /** Nazorat hali yoqilgan: yana chiqilsa test qayta to‘xtaydi (o‘qituvchi o‘chirgan bo‘lsa — yo‘q). */
  relockWarning: boolean;
  failed: boolean;
  onResume: () => void;
}) {
  return (
    <Panel tone="emerald" icon={<ShieldCheck className="size-6" />} titleId="unlocked-title">
      <h1
        id="unlocked-title"
        className="mt-4 font-display text-xl font-semibold text-emerald-700"
        aria-live="assertive"
      >
        O‘qituvchi ruxsat berdi
      </h1>
      <p className="mt-2 text-base text-slate-800">
        {needsFullscreen
          ? '“Davom etish” tugmasini bosing — test yana to‘liq ekranda ochiladi.'
          : '“Davom etish” tugmasini bosing.'}
      </p>
      {addedMinutes > 0 && (
        <Alert tone="success" className="mt-4">
          <span className="inline-flex items-center gap-1.5">
            <TimerReset className="size-4" aria-hidden />
            Sizga qo‘shimcha {addedMinutes} daqiqa berildi.
          </span>
        </Alert>
      )}
      {relockWarning ? (
        <p className="mt-4 text-sm text-slate-600">
          Eslatma: to‘liq ekrandan yana chiqsangiz yoki boshqa oynaga o‘tsangiz, test qayta to‘xtatiladi.
        </p>
      ) : (
        <p className="mt-4 text-sm text-slate-600">
          O‘qituvchi to‘liq ekran nazoratini o‘chirdi — test endi to‘xtatilmaydi.
        </p>
      )}
      {failed && (
        <Alert tone="danger" title="To‘liq ekranga o‘tib bo‘lmadi" className="mt-4">
          Brauzer ruxsat bermadi. Tugmani qayta bosing.
        </Alert>
      )}
      <Button size="lg" className="mt-6 w-full sm:w-auto" onClick={onResume} autoFocus>
        Davom etish
      </Button>
    </Panel>
  );
}
