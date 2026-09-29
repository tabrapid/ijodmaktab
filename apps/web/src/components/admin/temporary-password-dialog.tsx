'use client';

import { Check, Copy, KeyRound, Printer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ROLE_LABELS, formatDate, type Role } from '@ijod/shared';
import { BrandLogo, SCHOOL_NAME } from '@/components/brand-logo';
import { Button, ButtonLink } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';

/** Matnni almashish buferiga nusxalaydi (xavfsiz bo‘lmagan http manzilda ham ishlaydi). */
async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('copy failed');
}

export function CopyButton({
  text,
  label = 'Nusxalash',
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const onCopy = async () => {
    try {
      await copyText(text);
      setCopied(true);
    } catch {
      toast.error('Nusxalab bo‘lmadi. Matnni belgilab, qo‘lda nusxalang.');
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onCopy}
      className={className}
      icon={
        copied ? <Check className="size-4 text-emerald-700" aria-hidden /> : <Copy className="size-4" aria-hidden />
      }
    >
      <span aria-live="polite">{copied ? 'Nusxalandi' : label}</span>
    </Button>
  );
}

/** Chop etishda faqat kirish varaqasi qoladi (sahifaning qolgan qismi va oyna yashiriladi). */
const PRINT_CSS =
  '@media print { body > :not([data-credentials-slip]), dialog { display: none !important; } @page { margin: 15mm; } }';

/** Rollar va (o‘quvchi uchun) sinf: “O‘quvchi · 9-A sinf”. */
export function accountRoleLabel(roles: readonly Role[], className?: string | null) {
  const label = roles.map((role) => ROLE_LABELS[role]).join(', ');
  return className ? `${label} · ${className} sinf` : label;
}

/**
 * Kirish ma’lumotlari varaqasi (faqat chop etishda ko‘rinadi): direktor o‘rinbosari yoki
 * administrator uni chop etib, foydalanuvchiga qo‘lda beradi.
 */
function CredentialsSlip({
  fullName,
  roleLabel,
  login,
  password,
}: {
  fullName: string;
  roleLabel?: string;
  login: string;
  password: string;
}) {
  if (typeof document === 'undefined') return null;
  const rows: [string, ReactNode][] = [
    ['F.I.Sh.', <span className="font-semibold">{fullName}</span>],
    ...(roleLabel ? ([['Rol', roleLabel]] as [string, ReactNode][]) : []),
    ['Login', <span className="font-mono text-xl font-bold">{login}</span>],
    ['Vaqtinchalik parol', <span className="font-mono text-xl font-bold tracking-wider">{password}</span>],
    ['Kirish manzili', <span className="break-all">{`${window.location.origin}/login`}</span>],
  ];
  return createPortal(
    <div data-credentials-slip className="hidden print:block print:text-black">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto max-w-[150mm] break-inside-avoid rounded-lg border-2 border-dashed border-current p-6">
        <div className="flex items-center gap-4 border-b border-current pb-4">
          <BrandLogo size={64} />
          <div>
            <p className="text-lg leading-tight font-bold">{SCHOOL_NAME}</p>
            <p className="mt-1 text-sm">Elektron tizimga kirish ma’lumotlari</p>
          </div>
        </div>
        <dl className="mt-4 space-y-2 text-base">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-wrap items-baseline gap-x-3">
              <dt className="w-44 shrink-0">{label}:</dt>
              <dd className="min-w-0">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 border-t border-current pt-3 text-sm">
          <p className="text-base font-bold">Birinchi kirishda parolni almashtiring.</p>
          <p className="mt-1">
            Tizim birinchi kirishda o‘zingiz o‘ylab topgan yangi parolni so‘raydi. Yangi parolni hech kimga aytmang.
          </p>
          <p className="mt-3">Berilgan sana: {formatDate(new Date())}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Vaqtinchalik parol faqat bir marta ko‘rsatiladi: yangi hisob yaratilganda yoki parol tiklanganda.
 * Login va parol katta harflarda ko‘rsatiladi (og‘zaki aytib berish oson) va chop etiladigan varaqa bor.
 */
export function TemporaryPasswordDialog({
  open,
  onClose,
  fullName,
  login,
  password,
  reason,
  profileHref,
  roleLabel,
}: {
  open: boolean;
  onClose: () => void;
  fullName: string;
  login: string;
  password: string;
  reason: 'created' | 'reset';
  profileHref?: string;
  /** Varaqada ko‘rsatiladigan rol (va sinf), masalan `accountRoleLabel(user.roles, "9-A")`. */
  roleLabel?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={reason === 'created' ? 'Hisob yaratildi' : 'Parol tiklandi'}
      description={roleLabel ? `${fullName} · ${roleLabel}` : fullName}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => window.print()}
            icon={<Printer className="size-4" aria-hidden />}
            className="sm:mr-auto"
          >
            Chop etish
          </Button>
          {profileHref && (
            <ButtonLink href={profileHref} variant="outline" onClick={onClose}>
              Profilni ochish
            </ButtonLink>
          )}
          <Button onClick={onClose}>Tushunarli, yopish</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning" title="Parol faqat hozir ko‘rsatiladi">
          Oynani yopgach uni qayta ko‘rib bo‘lmaydi. Parolni foydalanuvchiga shaxsan ayting yoki kirish varaqasini chop
          etib bering.
        </Alert>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-slate-500">Login</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-lg font-semibold break-all text-slate-900">
                {login}
              </code>
              <CopyButton text={login} label="Loginni nusxalash" />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Vaqtinchalik parol</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="inline-flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 font-mono text-2xl font-semibold tracking-wider break-all text-brand-800">
                <KeyRound className="size-5 shrink-0" aria-hidden />
                {password}
              </code>
              <CopyButton text={password} label="Parolni nusxalash" />
            </dd>
          </div>
        </dl>
        <p className="text-sm text-slate-600">
          Birinchi kirishda foydalanuvchi vaqtinchalik parolni o‘zining yangi paroliga almashtirishi shart.
          {reason === 'reset' && ' Hisobning barcha faol sessiyalari yakunlandi.'}
        </p>
        <CopyButton
          text={`Login: ${login}\nParol: ${password}`}
          label="Login va parolni birga nusxalash"
          className="w-full sm:w-auto"
        />
      </div>
      {open && <CredentialsSlip fullName={fullName} roleLabel={roleLabel} login={login} password={password} />}
    </Dialog>
  );
}
