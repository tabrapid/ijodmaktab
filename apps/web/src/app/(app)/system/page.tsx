'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Database,
  Download,
  FileWarning,
  KeyRound,
  School,
  ScrollText,
  ServerCrash,
  ShieldAlert,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { dateToSchoolInput, formatDateTime } from '@ijod/shared';
import { AccountStats, AttentionAlerts, HealthStats, StatLink } from '@/components/admin/account-overview';
import { auditActionLabel, auditEntityLabel } from '@/components/admin/labels';
import { systemDashboardKey } from '@/components/admin/queries';
import { QuickLinks } from '@/components/admin/quick-links';
import { RequireRole } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Stat } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { SystemDashboard } from '@/lib/types';

/** Zaxira nusxa shu muddatdan eski bo‘lsa ogohlantiriladi (kundalik zaxira + zaxira vaqti). */
const BACKUP_MAX_AGE_HOURS = 26;

const LINKS = [
  {
    href: '/admin/users',
    title: 'Foydalanuvchilar va vakolatlar',
    description: 'Hisoblar, rollar, bloklar va sessiyalar',
    icon: Users,
  },
  {
    href: '/admin/structure',
    title: 'Maktab tuzilmasi',
    description: 'O‘quv yillari, sinflar, fanlar, biriktirishlar',
    icon: School,
  },
  {
    href: '/management',
    title: 'Maktab ko‘rsatkichlari',
    description: 'Rahbariyat paneli (natijalarga murojaat qayd etiladi)',
    icon: BarChart3,
  },
  {
    href: '/admin/audit',
    title: 'Audit jurnali',
    description: 'Barcha yozuvlar, jumladan kirish va xavfsizlik',
    icon: ScrollText,
  },
];

