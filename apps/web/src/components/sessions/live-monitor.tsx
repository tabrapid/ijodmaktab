'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, MonitorSmartphone, Plus, UserMinus, WifiOff, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SUBMIT_SOURCE_LABELS, formatDuration, formatInternalId, formatTime } from '@ijod/shared';
import { ParticipationBadge } from '@/components/status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { ProgressBar } from '@/components/ui/stat';
import { TD, TH, THead, TR, Table } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { ClassDetail, ClassListItem, LiveRow, LiveView, SessionDetail } from '@/lib/types';
import { sessionKey } from './use-session';

type RowFilter = 'all' | 'IN_PROGRESS' | 'NOT_STARTED' | 'FINISHED' | 'ISSUE' | 'CANCELLED';

const FINISHED = new Set(['SUBMITTED', 'EXPIRED', 'UNDER_REVIEW']);

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function ago(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} soniya oldin`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  return `${Math.round(minutes / 60)} soat oldin`;
}

function CountTile({
  label,
  value,
  active,
  onClick,
  tone,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone?: 'amber' | 'red';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-xl border bg-white p-3 text-left shadow-xs transition-colors',
        active ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <span className="block text-xs text-slate-500">{label}</span>
      <span
        className={cn(
          'mt-0.5 block text-2xl font-semibold',
          tone === 'amber' && value > 0
            ? 'text-amber-700'
            : tone === 'red' && value > 0
              ? 'text-red-700'
              : 'text-slate-900',
        )}
      >
        {value}
      </span>
    </button>
  );
}

// ------------------------------------------------------------ Dialoglar

type RowAction = { kind: 'extend' | 'cancel' | 'remove'; row: LiveRow };

function ExtendDialog({
  sessionId,
  row,
  onClose,
  onDone,
}: {
  sessionId: string;
  row: LiveRow;
  onClose: () => void;
  onDone: (view: LiveView) => void;
}) {
  const toast = useToast();
  const [minutes, setMinutes] = useState('5');
  const [reason, setReason] = useState('');
  const extend = useMutation({
    mutationFn: () =>
      api.post<LiveView>(`/sessions/${sessionId}/students/${row.studentId}/extend`, {
        minutes: Number(minutes),
        reason: reason.trim(),
      }),
    onSuccess: (view) => {
      toast.success(`${row.fullName}ga ${minutes} daqiqa qo‘shildi.`);
      onDone(view);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const valid = Number(minutes) >= 1 && Number(minutes) <= 240 && reason.trim().length >= 3;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Qo‘shimcha vaqt berish"
      description={row.fullName}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={() => extend.mutate()} loading={extend.isPending} disabled={!valid}>
            Vaqt qo‘shish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Daqiqa" required hint="1–240 daqiqa">
          <Input type="number" min={1} max={240} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </Field>
        <Field label="Sabab" required hint="Audit jurnaliga yoziladi">
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Masalan: internet uzilishi, alohida ehtiyoj"
          />
        </Field>
        {row.status === 'NOT_STARTED' && (
          <Alert tone="info">O‘quvchi hali boshlamagan: qo‘shimcha vaqt u boshlaganda hisobga olinadi.</Alert>
        )}
      </div>
    </Dialog>
  );
}

function CancelAttemptDialog({ row, onClose, onDone }: { row: LiveRow; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [allowRetake, setAllowRetake] = useState(false);
  const cancel = useMutation({
    mutationFn: () => api.post(`/attempts/${row.attemptId}/cancel`, { reason: reason.trim(), allowRetake }),
    onSuccess: () => {
      toast.success('Urinish bekor qilindi.');
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Urinishni bekor qilish"
      description={row.fullName}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Ortga
          </Button>
          <Button
            variant="danger"
            onClick={() => cancel.mutate()}
            loading={cancel.isPending}
            disabled={reason.trim().length < 3}
          >
            Bekor qilish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning">
          Bekor qilingan urinish natijalarga kirmaydi. O‘quvchiga sabab bilan bildirishnoma yuboriladi.
        </Alert>
        <Field label="Sabab" required>
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Checkbox
          checked={allowRetake}
          onChange={(event) => setAllowRetake(event.target.checked)}
          label="Qayta topshirishga ruxsat berish"
          description="Bekor qilingan urinish urinishlar limitiga kirmaydi — o‘quvchi sessiya ochiq bo‘lsa qaytadan boshlay oladi."
        />
      </div>
    </Dialog>
  );
}

function RemoveDialog({
  sessionId,
  row,
  onClose,
  onDone,
}: {
  sessionId: string;
  row: LiveRow;
  onClose: () => void;
  onDone: (view: LiveView) => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const remove = useMutation({
    mutationFn: () =>
      api.post<LiveView>(`/sessions/${sessionId}/assignments`, {
        removeStudentIds: [row.studentId],
        reason: reason.trim() || undefined,
      }),
    onSuccess: (view) => {
      toast.success(`${row.fullName} ro‘yxatdan chiqarildi.`);
      onDone(view);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Ro‘yxatdan chiqarish"
      description={row.fullName}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Ortga
          </Button>
          <Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>
            Chiqarish
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        <p>O‘quvchi bu sessiyani ko‘rmaydi va natijalar hisobiga kirmaydi. O‘zgarish tarixda saqlanadi.</p>
        <Field label="Sabab">
          <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function AddStudentsDialog({
  session,
  assigned,
  onClose,
  onDone,
}: {
  session: SessionDetail;
  assigned: Set<string>;
  onClose: () => void;
  onDone: (view: LiveView) => void;
}) {
  const toast = useToast();
  const { data: me } = useMe();
  const leadership = hasRole(me, 'DEPUTY', 'SUPER_ADMIN');
  const [classId, setClassId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const classes = useQuery({
    queryKey: ['classes', leadership ? 'all' : 'mine'],
    queryFn: () => api.get<ClassListItem[]>(`/classes?scope=${leadership ? 'all' : 'mine'}`),
    enabled: Boolean(me),
    select: (items) =>
      leadership
        ? items
        : items.filter((item) =>
            item.subjects.some((entry) => entry.isMine && entry.subject.id === session.subject.id),
          ),
  });
  const effectiveClass = classId || classes.data?.[0]?.id || '';
  const detail = useQuery({
    queryKey: ['class', effectiveClass],
    queryFn: () => api.get<ClassDetail>(`/classes/${effectiveClass}`),
    enabled: Boolean(effectiveClass),
  });
  const available = (detail.data?.students ?? []).filter(
    (student) => !assigned.has(student.id) && student.status === 'ACTIVE',
  );
  const add = useMutation({
    mutationFn: () => api.post<LiveView>(`/sessions/${session.id}/assignments`, { addStudentIds: selected }),
    onSuccess: (view) => {
      toast.success(`${selected.length} nafar o‘quvchi qo‘shildi va xabardor qilindi.`);
      onDone(view);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  return (
    <Dialog
      open
      onClose={onClose}
      title="O‘quvchi qo‘shish"
      description={`${session.subject.name} fanidan dars beriladigan sinflardan`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={selected.length === 0}>
            Qo‘shish ({selected.length})
          </Button>
        </>
      }
    >
      {classes.isPending ? (
        <PageLoader />
      ) : !classes.data?.length ? (
        <EmptyState title="Mos sinf topilmadi" />
      ) : (
        <div className="space-y-4">
          <Field label="Sinf">
            <Select value={effectiveClass} onChange={(event) => setClassId(event.target.value)}>
              {classes.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          {detail.isPending ? (
            <PageLoader />
          ) : available.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              Bu sinfning barcha o‘quvchilari allaqachon ro‘yxatda.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {available.map((student) => (
                <li key={student.id}>
                  <Checkbox
                    checked={selected.includes(student.id)}
                    onChange={() => toggle(student.id)}
                    label={student.fullName}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------ Asosiy ko‘rinish

export function LiveMonitor({ session }: { session: SessionDetail }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<RowFilter>('all');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<RowAction | null>(null);
  const [adding, setAdding] = useState(false);
  const live = useQuery({
    queryKey: ['session-live', session.id],
    queryFn: () => api.get<LiveView>(`/sessions/${session.id}/live`),
    refetchInterval: (query) => {
      const state = query.state.data?.state ?? session.state;
      return state === 'OPEN' ? 5000 : state === 'SCHEDULED' ? 15_000 : false;
    },
  });
  const now = useNow(1000);

  // Sessiya holati o‘zgarsa (masalan, vaqt tugab yopilsa), sarlavhadagi ma’lumot ham yangilanadi.
  const liveState = live.data?.state;
  useEffect(() => {
    if (liveState && liveState !== session.state)
      void queryClient.invalidateQueries({ queryKey: sessionKey(session.id) });
  }, [liveState, session.state, session.id, queryClient]);

  const offset = live.data ? new Date(live.data.serverNow).getTime() - live.dataUpdatedAt : 0;
  const serverNow = now + offset;

  const rows = useMemo(() => {
    const text = search.trim().toLocaleLowerCase('uz');
    return (live.data?.rows ?? []).filter((row) => {
      if (
        text &&
        !row.fullName.toLocaleLowerCase('uz').includes(text) &&
        !formatInternalId(row.internalId).includes(text)
      )
        return false;
      switch (filter) {
        case 'all':
          return true;
        case 'FINISHED':
          return FINISHED.has(row.status);
        case 'ISSUE':
          return row.connectionIssue;
        default:
          return row.status === filter;
      }
    });
  }, [live.data, filter, search]);

  if (live.isPending) return <PageLoader />;
  if (live.isError) return <ErrorState error={live.error} onRetry={() => live.refetch()} />;
  const { counts } = live.data;
  const setView = (view: LiveView) => {
    queryClient.setQueryData(['session-live', session.id], view);
    void queryClient.invalidateQueries({ queryKey: sessionKey(session.id) });
    setAction(null);
    setAdding(false);
  };
  const editable = session.state !== 'CANCELLED';
  // Ro‘yxatni faqat sessiya yopilguncha o‘zgartirish mumkin (server ham shuni tekshiradi).
  const rosterEditable = session.state === 'SCHEDULED' || session.state === 'OPEN';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <CountTile
          label="Tayinlangan"
          value={counts.assigned}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <CountTile
          label="Boshlamagan"
          value={counts.notStarted}
          active={filter === 'NOT_STARTED'}
          onClick={() => setFilter('NOT_STARTED')}
        />
        <CountTile
          label="Ishlamoqda"
          value={counts.inProgress}
          active={filter === 'IN_PROGRESS'}
          onClick={() => setFilter('IN_PROGRESS')}
        />
        <CountTile
          label="Yakunlagan"
          value={counts.finished}
          active={filter === 'FINISHED'}
          onClick={() => setFilter('FINISHED')}
        />
        <CountTile
          label="Aloqa uzilgan"
          value={counts.connectionIssue}
          active={filter === 'ISSUE'}
          onClick={() => setFilter('ISSUE')}
          tone="amber"
        />
        <CountTile
          label="Bekor qilingan"
          value={counts.cancelled}
          active={filter === 'CANCELLED'}
          onClick={() => setFilter('CANCELLED')}
          tone="red"
        />
      </div>

      <Card>
        <CardHeader
          title="O‘quvchilar"
          description={
            live.data.state === 'OPEN'
              ? `Har 5 soniyada yangilanadi · oxirgi yangilanish ${formatTime(new Date(live.dataUpdatedAt))}`
              : 'Sessiya ochiq bo‘lganda ro‘yxat avtomatik yangilanadi.'
          }
          actions={
            <>
              <div className="w-48">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Ism yoki ID"
                  aria-label="O‘quvchini qidirish"
                />
              </div>
              {rosterEditable && (
                <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                  O‘quvchi qo‘shish
                </Button>
              )}
            </>
          }
        />
        {rows.length === 0 ? (
          <EmptyState title="Bu filtr bo‘yicha o‘quvchi yo‘q" />
        ) : (
          <Table caption="Jonli kuzatuv">
            <THead>
              <tr>
                <TH>O‘quvchi</TH>
                <TH>Holat</TH>
                <TH>Javoblar</TH>
                <TH>Vaqt</TH>
                <TH>Signallar</TH>
                {editable && <TH className="text-right">Amallar</TH>}
              </tr>
            </THead>
            <tbody>
              {rows.map((row) => {
                const remaining =
                  row.status === 'IN_PROGRESS' && row.deadlineAt
                    ? (new Date(row.deadlineAt).getTime() - serverNow) / 1000
                    : null;
                const lastSignal = row.lastSeenAt ?? row.startedAt;
                return (
                  <TR key={row.studentId} className={cn(row.connectionIssue && 'bg-amber-50/60')}>
                    <TD>
                      <p className="font-medium text-slate-900">{row.fullName}</p>
                      <p className="text-xs text-slate-500">
                        {formatInternalId(row.internalId)}
                        {row.className && ` · ${row.className}`}
                        {row.attemptsCount > 1 && ` · ${row.attemptsCount}-urinish`}
                      </p>
                    </TD>
                    <TD>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <ParticipationBadge status={row.status} />
                        {row.connectionIssue && (
                          <Badge tone="amber">
                            <WifiOff className="size-3" aria-hidden />
                            Aloqa uzilgan
                          </Badge>
                        )}
                      </span>
                      {row.submitSource && (
                        <p className="mt-0.5 text-xs text-slate-500">{SUBMIT_SOURCE_LABELS[row.submitSource]}</p>
                      )}
                    </TD>
                    <TD className="min-w-32">
                      {row.status === 'NOT_STARTED' ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <ProgressBar
                          percent={row.questionCount ? (row.answered / row.questionCount) * 100 : null}
                          tone="brand"
                          label={
                            <span className="tabular">
                              {row.answered} / {row.questionCount}
                            </span>
                          }
                        />
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {remaining !== null ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 font-medium tabular',
                            remaining < 120 ? 'text-red-700' : 'text-slate-900',
                          )}
                        >
                          <Clock className="size-3.5" aria-hidden />
                          {remaining > 0 ? formatDuration(remaining) : 'Yakunlanmoqda…'}
                        </span>
                      ) : row.submittedAt ? (
                        <span className="text-slate-600">Topshirdi {formatTime(row.submittedAt)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {row.extraMinutes > 0 && (
                        <p className="text-xs text-brand-700">+{row.extraMinutes} daqiqa berilgan</p>
                      )}
                      {row.status === 'IN_PROGRESS' && lastSignal && (
                        <p className="text-xs text-slate-500">
                          Signal: {ago(serverNow - new Date(lastSignal).getTime())}
                        </p>
                      )}
                    </TD>
                    <TD>
                      <span
                        className="inline-flex flex-wrap gap-1"
                        title="Bu belgilar faqat signal — qoidabuzarlik isboti emas."
                      >
                        {row.focusLossCount > 0 && (
                          <Badge tone="gray">
                            <AlertTriangle className="size-3" aria-hidden />
                            Oynadan chiqish: {row.focusLossCount}
                          </Badge>
                        )}
                        {row.deviceChangeCount > 0 && (
                          <Badge tone="gray">
                            <MonitorSmartphone className="size-3" aria-hidden />
                            Qurilma almashgan: {row.deviceChangeCount}
                          </Badge>
                        )}
                        {row.focusLossCount === 0 && row.deviceChangeCount === 0 && (
                          <span className="text-slate-400">—</span>
                        )}
                      </span>
                    </TD>
                    {editable && (
                      <TD className="text-right whitespace-nowrap">
                        <span className="inline-flex gap-1">
                          {(row.status === 'IN_PROGRESS' || row.status === 'NOT_STARTED') &&
                            session.state !== 'CLOSED' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={<Clock className="size-3.5" />}
                                onClick={() => setAction({ kind: 'extend', row })}
                              >
                                Vaqt
                              </Button>
                            )}
                          {row.attemptId && row.status !== 'CANCELLED' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<XCircle className="size-3.5" />}
                              onClick={() => setAction({ kind: 'cancel', row })}
                            >
                              Bekor qilish
                            </Button>
                          )}
                          {rosterEditable && row.status === 'NOT_STARTED' && row.attemptsCount === 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<UserMinus className="size-3.5" />}
                              onClick={() => setAction({ kind: 'remove', row })}
                            >
                              Chiqarish
                            </Button>
                          )}
                        </span>
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        “Aloqa uzilgan” — o‘quvchi qurilmasidan 45 soniyadan ko‘p signal kelmagan. Javoblar serverda saqlangan; aloqa
        tiklanganda o‘quvchi davom etadi. Oynadan chiqish va qurilma almashishi faqat signal, qoidabuzarlik isboti emas.
      </p>

      {action?.kind === 'extend' && (
        <ExtendDialog sessionId={session.id} row={action.row} onClose={() => setAction(null)} onDone={setView} />
      )}
      {action?.kind === 'cancel' && (
        <CancelAttemptDialog
          row={action.row}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void queryClient.invalidateQueries({ queryKey: ['session-live', session.id] });
            void queryClient.invalidateQueries({ queryKey: sessionKey(session.id) });
            void queryClient.invalidateQueries({ queryKey: ['session-results', session.id] });
          }}
        />
      )}
      {action?.kind === 'remove' && (
        <RemoveDialog sessionId={session.id} row={action.row} onClose={() => setAction(null)} onDone={setView} />
      )}
      {adding && (
        <AddStudentsDialog
          session={session}
          assigned={new Set(live.data.rows.map((row) => row.studentId))}
          onClose={() => setAdding(false)}
          onDone={setView}
        />
      )}
    </div>
  );
}
