'use client';

import { Check, Download, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ROLE_LABELS, formatInternalId } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { downloadBase64 } from '@/lib/api';
import type { ImportCommitResult } from '@/lib/types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 3-bosqich: yaratilgan hisoblar va kirish ma’lumotlari fayli (faqat shu sahifada, bir marta). */
export function ImportResult({ result, onRestart }: { result: ImportCommitResult; onRestart: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [downloaded, setDownloaded] = useState(false);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const saved = downloaded || result.createdCount === 0;
  /** Fayl yuklab olinmagan bo‘lsa, sahifadan chiqishdan oldin so‘raladi. */
  const leave = (action: () => void) => (saved ? action() : setLeaving(() => action));

  // Fayl yuklab olinmaguncha sahifani yopish yoki yangilashdan oldin ogohlantiriladi.
  useEffect(() => {
    if (saved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saved]);

  const download = () => {
    try {
      downloadBase64(result.credentialsXlsxBase64, result.credentialsFileName, XLSX_MIME);
      setDownloaded(true);
    } catch {
      toast.error('Faylni saqlab bo‘lmadi. Qayta urinib ko‘ring.');
    }
  };

  return (
    <div className="space-y-6">
      <Alert tone="success" title={`${result.createdCount} ta hisob yaratildi`}>
        {result.errorCount > 0 || result.skippedCount > 0
          ? `Import qilinmadi: ${result.errorCount} ta xato qator, ${result.skippedCount} ta o‘tkazib yuborilgan qator.`
          : 'Barcha qatorlar muvaffaqiyatli import qilindi.'}
      </Alert>

      {result.createdCount > 0 && (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardBody className="space-y-4">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-6 shrink-0 text-amber-700" aria-hidden />
              <div className="space-y-1 text-sm text-amber-900">
                <p className="font-semibold">Kirish ma’lumotlarini hozir yuklab oling</p>
                <p>
                  Faylda yangi hisoblarning loginlari va vaqtinchalik parollari bor. U faqat hozir mavjud — sahifadan
                  chiqsangiz, qayta yuklab bo‘lmaydi (parollarni qayta tiklashga to‘g‘ri keladi). Parollarni tarqatgach
                  faylni o‘chirib tashlang.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={download} icon={<Download className="size-5" aria-hidden />}>
                Kirish ma’lumotlarini yuklab olish (Excel)
              </Button>
              {downloaded && (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700" role="status">
                  <Check className="size-4" aria-hidden /> Fayl yuklab olindi
                </span>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Yaratilgan hisoblar"
          description="Parollar bu jadvalda ko‘rsatilmaydi."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => leave(onRestart)}>
                Yangi import
              </Button>
              <Button size="sm" variant="secondary" onClick={() => leave(() => router.push('/admin/users'))}>
                Foydalanuvchilar ro‘yxati
              </Button>
            </>
          }
        />
        {result.created.length === 0 ? (
          <EmptyState title="Hech qanday hisob yaratilmadi" />
        ) : (
          <Table caption="Yaratilgan hisoblar">
            <THead>
              <tr>
                <TH>Qator</TH>
                <TH>Ichki ID</TH>
                <TH>F.I.Sh.</TH>
                <TH>Rol</TH>
                <TH>Sinf</TH>
                <TH>Login</TH>
              </tr>
            </THead>
            <tbody>
              {result.created.map((item) => (
                <TR key={item.id}>
                  <TD className="text-slate-500 tabular">{item.rowNumber}</TD>
                  <TD className="font-mono text-xs tabular">{formatInternalId(item.internalId)}</TD>
                  <TD className="min-w-48 font-medium text-slate-900">
                    {saved ? (
                      <Link href={`/admin/users/${item.id}`} className="hover:text-brand-700 hover:underline">
                        {item.fullName}
                      </Link>
                    ) : (
                      item.fullName
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">{ROLE_LABELS[item.role]}</TD>
                  <TD className="whitespace-nowrap">{item.className ?? '—'}</TD>
                  <TD className="font-mono text-xs whitespace-nowrap">{item.login}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        onConfirm={() => {
          const action = leaving;
          setLeaving(null);
          action?.();
        }}
        title="Fayl hali yuklab olinmadi"
        confirmLabel="Baribir chiqish"
        tone="danger"
      >
        Kirish ma’lumotlari (vaqtinchalik parollar) fayli hali saqlanmadi. Sahifadan chiqsangiz, u yo‘qoladi va
        parollarni bittalab qayta tiklashga to‘g‘ri keladi.
      </ConfirmDialog>
    </div>
  );
}
