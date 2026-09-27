'use client';

import { Check, Copy, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
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
        copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />
      }
    >
      <span aria-live="polite">{copied ? 'Nusxalandi' : label}</span>
    </Button>
  );
}

/**
 * Vaqtinchalik parol faqat bir marta ko‘rsatiladi: yangi hisob yaratilganda yoki parol tiklanganda.
 */
export function TemporaryPasswordDialog({
  open,
  onClose,
  fullName,
  login,
  password,
  reason,
  profileHref,
}: {
  open: boolean;
  onClose: () => void;
  fullName: string;
  login: string;
  password: string;
  reason: 'created' | 'reset';
  profileHref?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={reason === 'created' ? 'Hisob yaratildi' : 'Parol tiklandi'}
      description={fullName}
      footer={
        <>
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
          Oynani yopgach uni qayta ko‘rib bo‘lmaydi. Parolni foydalanuvchiga shaxsan yoki xavfsiz yo‘l bilan yetkazing.
        </Alert>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Login</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm break-all text-slate-900">
                {login}
              </code>
              <CopyButton text={login} label="Loginni nusxalash" />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Vaqtinchalik parol</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="inline-flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 font-mono text-lg font-semibold tracking-wider break-all text-brand-800">
                <KeyRound className="size-4 shrink-0" aria-hidden />
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
    </Dialog>
  );
}
