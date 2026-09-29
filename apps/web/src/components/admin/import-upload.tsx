'use client';

import { useMutation } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useId, useState, type ChangeEvent, type DragEvent } from 'react';
import { buttonClass } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { TD, TH, THead, Table } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { ImportPreview } from '@/lib/types';

const MAX_BYTES = 5 * 1024 * 1024;

const SAMPLE_ROWS = [
  ['Karimova Zebo Anvarovna', 'o‘quvchi', '9-A', ''],
  ['Toshmatov Sardor Ilhomovich', 'o‘quvchi', '9-A', 'sardor.t'],
  ['Rahimova Dilnoza Rustamovna', 'o‘qituvchi', '', ''],
];

/** 1-bosqich: talablar bilan tanishtirish va .xlsx faylni yuklash. */
export function ImportUpload({ onUploaded }: { onUploaded: (preview: ImportPreview) => void }) {
  const inputId = useId();
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const upload = useMutation({
    mutationFn: (file: File) => api.upload<ImportPreview>('/users/import', file),
    onSuccess: onUploaded,
  });

  const accept = (file: File | undefined) => {
    setLocalError(null);
    upload.reset();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setLocalError(
        'Faqat Excel (.xlsx) fayli qabul qilinadi. Eski .xls faylni Excel’da “.xlsx” sifatida qayta saqlang.',
      );
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError('Fayl hajmi 5 MB dan oshmasligi kerak.');
      return;
    }
    upload.mutate(file);
  };
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    accept(event.target.files?.[0]);
    event.target.value = '';
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!upload.isPending) accept(event.dataTransfer.files[0]);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader
          title="Fayl qanday bo‘lishi kerak"
          description="Birinchi qator — ustun sarlavhalari. Faqat birinchi varaq o‘qiladi."
        />
        <CardBody className="space-y-4 text-sm text-slate-700">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-slate-900">F.I.Sh.</span> — bitta ustunda (“Familiya Ism Otasining
              ismi”) yoki alohida ustunlarda: <span className="font-medium text-slate-900">Familiya</span>,{' '}
              <span className="font-medium text-slate-900">Ism</span>,{' '}
              <span className="font-medium text-slate-900">Otasining ismi</span>.
            </li>
            <li>
              <span className="font-medium text-slate-900">Rol</span> — “o‘quvchi” yoki “o‘qituvchi”. Ustun bo‘lmasa
              yoki katak bo‘sh bo‘lsa, keyingi bosqichda tanlangan standart rol qo‘llanadi.
            </li>
            <li>
              <span className="font-medium text-slate-900">Sinf</span> — masalan, 9-A (joriy o‘quv yilida mavjud sinf,
              faqat o‘quvchilar uchun).
            </li>
            <li>
              <span className="font-medium text-slate-900">Login</span> — ixtiyoriy. Bo‘sh bo‘lsa, ism-familiyadan
              avtomatik yaratiladi.
            </li>
          </ul>
          <Table caption="Namuna">
            <THead>
              <tr>
                <TH>F.I.Sh.</TH>
                <TH>Rol</TH>
                <TH>Sinf</TH>
                <TH>Login</TH>
              </tr>
            </THead>
            <tbody>
              {SAMPLE_ROWS.map((row) => (
                <tr key={row[0]} className="border-b border-slate-100 last:border-0">
                  {row.map((cell, index) => (
                    <TD key={index} className="whitespace-nowrap">
                      {cell || <span className="text-slate-400">—</span>}
                    </TD>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-xs text-slate-500">
            Bir martada ko‘pi bilan 2000 qator va 5 MB. Ustunlar nomi boshqacha bo‘lsa ham keyingi bosqichda qo‘lda
            moslashtirish mumkin.
          </p>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Faylni yuklash" />
        <CardBody className="space-y-3">
          <input
            id={inputId}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="peer sr-only"
            onChange={onChange}
            disabled={upload.isPending}
          />
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--focus-ring)',
              dragging
                ? 'border-brand-400 bg-brand-50'
                : 'border-slate-300 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40',
              upload.isPending && 'pointer-events-none opacity-70',
            )}
          >
            {upload.isPending ? (
              <Spinner className="size-6 text-brand-700" label="Fayl tekshirilmoqda…" />
            ) : (
              <>
                <FileSpreadsheet className="size-10 text-emerald-700" aria-hidden />
                <span className="font-medium text-slate-900">Excel faylni tanlang</span>
                <span className="text-xs text-slate-500">yoki shu yerga sudrab tashlang (.xlsx)</span>
                <span className={buttonClass('primary', 'md', 'mt-2')}>
                  <Upload className="size-4" aria-hidden />
                  Fayl tanlash
                </span>
              </>
            )}
          </label>
          {(localError || upload.isError) && (
            <Alert tone="danger" title="Faylni qabul qilib bo‘lmadi">
              {localError ?? errorMessage(upload.error)}
            </Alert>
          )}
          <p className="text-xs text-slate-500">
            Fayl yuklangach hech narsa yaratilmaydi: avval natijani ko‘rib chiqasiz va tasdiqlaysiz.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
