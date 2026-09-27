'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Clock,
  MonitorSmartphone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UserMinus,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ATTEMPT_LOCK_REASON_LABELS,
  SUBMIT_SOURCE_LABELS,
  formatDuration,
  formatInternalId,
  formatTime,
  type AttemptLockReason,
  type SessionState,
} from '@ijod/shared';
import { Avatar } from '@/components/avatar';
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
import { ApiError, api, errorMessage } from '@/lib/api';
import { hasRole, useMe } from '@/lib/auth';
import { cn } from '@/lib/cn';
import type { ClassDetail, ClassListItem, LiveRow, LiveView, SessionDetail } from '@/lib/types';
import { sessionKey } from './use-session';

type RowFilter = 'all' | 'IN_PROGRESS' | 'NOT_STARTED' | 'FINISHED' | 'ISSUE' | 'CANCELLED' | 'LOCKED';

const FINISHED = new Set(['SUBMITTED', 'EXPIRED', 'UNDER_REVIEW']);

/** Jadval nishoni uchun qisqa sabab (to‘liq matn — ATTEMPT_LOCK_REASON_LABELS). */
const LOCK_REASON_SHORT: Record<AttemptLockReason, string> = {
  FULLSCREEN_EXIT: 'to‘liq ekrandan chiqdi',
  PAGE_HIDDEN: 'boshqa oynaga o‘tdi',
};

const SOUND_KEY = 'ijod:live-sound';

function readSoundPreference() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeSoundPreference(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    // Brauzer xotirasi yopiq — sozlama faqat shu oynada amal qiladi.
  }
}

let audioContext: AudioContext | null = null;

/** Qisqa ikki tovushli ogohlantirish (brauzer ruxsat bermasa — jim o‘tadi). */
function beep() {
  try {
    const Context =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    audioContext ??= new Context();
    const audio = audioContext;
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
    const start = audio.currentTime + 0.01;
    for (const [offset, frequency] of [
      [0, 880],
      [0.22, 660],
    ] as const) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.2);
    }
  } catch {
    // Ovoz ixtiyoriy.
  }
}

/**
 * Jonli kuzatuv ma’lumoti: ochiq sessiyada muntazam yangilanadi (ruxsat kutayotgan o‘quvchi bo‘lsa —
 * tezroq), boshqa tabda ham ogohlantirish kelishi uchun fonda ham. Barcha kuzatuvchilar bitta keshni ulashadi.
 */
export function useLiveView(sessionId: string, sessionState: SessionState | undefined, enabled = true) {
  return useQuery({
    queryKey: ['session-live', sessionId],
    queryFn: () => api.get<LiveView>(`/sessions/${sessionId}/live`),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      const state = data?.state ?? sessionState;
      if (state === 'OPEN') return data?.counts.locked ? 3000 : 5000;
      return state === 'SCHEDULED' ? 15_000 : false;
    },
    refetchIntervalInBackground: true,
  });
}

/**
 * Yangi to‘xtatilgan o‘quvchi paydo bo‘lganda: bildirishnoma, qisqa ovoz (yoqilgan bo‘lsa) va
 * (sahifa ko‘rinmayotgan bo‘lsa) sarlavhada “(!)” belgisi — o‘qituvchi sahifaga qaytguncha.
 */
export function useLockAlerts(view: LiveView | undefined) {
  const toast = useToast();
  const known = useRef<Set<string> | null>(null);
  const [attention, setAttention] = useState(false);

  useEffect(() => {
    if (!view) return;
    const locked = view.rows.filter((row) => row.lockedAt && row.attemptId);
    // Bir o‘quvchi qayta chetlatilsa ham yangi hodisa sifatida sanaladi.
    const keys = new Set(locked.map((row) => `${row.attemptId}:${row.lockCount}`));
    const previous = known.current;
    known.current = keys;
    if (previous === null) return;
    const fresh = locked.filter((row) => !previous.has(`${row.attemptId}:${row.lockCount}`));
    if (fresh.length === 0) return;
    const first = fresh[0]!;
    toast.error(
      fresh.length === 1
        ? `${first.fullName} testdan chetlatildi (${LOCK_REASON_SHORT[first.lockReason ?? 'FULLSCREEN_EXIT']}). Ruxsat berishingizni kutmoqda.`
        : `${fresh.length} nafar o‘quvchi testdan chetlatildi va ruxsatingizni kutmoqda.`,
    );
    if (readSoundPreference()) beep();
    if (document.visibilityState !== 'visible' || !document.hasFocus()) setAttention(true);
  }, [view, toast]);

  useEffect(() => {
    if (!attention) return;
    if (!document.title.startsWith('(!) ')) document.title = `(!) ${document.title}`;
    const seen = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) setAttention(false);
    };
    window.addEventListener('focus', seen);
    document.addEventListener('visibilitychange', seen);
    return () => {
      window.removeEventListener('focus', seen);
      document.removeEventListener('visibilitychange', seen);
      document.title = document.title.replace(/^\(!\) /, '');
    };
  }, [attention]);
}

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

