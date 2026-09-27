'use client';

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Loader2,
  MonitorSmartphone,
  Send,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, formatPoints } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api';
import { loadPending, savePending, type PendingAnswer } from '@/lib/attempt-storage';
import { cn } from '@/lib/cn';
import type { AttemptQuestion, AttemptView } from '@/lib/types';

const LETTERS = 'ABCDEFGHIJ';
const HEARTBEAT_MS = 20_000;

type SaveState = 'saved' | 'saving' | 'offline' | 'error';

interface LocalAnswer {
  optionId: string | null;
  revision: number;
}

interface HeartbeatResponse {
  status: string;
  serverNow: string;
  deadlineAt?: string;
  deviceConflict?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serverdagi javoblar va qurilmada kutib turgan (hali yuborilmagan) javoblarni birlashtiradi:
 * qurilmadagi javob yangiroq bo‘lsa (revision katta) — u saqlanadi va qayta yuboriladi.
 */
function merge(questions: AttemptQuestion[], pending: Record<string, PendingAnswer>) {
  const answers: Record<string, LocalAnswer> = {};
  const stillPending: Record<string, PendingAnswer> = {};
  for (const question of questions) {
    const server = question.answer ? { optionId: question.answer.optionId, revision: question.answer.revision } : null;
    const local = pending[question.id];
    if (local && local.revision > (server?.revision ?? 0)) {
      answers[question.id] = local;
      stillPending[question.id] = local;
    } else if (server) {
      answers[question.id] = server;
    }
  }
  return { answers, pending: stillPending };
}

export function AttemptRunner({
  initial,
  clientId,
  onFinished,
}: {
  initial: AttemptView;
  clientId: string;
  onFinished: () => void;
}) {
  const toast = useToast();
  const attemptId = initial.id;
  const questions = initial.questions;
  const allowBack = initial.session.allowBackNavigation;

  const seeded = useMemo(() => merge(questions, loadPending(attemptId)), [questions, attemptId]);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(seeded.answers);
  const answersRef = useRef(seeded.answers);
  const pendingRef = useRef<Record<string, PendingAnswer>>(seeded.pending);
  const [pendingCount, setPendingCount] = useState(Object.keys(seeded.pending).length);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [conflict, setConflict] = useState(Boolean(initial.deviceConflict));
  const conflictRef = useRef(conflict);
  const finishedRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
  const [progressIndex, setProgressIndex] = useState(initial.progressIndex ?? 0);
  const [current, setCurrent] = useState(allowBack ? 0 : (initial.progressIndex ?? 0));
  const focusLoss = useRef(0);

  // ------------------------------------------------------------ Server soati
  // Vaqt brauzer soatidan emas, server vaqti + monoton hisoblagichdan olinadi:
  // qurilma soatini o‘zgartirish taymerga ta’sir qilmaydi.
  const clock = useRef({ server: Date.parse(initial.serverNow), perf: performance.now() });
  const serverNow = useCallback(() => clock.current.server + (performance.now() - clock.current.perf), []);
  const syncClock = useCallback((iso: string) => {
    clock.current = { server: Date.parse(iso), perf: performance.now() };
  }, []);
  const [deadline, setDeadline] = useState(Date.parse(initial.deadlineAt));
  const [now, setNow] = useState(() => serverNow());
  const remainingMs = Math.max(0, deadline - now);

  const setConflictState = useCallback((value: boolean) => {
    conflictRef.current = value;
    setConflict(value);
  }, []);

  const persist = useCallback(() => {
    savePending(attemptId, pendingRef.current);
    setPendingCount(Object.keys(pendingRef.current).length);
  }, [attemptId]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  }, [onFinished]);

  // ------------------------------------------------------------ Javoblarni yuborish navbati
  const sending = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(2000);