/** “3 soat oldin” ko‘rinishidagi yosh. */
function formatAge(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} daqiqa oldin`;
  if (hours < 48) return `${Math.round(hours)} soat oldin`;
  return `${Math.round(hours / 24)} kun oldin`;
}

function BackupCard({ backup }: { backup: SystemDashboard['backup'] }) {
  const ageHours = backup.lastSuccessAt ? (Date.now() - Date.parse(backup.lastSuccessAt)) / 3_600_000 : null;
  const stale = ageHours !== null && ageHours > BACKUP_MAX_AGE_HOURS;
  return (
    <Card>
      <CardHeader title="Zaxira nusxalar" />
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          <span
            className={
              !backup.configured || ageHours === null || stale
                ? 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700'
                : 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700'
            }
          >
            <Database className="size-5" aria-hidden />
          </span>
          <div className="text-sm">
            <p className="text-slate-500">Oxirgi muvaffaqiyatli zaxira</p>
            <p className="text-lg font-semibold text-slate-900 tabular">
              {backup.lastSuccessAt ? formatDateTime(backup.lastSuccessAt) : '—'}
            </p>
            {ageHours !== null && (
              <p className={stale ? 'font-medium text-red-700' : 'text-slate-500'}>{formatAge(ageHours)}</p>
            )}
          </div>
        </div>
        {!backup.configured ? (
          <Alert tone="danger" title="Zaxira holati sozlanmagan">
            Serverda zaxira skripti holat faylini yozmayapti (BACKUP_STATUS_FILE). Zaxira olinayotganini tekshiring.
          </Alert>
        ) : ageHours === null ? (
          <Alert tone="danger" title="Muvaffaqiyatli zaxira haqida ma’lumot yo‘q">
            Zaxira skripti hali muvaffaqiyatli tugamagan yoki holat fayli o‘qilmadi.
          </Alert>
        ) : stale ? (
          <Alert tone="warning" title={`Oxirgi zaxira ${BACKUP_MAX_AGE_HOURS} soatdan eski`}>
            Kundalik zaxira o‘tkazib yuborilgan bo‘lishi mumkin. Zaxira jarayonini va disk joyini tekshiring.
          </Alert>
        ) : (
          <Badge tone="green">Zaxira muntazam olinmoqda</Badge>
        )}
      </CardBody>
    </Card>
  );
}

function ServerErrors({ errors }: { errors: SystemDashboard['errors'] }) {
  return (
    <Card>
      <CardHeader
        title="So‘nggi server xatoliklari"
        description="Server xotirasidagi oxirgi 50 ta xatolik; server qayta ishga tushganda ro‘yxat tozalanadi."
      />
      {errors.length === 0 ? (
        <EmptyState icon={Activity} title="Xatolik qayd etilmagan" />
      ) : (
        <Table caption="Server xatoliklari">
          <THead>
            <tr>
              <TH>Vaqt</TH>
              <TH>So‘rov</TH>
              <TH>Xabar</TH>
            </tr>
          </THead>
          <tbody>
            {errors.map((error, index) => (
              <TR key={`${error.at}-${index}`} className="align-top">
                <TD className="whitespace-nowrap text-slate-600 tabular">{formatDateTime(error.at)}</TD>
                <TD className="font-mono text-xs whitespace-nowrap">
                  <span className="font-semibold">{error.method}</span> {error.path}
                </TD>
                <TD className="min-w-64 text-xs break-words text-red-800">{error.message}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function RecentAudit({ items }: { items: SystemDashboard['recentAudit'] }) {
  return (
    <Card>
      <CardHeader
        title="So‘nggi audit yozuvlari"
        actions={
          <Link href="/admin/audit" className="text-sm font-medium text-brand-700 hover:underline">
            Barchasi
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Yozuvlar yo‘q" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="px-5 py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-slate-900">{auditActionLabel(item.action) ?? item.action}</span>
                <span className="text-xs text-slate-500 tabular">{formatDateTime(item.createdAt)}</span>
              </div>
              <p className="text-xs text-slate-500">
                {item.actor} · <code>{item.action}</code>
                {item.entityType ? ` · ${auditEntityLabel(item.entityType)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SystemOverview() {
  const query = useQuery({
    queryKey: systemDashboardKey,
    queryFn: () => api.get<SystemDashboard | null>('/dashboard/system'),
    refetchInterval: 60_000,
  });

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  if (!data) return <EmptyState title="Ma’lumot mavjud emas" description="Tizim holati faqat super admin uchun." />;
  const { security, exports } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tizim holati"
        description="Xavfsizlik, zaxira nusxalar, xatoliklar, eksportlar va audit. Ma’lumot har daqiqada yangilanadi."
      />

      <section aria-labelledby="security-title" className="space-y-3">
        <h2 id="security-title" className="text-sm font-semibold text-slate-700">
          Xavfsizlik
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Faol sessiyalar"
            value={security.activeSessions}
            icon={<Activity className="size-4" aria-hidden />}
            hint="muddati tugamagan kirishlar"
          />
          <StatLink
            href={`/admin/audit?action=auth.login_failed&from=${encodeURIComponent(dateToSchoolInput(new Date(Date.now() - 24 * 3_600_000)))}`}
          >
            <Stat
              label="Muvaffaqiyatsiz kirishlar"
              value={security.failedLogins24h}
              tone={security.failedLogins24h >= 20 ? 'danger' : security.failedLogins24h > 0 ? 'warning' : 'default'}
              icon={<ShieldAlert className="size-4" aria-hidden />}
              hint="so‘nggi 24 soatda (bloklar bilan)"
            />
          </StatLink>
          <Stat
            label="2FA yoqilgan hisoblar"
            value={security.mfaEnabled}
            icon={<KeyRound className="size-4" aria-hidden />}
            hint="ikki bosqichli kirish"
          />
          <Stat
            label="Karantindagi fayllar"
            value={security.quarantinedFiles}
            tone={security.quarantinedFiles > 0 ? 'danger' : 'default'}
            icon={<FileWarning className="size-4" aria-hidden />}
            hint="xavfli deb topilgan yuklamalar"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <BackupCard backup={data.backup} />
        <Card>
          <CardHeader title="Eksportlar" />
          <CardBody className="grid grid-cols-2 gap-3">
            <Stat label="Tayyor fayllar" value={exports.ready} icon={<Download className="size-4" aria-hidden />} />
            <Stat
              label="Xatolik (24 soat)"
              value={exports.failed24h}
              tone={exports.failed24h > 0 ? 'danger' : 'default'}
              icon={<ServerCrash className="size-4" aria-hidden />}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tez o‘tish" />
          <QuickLinks links={LINKS} />
        </Card>
      </div>

      <ServerErrors errors={data.errors} />

      <AttentionAlerts data={data} />

      <section aria-labelledby="accounts-title" className="space-y-3">
        <h2 id="accounts-title" className="text-sm font-semibold text-slate-700">
          Foydalanuvchilar{data.academicYear ? ` · Joriy o‘quv yili: ${data.academicYear.name}` : ''}
        </h2>
        <AccountStats data={data} showSuperAdmins />
        <HealthStats data={data} />
      </section>

      <RecentAudit items={data.recentAudit} />
    </div>
  );
}

export default function SystemPage() {
  return (
    <RequireRole roles={['SUPER_ADMIN']}>
      <SystemOverview />
    </RequireRole>
  );
}