/** Davomiylik: “40 soniyadan beri”, “3 daqiqadan beri”, “1 soat 5 daqiqadan beri”. */
function since(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} soniyadan beri`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} daqiqadan beri`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} soat ${rest} daqiqadan beri` : `${minutes / 60} soatdan beri`;
}

/**
 * “Oynadan chiqish” belgisi. Nazoratli sessiyada har bir chetlatish ham shu songa qo‘shiladi, shuning
 * uchun belgi faqat undan ortiq chiqishlar bo‘lsa ko‘rsatiladi (savollar yopiq paytdagi chiqishlar).
 */
function showsFocusLoss(row: LiveRow, requireFullscreen: boolean) {
  return requireFullscreen ? row.focusLossCount > row.lockCount : row.focusLossCount > 0;
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
        'rounded-xl border bg-surface p-3 text-left shadow-xs transition-colors',
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

type RowAction = { kind: 'extend' | 'cancel' | 'remove' | 'unlock'; row: LiveRow };

/** To‘xtatilgan o‘quvchiga testni davom ettirishga ruxsat berish (ixtiyoriy qo‘shimcha vaqt bilan). */
function UnlockDialog({
  row,
  serverNow,
  onClose,
  onDone,
  onStale,
}: {
  row: LiveRow;
  serverNow: number;
  onClose: () => void;
  onDone: (view: LiveView) => void;
  onStale: () => void;
}) {
  const toast = useToast();
  const [minutes, setMinutes] = useState('0');
  const [note, setNote] = useState('');
  const unlock = useMutation({
    mutationFn: () =>
      api.post<LiveView>(`/attempts/${row.attemptId}/unlock`, {
        extraMinutes: Number(minutes),
        note: note.trim() || undefined,
      }),
    onSuccess: (view) => {
      toast.success(
        Number(minutes) > 0
          ? `${row.fullName}ga ruxsat berildi va ${minutes} daqiqa qo‘shildi.`
          : `${row.fullName}ga testni davom ettirishga ruxsat berildi.`,
      );
      onDone(view);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      // Holat o‘zgargan (allaqachon ruxsat berilgan yoki urinish yakunlangan) — ro‘yxat yangilanadi.
      if (error instanceof ApiError && error.status === 409) onStale();
    },
  });
  const value = Number(minutes);
  const valid = minutes.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 60;
  const lockedFor = row.lockedAt ? Math.max(0, serverNow - new Date(row.lockedAt).getTime()) : 0;
  const lockedMinutes = Math.min(60, Math.ceil(lockedFor / 60_000));
  // Har bir chetlatish oynadan chiqishlar soniga ham qo‘shiladi — ortig‘i savollar yopiq paytdagi chiqishlar.
  const extraLeaves = Math.max(0, row.focusLossCount - row.lockCount);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Testga qayta ruxsat berish"
      description={row.fullName}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            onClick={() => unlock.mutate()}
            loading={unlock.isPending}
            disabled={!valid}
            icon={<ShieldCheck className="size-4" />}
          >
            Ruxsat berish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Sabab</dt>
            <dd className="font-medium text-slate-900">
              {row.lockReason ? ATTEMPT_LOCK_REASON_LABELS[row.lockReason] : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">To‘xtatilgan</dt>
            <dd className="font-medium text-slate-900 tabular">
              {formatTime(row.lockedAt)} · {ago(lockedFor)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Chetlatishlar soni</dt>
            <dd className="font-medium text-slate-900 tabular">{row.lockCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Oynadan chiqishlar (jami)</dt>
            <dd className="font-medium text-slate-900 tabular">{Math.max(row.focusLossCount, row.lockCount)}</dd>
          </div>
        </dl>
        {extraLeaves > 0 && (
          <Alert tone="warning" title="Savollar yopiq paytda ham sahifadan chiqqan">
            O‘quvchi savollar yopiq paytda (masalan, test to‘xtatilgach) yana kamida {extraLeaves} marta boshqa tab yoki
            ilovaga o‘tgan. Ruxsat berishdan oldin u bilan gaplashing.
          </Alert>
        )}
        <div className="space-y-1.5">
          <Field
            label="Qo‘shimcha vaqt (daqiqa)"
            hint="0–60. Test to‘xtatilganda ham vaqt davom etgan — kerak bo‘lsa qoplang; 0 — vaqt qo‘shilmaydi."
          >
            <Input
              type="number"
              min={0}
              max={60}
              className="w-28"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Field>
          {lockedMinutes > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setMinutes(String(lockedMinutes))}>
              To‘xtab turgan vaqtni qo‘shish: +{lockedMinutes} daq.
            </Button>
          )}
        </div>
        <Field label="Izoh" hint="Ixtiyoriy, audit jurnaliga yoziladi">
          <Textarea
            rows={2}
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Masalan: tasodifan Esc bosildi, o‘quvchi bilan gaplashildi"
          />
        </Field>
        <Alert tone="info">
          O‘quvchi ekranida “Davom etish” tugmasi paydo bo‘ladi va test yana to‘liq ekranda davom etadi. Ruxsat
          berganingiz jurnalga yoziladi.
        </Alert>
      </div>
    </Dialog>
  );
}

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
  const [sound, setSound] = useState(() => (typeof window === 'undefined' ? true : readSoundPreference()));
  // Ogohlantirishlar (useLockAlerts) sessiya sahifasining o‘zida ishlaydi — boshqa bo‘limda ham.
  // Holat o‘zgarganda sessiya ma’lumotini yangilash ham sessiya sahifasining o‘zida (SessionDetailView).
  const live = useLiveView(session.id, session.state);
  const now = useNow(1000);

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
        case 'LOCKED':
          return Boolean(row.lockedAt);
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
  const proctored = session.requireFullscreen || counts.locked > 0;
  const lockedRows = live.data.rows.filter((row) => row.lockedAt && row.attemptId);
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    writeSoundPreference(next);
    // Brauzer ovozni faqat foydalanuvchi bosgandan keyin ruxsat beradi — shu yerda sinab ko‘ramiz.
    if (next) beep();
  };

  return (
    <div className="space-y-4">
      {counts.locked > 0 && (
        <Alert tone="danger" title={`${counts.locked} nafar o‘quvchi testdan chetlatildi`}>
          <p>
            {counts.locked === 1 ? 'O‘quvchi' : 'Ular'} to‘liq ekrandan chiqqan yoki boshqa oyna/ilovaga o‘tgan.
            Vaziyatni tekshirib, “Ruxsat berish” tugmasi bilan testni davom ettiring. Vaqt to‘xtamaydi — kerak bo‘lsa
            qo‘shimcha daqiqa bering.
          </p>
          <ul className="mt-3 space-y-3 sm:space-y-2">
            {lockedRows.slice(0, 8).map((row) => (
              <li key={row.studentId} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Avatar name={row.fullName} src={row.avatarUrl} size="xs" />
                <span className="min-w-0 font-medium break-words">{row.fullName}</span>
                <span className="text-xs">
                  {row.lockReason && LOCK_REASON_SHORT[row.lockReason]} · {formatTime(row.lockedAt)}
                </span>
                <Button
                  size="sm"
                  className="w-full sm:ml-auto sm:w-auto"
                  icon={<ShieldCheck className="size-3.5" />}
                  onClick={() => setAction({ kind: 'unlock', row })}
                >
                  Ruxsat berish
                </Button>
              </li>
            ))}
          </ul>
          {lockedRows.length > 8 && (
            <p className="mt-2 text-xs">Yana {lockedRows.length - 8} nafar o‘quvchi — jadvalda ko‘ring.</p>
          )}
          {filter !== 'LOCKED' && (
            <Button size="sm" variant="outline" className="mt-3 w-full sm:w-auto" onClick={() => setFilter('LOCKED')}>
              Jadvalda ko‘rsatish
            </Button>
          )}
        </Alert>
      )}
      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', proctored ? 'lg:grid-cols-7' : 'lg:grid-cols-6')}>
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
        {proctored && (
          <CountTile
            label="To‘xtatilgan"
            value={counts.locked}
            active={filter === 'LOCKED'}
            onClick={() => setFilter('LOCKED')}
            tone="red"
          />
        )}
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
              ? `Har ${counts.locked ? 3 : 5} soniyada yangilanadi · oxirgi yangilanish ${formatTime(new Date(live.dataUpdatedAt))}`
              : 'Sessiya ochiq bo‘lganda ro‘yxat avtomatik yangilanadi.'
          }
          actions={
            <>
              {proctored && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={sound ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                  onClick={toggleSound}
                  aria-pressed={sound}
                  title="Yangi o‘quvchi chetlatilganda ovozli ogohlantirish"
                >
                  {sound ? 'Ovoz yoqilgan' : 'Ovoz o‘chirilgan'}
                </Button>
              )}
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
                const locked = Boolean(row.lockedAt);
                return (
                  <TR
                    key={row.studentId}
                    className={cn(locked ? 'bg-red-50/70 hover:bg-red-50' : row.connectionIssue && 'bg-amber-50/60')}
                  >
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={row.fullName} src={row.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{row.fullName}</p>
                          <p className="text-xs text-slate-500">
                            {formatInternalId(row.internalId)}
                            {row.className && ` · ${row.className}`}
                            {row.attemptsCount > 1 && ` · ${row.attemptsCount}-urinish`}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <ParticipationBadge status={row.status} />
                        {locked && row.lockReason && (
                          <span title={ATTEMPT_LOCK_REASON_LABELS[row.lockReason]}>
                            <Badge tone="red">
                              <ShieldAlert className="size-3" aria-hidden />
                              To‘xtatildi · {LOCK_REASON_SHORT[row.lockReason]} · {formatTime(row.lockedAt)}
                            </Badge>
                          </span>
                        )}
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
                      {locked && row.lockedAt && (
                        <p className="text-xs font-medium text-red-700">
                          Ruxsat kutmoqda: {since(serverNow - new Date(row.lockedAt).getTime())}
                        </p>
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
                        title={
                          session.requireFullscreen
                            ? '“Chetlatish” — test necha marta avtomatik to‘xtatilgani. “Oynadan chiqish” chetlatishlardan ko‘p bo‘lsa — o‘quvchi savollar yopiq paytda (masalan, test to‘xtatilganda) ham boshqa tab yoki ilovaga o‘tgan. Qurilma almashishi faqat signal.'
                            : 'Bu belgilar faqat signal — qoidabuzarlik isboti emas.'
                        }
                      >
                        {row.lockCount > 0 && (
                          <Badge tone="red">
                            <ShieldAlert className="size-3" aria-hidden />
                            Chetlatish: {row.lockCount}
                          </Badge>
                        )}
                        {showsFocusLoss(row, session.requireFullscreen) && (
                          <Badge tone={session.requireFullscreen ? 'amber' : 'gray'}>
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
                        {row.lockCount === 0 &&
                          !showsFocusLoss(row, session.requireFullscreen) &&
                          row.deviceChangeCount === 0 && <span className="text-slate-400">—</span>}
                      </span>
                    </TD>
                    {editable && (
                      <TD className="text-right whitespace-nowrap">
                        <span className="inline-flex gap-1">
                          {locked && row.attemptId && (
                            <Button
                              size="sm"
                              icon={<ShieldCheck className="size-3.5" />}
                              onClick={() => setAction({ kind: 'unlock', row })}
                            >
                              Ruxsat berish
                            </Button>
                          )}
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
        tiklanganda o‘quvchi davom etadi.{' '}
        {session.requireFullscreen
          ? '“To‘xtatilgan” — o‘quvchi to‘liq ekrandan chiqqan yoki boshqa oyna/ilovaga o‘tgan, test avtomatik to‘xtatilgan. Ruxsat berguningizcha u javob yoza olmaydi, vaqt esa davom etadi. Qurilma almashishi faqat signal, qoidabuzarlik isboti emas.'
          : 'Bu sessiyada to‘liq ekran nazorati o‘chirilgan: oynadan chiqish va qurilma almashishi faqat signal, qoidabuzarlik isboti emas.'}
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
      {action?.kind === 'unlock' && (
        <UnlockDialog
          row={action.row}
          serverNow={serverNow}
          onClose={() => setAction(null)}
          onDone={setView}
          onStale={() => {
            setAction(null);
            void queryClient.invalidateQueries({ queryKey: ['session-live', session.id] });
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
