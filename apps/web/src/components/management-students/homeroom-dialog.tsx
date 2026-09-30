'use client';

import { useMutation } from '@tanstack/react-query';
import { UserMinus } from 'lucide-react';
import { useState } from 'react';
import { TeacherSelect } from '@/components/admin/teacher-select';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { HomeroomAssignResult, ManagementClassCard, PersonWithAvatar } from '@/lib/types';
import { useRefreshStudents } from './queries';
import { classNames } from './student-bits';

export interface HomeroomTarget {
  id: string;
  name: string;
  homeroomTeacher: PersonWithAvatar | null;
}

/**
 * Sinf rahbarini tayinlash, almashtirish yoki olib tashlash. Tanlangan o‘qituvchi boshqa sinfga ham
 * rahbar bo‘lsa, ogohlantirish ko‘rsatiladi (bu ruxsat etilgan).
 */
export function HomeroomDialog({
  target,
  classes,
  onClose,
}: {
  target: HomeroomTarget | null;
  /** Joriy o‘quv yili sinflari: o‘qituvchi yana qaysi sinflarga rahbarligini aniqlash uchun. */
  classes: readonly ManagementClassCard[];
  onClose: () => void;
}) {
  if (!target) return null;
  return <HomeroomDialogOpen key={target.id} target={target} classes={classes} onClose={onClose} />;
}

function HomeroomDialogOpen({
  target,
  classes,
  onClose,
}: {
  target: HomeroomTarget;
  classes: readonly ManagementClassCard[];
  onClose: () => void;
}) {
  const toast = useToast();
  const refresh = useRefreshStudents();
  const current = target.homeroomTeacher;
  const [teacherId, setTeacherId] = useState<string | null>(current?.id ?? null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = useMutation({
    mutationFn: (next: string | null) =>
      api.put<HomeroomAssignResult>(`/management/classes/${target.id}/homeroom`, { teacherId: next }),
    onSuccess: async (result) => {
      if (result.homeroomTeacher) {
        const also = result.alsoHomeroomOf.length
          ? ` U ${classNames(result.alsoHomeroomOf)} sinfiga ham rahbar bo‘lib qoladi.`
          : '';
        toast.success(
          `${result.homeroomTeacher.fullName} ${result.name} sinf rahbari etib tayinlandi. Unga bildirishnoma yuborildi.${also}`,
        );
      } else {
        toast.success(`${result.name} sinfidan sinf rahbari olib tashlandi.`);
      }
      onClose();
      await refresh();
    },
  });

  const others = teacherId
    ? classes.filter((item) => item.id !== target.id && item.homeroomTeacher?.id === teacherId)
    : [];
  const selectedName = others[0]?.homeroomTeacher?.fullName ?? 'Tanlangan o‘qituvchi';
  const unchanged = teacherId === (current?.id ?? null);
  const close = () => {
    if (!save.isPending) onClose();
  };

  const footer = confirmRemove ? (
    <>
      <Button variant="outline" onClick={() => setConfirmRemove(false)} disabled={save.isPending}>
        Orqaga
      </Button>
      <Button variant="danger" onClick={() => save.mutate(null)} loading={save.isPending}>
        Olib tashlash
      </Button>
    </>
  ) : (
    <>
      {current && (
        <Button
          variant="ghost"
          className="text-red-700 hover:text-red-800 sm:mr-auto"
          onClick={() => {
            save.reset();
            setConfirmRemove(true);
          }}
          disabled={save.isPending}
          icon={<UserMinus className="size-4" aria-hidden />}
        >
          Olib tashlash
        </Button>
      )}
      <Button variant="outline" onClick={close} disabled={save.isPending}>
        Bekor qilish
      </Button>
      <Button onClick={() => save.mutate(teacherId)} loading={save.isPending} disabled={!teacherId || unchanged}>
        {current ? 'Saqlash' : 'Tayinlash'}
      </Button>
    </>
  );

  return (
    <Dialog
      open
      onClose={close}
      title={`${target.name} sinf rahbari`}
      description={current ? `Hozir: ${current.fullName}` : 'Hozir sinf rahbari tayinlanmagan'}
      footer={footer}
    >
      <div className="space-y-4">
        {save.isError && <Alert tone="danger">{errorMessage(save.error)}</Alert>}
        {confirmRemove && current ? (
          <Alert tone="warning" title="Sinf rahbarini olib tashlaysizmi?">
            {current.fullName} {target.name} sinfi rahbarligidan olib tashlanadi: sinf o‘quvchilarining natijalari va
            portfoliolarini tasdiqlash unga endi ochiq bo‘lmaydi. Keyin istalgan paytda yangi rahbar tayinlash mumkin.
          </Alert>
        ) : (
          <>
            <Field
              label="O‘qituvchi"
              hint="Ro‘yxatda faqat faol o‘qituvchilar. Ism yoki familiya bo‘yicha qidiring."
              required
            >
              <TeacherSelect
                value={teacherId}
                onChange={(next) => {
                  save.reset();
                  setTeacherId(next);
                }}
                current={current}
                allowEmpty={false}
                emptyLabel="— O‘qituvchini tanlang —"
                disabled={save.isPending}
              />
            </Field>
            {others.length > 0 && (
              <Alert tone="warning" title="Bu o‘qituvchi boshqa sinfga ham rahbar">
                {selectedName} hozir {classNames(others)} sinf rahbari. Bir o‘qituvchi bir nechta sinfga rahbar bo‘lishi
                mumkin — saqlasangiz, u {target.name} sinfiga ham rahbar bo‘ladi.
              </Alert>
            )}
            <p className="text-sm text-slate-600">
              Sinf rahbari o‘z sinfi o‘quvchilarining natijalarini ko‘radi va portfolio yozuvlarini tasdiqlaydi.
              Tayinlangan o‘qituvchiga bildirishnoma yuboriladi.
            </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
