'use client';

import { ArrowRight, IdCard } from 'lucide-react';
import { TEACHER_CATEGORY_LABELS } from '@ijod/shared';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { useOwnReference } from './queries';
import { categoryStatus } from './utils';

/** “Mening hisobim” sahifasidagi o‘qituvchi ma’lumotnomasi kartasi: qisqa holat va havola. */
export function TeacherReferenceLinkCard() {
  const reference = useOwnReference();
  const data = reference.data;
  const status = data ? categoryStatus(data.profile.category, data.profile.categoryAwardedOn) : null;
  const mentorships = data ? data.mentorships.national.length + data.mentorships.international.length : 0;
  const facts = data
    ? [
        data.specialtySubject ? `Mutaxassislik: ${data.specialtySubject.name}` : 'Mutaxassislik fani belgilanmagan',
        TEACHER_CATEGORY_LABELS[data.profile.category],
        `${data.credentials.length} ta hujjat`,
        `${mentorships} ta ustozlik`,
      ]
    : [];

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"
          aria-hidden
        >
          <IdCard className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-slate-900">Ma’lumotnoma</p>
          <p className="text-sm text-slate-500">
            Ta’limingiz, ilmiy daraja, malaka toifasi, sertifikatlar va o‘quvchilaringiz sertifikatlariga ustozlik —
            rahbariyat ko‘radigan yagona ma’lumotnoma.
          </p>
          {facts.length > 0 && <p className="text-xs text-slate-600">{facts.join(' · ')}</p>}
          {status?.expired && <p className="text-xs font-medium text-amber-700">Malaka toifasi muddati tugagan.</p>}
          {status?.expiresSoon && (
            <p className="text-xs font-medium text-amber-700">Malaka toifasi muddati tugashiga oz qoldi.</p>
          )}
        </div>
        <ButtonLink href="/profile/malumotnoma" variant="outline" className="self-start sm:self-auto">
          Ma’lumotnomani ochish
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </CardBody>
    </Card>
  );
}