  const flush = useCallback(async (): Promise<void> => {
    if (sending.current || conflictRef.current || finishedRef.current) return;
    const entry = Object.entries(pendingRef.current)[0];
    if (!entry) {
      setSaveState('saved');
      return;
    }
    const [questionId, item] = entry;
    sending.current = true;
    setSaveState('saving');
    try {
      await api.put(`/attempts/${attemptId}/answers/${questionId}`, {
        clientId,
        optionId: item.optionId,
        revision: item.revision,
      });
      if (pendingRef.current[questionId]?.revision === item.revision) {
        delete pendingRef.current[questionId];
        persist();
      }
      backoff.current = 2000;
      sending.current = false;
      return flush();
    } catch (error) {
      sending.current = false;
      const retry = () => {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void flush(), backoff.current);
        backoff.current = Math.min(backoff.current * 2, 15_000);
      };
      if (!(error instanceof ApiError)) {
        setSaveState('error');
        retry();
        return;
      }
      if (error.status === 0 || error.status >= 500 || error.status === 429) {
        setSaveState('offline');
        retry();
      } else if (error.status === 401) {
        // Javoblar qurilmada saqlanib qoladi va qayta kirgach yuboriladi.
        window.location.assign(`/login?next=${encodeURIComponent(`/attempt/${attemptId}`)}`);
      } else if (error.code === 'DEVICE_CONFLICT') {
        setConflictState(true);
      } else if (error.code === 'TIME_UP' || error.code === 'ATTEMPT_FINISHED') {
        pendingRef.current = {};
        persist();
        finish();
      } else {
        // Masalan, ortga qaytish taqiqlangan savol — bu javob qabul qilinmaydi.
        toast.error(error.message);
        delete pendingRef.current[questionId];
        persist();
        return flush();
      }
    }
  }, [attemptId, clientId, finish, persist, setConflictState, toast]);

  const choose = (question: AttemptQuestion, optionId: string | null) => {
    if (conflictRef.current || finishedRef.current || remainingMs <= 0) return;
    const revision = (answersRef.current[question.id]?.revision ?? 0) + 1;
    const next = { ...answersRef.current, [question.id]: { optionId, revision } };
    answersRef.current = next;
    setAnswers(next);
    pendingRef.current = { ...pendingRef.current, [question.id]: { optionId, revision } };
    persist();
    void flush();
  };

  // ------------------------------------------------------------ Topshirish
  const submitting = useRef(false);
  const submit = useCallback(
    async (automatic: boolean) => {
      if (submitting.current || finishedRef.current) return;
      submitting.current = true;
      setFinishing(true);
      setAutoSubmitFailed(false);
      const payload = Object.entries(pendingRef.current).map(([testQuestionId, item]) => ({
        testQuestionId,
        optionId: item.optionId,
        revision: item.revision,
      }));
      for (let tries = 0; tries < 4; tries += 1) {
        try {
          await api.post(`/attempts/${attemptId}/submit`, { clientId, answers: payload });
          pendingRef.current = {};
          persist();
          finish();
          return;
        } catch (error) {
          if (error instanceof ApiError && error.code === 'DEVICE_CONFLICT') {
            setConflictState(true);
            break;
          }
          if (error instanceof ApiError && error.status > 0 && error.status < 500 && error.status !== 429) {
            toast.error(error.message);
            break;
          }
          await sleep(2000 * (tries + 1));
        }
      }
      submitting.current = false;
      setFinishing(false);
      if (automatic) setAutoSubmitFailed(true);
      else toast.error('Topshirib bo‘lmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.');
    },
    [attemptId, clientId, finish, persist, setConflictState, toast],
  );

  // ------------------------------------------------------------ Hayotiy sikl
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(timer);
  }, [serverNow]);

  // Vaqt tugaganda avtomatik topshirish (server baribir o‘zi yakunlaydi).
  useEffect(() => {
    if (remainingMs <= 0 && !finishedRef.current && !conflict) void submit(true);
  }, [remainingMs, conflict, submit]);

  useEffect(() => {
    void flush();
    const onOnline = () => {
      backoff.current = 2000;
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') focusLoss.current += 1;
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(pendingRef.current).length > 0) event.preventDefault();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [flush]);

  useEffect(() => {
    const beat = async () => {
      if (finishedRef.current) return;
      try {
        const response = await api.post<HeartbeatResponse>(`/attempts/${attemptId}/heartbeat`, {
          clientId,
          focusLossCount: focusLoss.current,
        });
        syncClock(response.serverNow);
        if (response.status !== 'IN_PROGRESS') {
          finish();
          return;
        }
        if (response.deadlineAt) setDeadline(Date.parse(response.deadlineAt));
        if (response.deviceConflict) setConflictState(true);
      } catch {
        // Aloqa yo‘q — keyingi urinishda tiklanadi.
      }
    };
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [attemptId, clientId, finish, setConflictState, syncClock]);

  const takeover = async () => {
    try {
      const view = await api.post<AttemptView>(`/attempts/${attemptId}/takeover`, { clientId });
      if (view.status !== 'IN_PROGRESS') {
        finish();
        return;
      }
      const merged = merge(view.questions, pendingRef.current);
      answersRef.current = merged.answers;
      setAnswers(merged.answers);
      pendingRef.current = merged.pending;
      persist();
      syncClock(view.serverNow);
      setDeadline(Date.parse(view.deadlineAt));
      setConflictState(false);
      void flush();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Qayta urinib ko‘ring.');
    }
  };

  // ------------------------------------------------------------ Navigatsiya
  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(questions.length - 1, index));
    if (!allowBack && target < progressIndex) return;
    if (!allowBack && target > progressIndex) {
      setProgressIndex(target);
      void api.post(`/attempts/${attemptId}/advance`, { clientId, toIndex: target }).catch(() => undefined);
    }
    setCurrent(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const question = questions[current]!;
  const answered = questions.filter((item) => answers[item.id]?.optionId).length;
  const unanswered = questions.filter((item) => !answers[item.id]?.optionId).map((item) => item.number);
  const warning = remainingMs <= 60_000 ? 'critical' : remainingMs <= 5 * 60_000 ? 'soon' : null;

  return (
    <div className="min-h-dvh bg-slate-50 pb-24">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{initial.session.title}</p>
            <p className="truncate text-xs text-slate-500">
              {initial.session.subject.name} · Javob berildi: {answered}/{questions.length}
            </p>
          </div>
          <div
            className={cn(
              'rounded-lg px-3 py-1.5 text-right tabular',
              warning === 'critical'
                ? 'animate-pulse bg-red-100 text-red-800'
                : warning === 'soon'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-slate-100 text-slate-900',
            )}
            aria-label={`Qolgan vaqt: ${formatDuration(remainingMs / 1000)}`}
          >
            <span className="block text-[11px] leading-none font-medium tracking-wide uppercase opacity-70">
              Qolgan vaqt
            </span>
            <span className="text-xl leading-tight font-bold">{formatDuration(remainingMs / 1000)}</span>
          </div>
        </div>
        <SaveIndicator state={saveState} pending={pendingCount} />
      </header>

      {/* Ekran o‘quvchilar uchun muhim vaqt ogohlantirishlari */}
      <p className="sr-only" aria-live="assertive">
        {warning === 'critical'
          ? 'Bir daqiqadan kam vaqt qoldi.'
          : warning === 'soon'
            ? 'Besh daqiqadan kam vaqt qoldi.'
            : ''}
      </p>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5">
        {current === 0 && initial.session.instructions && (
          <Alert tone="info" title="Ko‘rsatma">
            <span className="whitespace-pre-wrap">{initial.session.instructions}</span>
          </Alert>
        )}

        <section
          className="rounded-xl border border-slate-200 bg-surface p-5 shadow-xs sm:p-6"
          aria-labelledby="question-title"
        >
          <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
            <h2 id="question-title" className="font-semibold text-slate-700">
              {question.number}-savol / {questions.length}
            </h2>
            <span className="tabular">{formatPoints(question.points)} ball</span>
          </div>
          <p className="mt-3 text-lg leading-relaxed whitespace-pre-wrap text-slate-900">{question.stem}</p>

          <fieldset className="mt-5">
            <legend className="sr-only">Javob variantlari</legend>
            <div className="space-y-2.5">
              {question.options.map((option, index) => {
                const selected = answers[question.id]?.optionId === option.id;
                return (
                  <label
                    key={option.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border-2 px-4 py-3 transition-colors',
                      selected
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                      (conflict || remainingMs <= 0) && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={option.id}
                      checked={selected}
                      onChange={() => choose(question, option.id)}
                      disabled={conflict || remainingMs <= 0}
                      className="mt-1 size-4 shrink-0 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="flex-1 text-base text-slate-800">
                      <span className="mr-2 font-semibold text-slate-500">{LETTERS[index]})</span>
                      {option.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {answers[question.id]?.optionId && (
            <button
              type="button"
              onClick={() => choose(question, null)}
              className="mt-3 text-sm text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              disabled={conflict}
            >
              Javobni bekor qilish
            </button>
          )}
        </section>

        {allowBack ? (
          <nav aria-label="Savollar" className="rounded-xl border border-slate-200 bg-surface p-4">
            <p className="mb-3 text-xs font-medium text-slate-500">
              Savollar: <span className="inline-block size-2.5 rounded-sm bg-brand-500 align-middle" /> javob berilgan,{' '}
              <span className="inline-block size-2.5 rounded-sm border border-slate-300 align-middle" /> javobsiz
            </p>
            <div className="grid grid-cols-8 gap-2 sm:grid-cols-12">
              {questions.map((item, index) => {
                const done = Boolean(answers[item.id]?.optionId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={index === current ? 'step' : undefined}
                    aria-label={`${item.number}-savol${done ? ', javob berilgan' : ', javobsiz'}`}
                    className={cn(
                      'h-9 rounded-md text-sm font-medium tabular transition-colors',
                      done
                        ? 'bg-brand-600 text-white'
                        : 'border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50',
                      index === current && 'ring-2 ring-amber-400 ring-offset-1',
                    )}
                  >
                    {item.number}
                  </button>
                );
              })}
            </div>
          </nav>
        ) : (
          <Alert tone="warning">
            Bu testda oldingi savollarga qaytib bo‘lmaydi. Keyingi savolga o‘tishdan oldin javobingizni tekshiring.
          </Alert>
        )}

        <p className="text-center text-xs text-slate-500">
          Javoblar avtomatik saqlanadi. Vaqt server bo‘yicha hisoblanadi. Oynadan chiqish holatlari qayd etiladi, lekin
          bu avtomatik xulosa uchun asos emas.
        </p>
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          {allowBack && (
            <Button
              variant="outline"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              icon={<ChevronLeft className="size-4" />}
            >
              <span className="hidden sm:inline">Oldingi</span>
            </Button>
          )}
          {current < questions.length - 1 && (
            <Button variant="outline" onClick={() => goTo(current + 1)}>
              <span>Keyingi</span>
              <ChevronRight className="size-4" />
            </Button>
          )}
          <div className="flex-1" />
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={conflict || finishing}
            loading={finishing}
            icon={<Send className="size-4" />}
          >
            Topshirish
          </Button>
        </div>
      </footer>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Testni topshirasizmi?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Davom etish
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                void submit(false);
              }}
              loading={finishing}
            >
              Ha, topshirish
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            Javob berilgan savollar: <strong className="tabular">{answered}</strong> / {questions.length}.
          </p>
          {unanswered.length > 0 && (
            <Alert tone="warning">Javobsiz savollar: {unanswered.join(', ')}. Javobsiz savolga 0 ball qo‘yiladi.</Alert>
          )}
          <p>Topshirgandan so‘ng javoblarni o‘zgartirib bo‘lmaydi.</p>
        </div>
      </Dialog>

      <Dialog
        open={conflict}
        onClose={() => undefined}
        title="Test boshqa joyda ochilgan"
        size="sm"
        footer={<Button onClick={() => void takeover()}>Shu qurilmada davom etish</Button>}
      >
        <div className="flex gap-3 text-sm text-slate-700">
          <MonitorSmartphone className="size-8 shrink-0 text-brand-600" aria-hidden />
          <p>
            Bu test boshqa qurilma yoki brauzer oynasida ochilgan. Bir vaqtda faqat bitta joydan javob yozish mumkin.
            Shu yerda davom ettirsangiz, boshqa oynada javob yozish to‘xtatiladi. Qurilma almashtirilgani qayd etiladi.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={autoSubmitFailed}
        onClose={() => undefined}
        title="Vaqt tugadi"
        size="sm"
        footer={
          <Button onClick={() => void submit(true)} loading={finishing}>
            Qayta urinish
          </Button>
        }
      >
        <p className="text-sm text-slate-700">
          Vaqt tugadi, lekin server bilan aloqa yo‘q. Serverda saqlangan javoblaringiz baholanadi. Aloqa tiklangach
          “Qayta urinish”ni bosing.
        </p>
      </Dialog>
    </div>
  );
}

function SaveIndicator({ state, pending }: { state: SaveState; pending: number }) {
  const content = {
    saved: {
      icon: <Check className="size-3.5" />,
      text: 'Barcha javoblar saqlandi',
      tone: 'text-emerald-700 bg-emerald-50',
    },
    saving: {
      icon: <Loader2 className="size-3.5 animate-spin" />,
      text: 'Saqlanmoqda…',
      tone: 'text-slate-600 bg-slate-50',
    },
    offline: {
      icon: <CloudOff className="size-3.5" />,
      text: `Internet uzildi — ${pending} ta javob qurilmada saqlanib turibdi, aloqa tiklanganda yuboriladi`,
      tone: 'text-amber-800 bg-amber-50',
    },
    error: {
      icon: <AlertTriangle className="size-3.5" />,
      text: 'Saqlashda xatolik — qayta urinilmoqda',
      tone: 'text-red-700 bg-red-50',
    },
  }[state];
  return (
    <div className={cn('border-t border-slate-100 px-4 py-1 text-xs', content.tone)} aria-live="polite">
      <p className="mx-auto flex max-w-4xl items-center gap-1.5">
        {content.icon}
        {content.text}
      </p>
    </div>
  );
}
