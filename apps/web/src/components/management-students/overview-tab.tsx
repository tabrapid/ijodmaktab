'use client';

import { FolderHeart, GraduationCap, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { REGISTRATION_SOURCE_LABELS, formatDate, formatDateTime, schoolToday } from '@ijod/shared';
import { InfoList } from '@/components/admin/info-list';
import { endReasonLabel } from '@/components/admin/labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import type { ManagementStudentProfile } from '@/lib/types';
import { classHref } from './class-cards';
import { IdentityDialog } from './identity-dialog';
import { PinflValue } from './pinfl-value';

/** To‘liq yosh (Toshkent vaqti bo‘yicha bugungi sanaga). */
function ageOf(birthDate: string, today = schoolToday()) {
  const [year, month, day] = birthDate.split('-').map(Number) as [number, number, number];
  const [nowYear, nowMonth, nowDay] = today.split('-').map(Number) as [number, number, number];
  return nowYear - year - (nowMonth < month || (nowMonth === month && nowDay < day) ? 1 : 0);
}

/** “Umumiy” yorlig‘i: hujjatdagi shaxsiy ma’lumotlar, ro‘yxatdan o‘tish, sinflar tarixi va portfolio qisqacha. */
export function OverviewTab({
  profile,
  onOpenPortfolio,
}: {
  profile: ManagementStudentProfile;
  onOpenPortfolio: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // Tahrirlashdan keyin ochib qo‘yilgan (eski) JSHSHIR ko‘rinib qolmasligi uchun maydon qayta yaratiladi.
  const [edits, setEdits] = useState(0);
  const birth = profile.birthDate
    ? `${formatDate(profile.birthDate)} (${ageOf(profile.birthDate)} yosh)`
    : 'Kiritilmagan';

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <Card>
          <CardHeader
            title="Hujjat bo‘yicha ma’lumotlar"
            description="ID-karta yoki tug‘ilganlik haqidagi guvohnomadagidek"
            actions={
              profile.manageable ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  icon={<Pencil className="size-4" aria-hidden />}
                >
                  Tahrirlash
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            <InfoList
              items={[
                { label: 'Familiya', value: profile.lastName },
                { label: 'Ism', value: profile.firstName },
                { label: 'Otasining ismi', value: profile.middleName ?? '—' },
                {
                  label: 'Tug‘ilgan sana',
                  value: <span className={profile.birthDate ? 'tabular' : 'font-normal text-slate-500'}>{birth}</span>,
                },
                {
                  label: 'JSHSHIR',
                  value: (
                    <PinflValue
                      key={edits}
                      studentId={profile.id}
                      masked={profile.pinflMasked}
                      hasPinfl={profile.hasPinfl}
                    />
                  ),
                },
              ]}
            />
            {profile.hasPinfl && (
              <p className="mt-3 text-xs text-slate-500">
                JSHSHIRni to‘liq ko‘rish audit jurnalida qayd etiladi. Raqam hech qayerda ochiq saqlanmaydi.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Sinflar tarixi"
            description={
              profile.currentClass
                ? `Hozirgi sinf: ${profile.currentClass.name}`
                : 'Joriy o‘quv yilida sinfga biriktirilmagan'
            }
          />
          {profile.enrollments.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="A’zolik tarixi yo‘q"
              description="O‘quvchi hali hech bir sinfga biriktirilmagan. “Hisob” yorlig‘ida sinfga biriktirish mumkin."
            />
          ) : (
            <Table caption="Sinflar tarixi">
              <THead>
                <tr>
                  <TH>Sinf</TH>
                  <TH>O‘quv yili</TH>
                  <TH>Boshlangan</TH>
                  <TH>Tugagan</TH>
                  <TH>Sabab</TH>
                </tr>
              </THead>
              <tbody>
                {profile.enrollments.map((item) => (
                  <TR key={item.id}>
                    <TD className="whitespace-nowrap">
                      <Link href={classHref(item.classId)} className="font-medium text-brand-700 hover:underline">
                        {item.className}
                      </Link>
                      {item.endsOn === null && (
                        <Badge tone="green" className="ml-2">
                          Hozirgi
                        </Badge>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{item.academicYear}</TD>
                    <TD className="whitespace-nowrap tabular">{formatDate(item.startsOn)}</TD>
                    <TD className="whitespace-nowrap tabular">{item.endsOn ? formatDate(item.endsOn) : '—'}</TD>
                    <TD>{endReasonLabel(item.endReason)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader title="Ro‘yxatdan o‘tish" />
          <CardBody>
            <InfoList
              items={[
                { label: 'Hisob', value: REGISTRATION_SOURCE_LABELS[profile.registrationSource] },
                { label: 'Sana', value: <span className="tabular">{formatDateTime(profile.createdAt)}</span> },
                { label: 'Login', value: <span className="font-mono break-all">{profile.login}</span> },
                {
                  label: 'Oxirgi kirish',
                  value: profile.lastLoginAt ? (
                    <span className="tabular">{formatDateTime(profile.lastLoginAt)}</span>
                  ) : (
                    <span className="font-normal text-slate-500">Hali kirmagan</span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Portfolio"
            actions={
              <Button
                size="sm"
                variant="ghost"
                onClick={onOpenPortfolio}
                icon={<FolderHeart className="size-4" aria-hidden />}
              >
                Ochish
              </Button>
            }
          />
          <CardBody>
            <InfoList
              items={[
                {
                  label: 'Tasdiqlangan yutuqlar',
                  value: <span className="tabular">{profile.portfolio.approved}</span>,
                },
                {
                  label: 'Shundan sertifikatlar',
                  value: <span className="tabular">{profile.portfolio.certificates}</span>,
                },
                {
                  label: 'Tekshiruvni kutmoqda',
                  value: (
                    <span className={profile.portfolio.pending ? 'text-amber-700 tabular' : 'tabular'}>
                      {profile.portfolio.pending}
                    </span>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {editing && (
        <IdentityDialog
          profile={profile}
          onClose={() => {
            setEditing(false);
            setEdits((count) => count + 1);
          }}
        />
      )}
    </div>
  );
}
