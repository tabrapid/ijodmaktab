'use client';

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Loader2,
  MonitorSmartphone,
  PauseCircle,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, formatPoints, type AttemptLockReason } from '@ijod/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ApiError, api } from '@/lib/api';
import {
  clearLockFlag,
  loadLockFlag,
  loadPending,
  saveLockFlag,
  savePending,
  type LockFlag,
  type PendingAnswer,
} from '@/lib/attempt-storage';
import { cn } from '@/lib/cn';
import type { AttemptQuestion, AttemptView } from '@/lib/types';
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen, onFullscreenChange } from './fullscreen';
import { FullscreenGate, LockedScreen, UnlockedScreen } from './proctor-screens';
import { useScreenWakeLock, wakeLockSupported } from './wake-lock';

const LETTERS = 'ABCDEFGHIJ';
const HEARTBEAT_MS = 20_000;
/** To‘xtatilgan holatda o‘qituvchi ruxsatini tezroq sezish uchun. */
const LOCKED_POLL_MS = 3000;
/** Oyna fokusni yo‘qotib, shu vaqt ichida qaytmasa — boshqa ilovaga o‘tilgan deb hisoblanadi. */
const BLUR_GRACE_MS = 1500;

type SaveState = 'saved' | 'saving' | 'offline' | 'error' | 'paused';

/**
 * To‘liq ekran nazorati holati: gate — to‘liq ekranga o‘tish kutilmoqda (savollar yashirin);
 * active — ishlash; locked — to‘xtatilgan, o‘qituvchi ruxsati kutilmoqda; unlocked — ruxsat
 * berildi, davom etish uchun tugmani bosish kerak (brauzer to‘liq ekranni faqat bosish bilan ochadi).
 */
type Mode = 'gate' | 'active' | 'locked' | 'unlocked';

interface LocalAnswer {
  optionId: string | null;
  revision: number;
}

/** Yurak urishi va to‘xtatish so‘rovlarining umumiy javobi. */
interface ServerState {
  status: string;
  serverNow: string;
  deadlineAt?: string;
  deviceConflict?: boolean;
  lock?: { lockedAt: string; reason: AttemptLockReason } | null;
  lockCount?: number;
}

interface LockInfo {
  reason: AttemptLockReason;
  /** Server tasdiqlagan vaqt (tasdiqlanmaguncha null). */
  lockedAt: number | null;
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

/** Qurilmada to‘xtatish belgisi bor, lekin server uni hali qabul qilmagan. */
const unconfirmed = (flag: LockFlag | null, lockCount: number): flag is LockFlag =>
  Boolean(flag && lockCount <= flag.epoch);

function initialMode(view: AttemptView, enforce: boolean, canFullscreen: boolean): Mode {
  if (view.lock) return 'locked';
  if (!enforce) return 'active';
  // Sahifa yangilangan bo‘lsa ham to‘xtatish bekor bo‘lmaydi.
  if (unconfirmed(loadLockFlag(view.id), view.lockCount)) return 'locked';
  if (canFullscreen && !isFullscreen()) return 'gate';
  return 'active';
}

function initialLock(view: AttemptView): LockInfo | null {
  if (view.lock) return { reason: view.lock.reason, lockedAt: Date.parse(view.lock.lockedAt) };
  const flag = loadLockFlag(view.id);
  return flag ? { reason: flag.reason, lockedAt: null } : null;
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
  const enforce = initial.session.requireFullscreen;
  const [canFullscreen] = useState(() => fullscreenSupported());
  const [canKeepAwake] = useState(() => wakeLockSupported());

  const seeded = useMemo(() => merge(questions, loadPending(attemptId)), [questions, attemptId]);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>(seeded.answers);
  const answersRef = useRef(seeded.answers);
  const pendingRef = useRef<Record<string, PendingAnswer>>(seeded.pending);
  const [pendingCount, setPendingCount] = useState(Object.keys(seeded.pending).length);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [conflict, setConflict] = useState(Boolean(initial.deviceConflict));
  const conflictRef = useRef(conflict);
  const finishedRef = useRef(false);
  const [ended, setEnded] = useState(false);
  const unmounted = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
  const [progressIndex, setProgressIndex] = useState(initial.progressIndex ?? 0);
  const [current, setCurrent] = useState(allowBack ? 0 : (initial.progressIndex ?? 0));
  const focusLoss = useRef(0);
  const sending = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(2000);
  const submitting = useRef(false);

  // To‘liq ekran nazorati.
  const [mode, setModeState] = useState<Mode>(() => initialMode(initial, enforce, canFullscreen));
  const modeRef = useRef(mode);
  const [lockInfo, setLockInfo] = useState<LockInfo | null>(() => initialLock(initial));
  const [fullscreenFailed, setFullscreenFailed] = useState(false);
  const [addedMinutes, setAddedMinutes] = useState(0);
  /** Qurilma oxirgi ko‘rgan lockCount — eskirgan xabar yangi ruxsatni bekor qilmasligi uchun. */
  const epoch = useRef(initial.lockCount);
  /** Dasturning o‘zi to‘liq ekrandan chiqayotganda (yakunlash, qayta kirish) to‘xtatilmaydi. */
  const expectedExit = useRef(false);
  const lockSending = useRef(false);
  /** Topshirish kutilayotganda sodir bo‘lgan qoidabuzarlik: topshirish muvaffaqiyatsiz bo‘lsa qo‘llanadi. */
  const deferredViolation = useRef<AttemptLockReason | null>(null);
  const applyRef = useRef<(state: ServerState, resend: boolean) => void>(() => undefined);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ------------------------------------------------------------ Server soati
  // Vaqt brauzer soatidan emas, server vaqti + monoton hisoblagichdan olinadi:
  // qurilma soatini o‘zgartirish taymerga ta’sir qilmaydi.
  const clock = useRef({ server: Date.parse(initial.serverNow), perf: performance.now() });
  const serverNow = useCallback(() => clock.current.server + (performance.now() - clock.current.perf), []);
  const syncClock = useCallback((iso: string) => {
    clock.current = { server: Date.parse(iso), perf: performance.now() };
  }, []);
  const [deadline, setDeadline] = useState(Date.parse(initial.deadlineAt));
  const deadlineRef = useRef(deadline);
  // Sahifa to‘xtatilgan holatda ochilsa (server yoki qurilmadagi belgi bo‘yicha) — ruxsatda
  // qo‘shilgan daqiqalar shu muddatga nisbatan hisoblanadi.
  const deadlineAtLock = useRef<number | null>(mode === 'locked' ? deadline : null);
  const [now, setNow] = useState(() => serverNow());
  const remainingMs = Math.max(0, deadline - now);

  const updateDeadline = useCallback((value: number) => {
    deadlineRef.current = value;
    setDeadline(value);
  }, []);

  const setConflictState = useCallback((value: boolean) => {
    conflictRef.current = value;
    setConflict(value);
  }, []);

  const setMode = useCallback((next: Mode) => {
    modeRef.current = next;
    setModeState(next);
  }, []);

  const persist = useCallback(() => {
    savePending(attemptId, pendingRef.current);
    setPendingCount(Object.keys(pendingRef.current).length);
  }, [attemptId]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setEnded(true);
    expectedExit.current = true;
    clearLockFlag(attemptId);
    exitFullscreen();
    onFinished();
  }, [attemptId, onFinished]);

  const goLogin = useCallback(() => {
    // Javoblar va to‘xtatish belgisi qurilmada qoladi — qayta kirgach davom etadi.
    expectedExit.current = true;
    // Chiqib ketish bekor qilinsa (brauzer so‘rovi), nazorat yana ishlaydi.
    setTimeout(() => {
      expectedExit.current = false;
    }, 3000);
    window.location.assign(`/login?next=${encodeURIComponent(`/attempt/${attemptId}`)}`);
  }, [attemptId]);

  // ------------------------------------------------------------ To‘xtatish va ruxsat
  const enterLocked = useCallback(() => {
    if (modeRef.current === 'locked') return;
    deadlineAtLock.current = deadlineRef.current;
    setConfirmOpen(false);
    setMode('locked');
  }, [setMode]);

  /**
   * To‘xtatish xabarini serverga yetkazadi (internet uzilsa — qayta urinadi). Xabar to‘xtatgan
   * oyna nomidan yuboriladi: yangi oyna ham eski oynaning qoidabuzarligini bekor qila olmaydi,
   * fondagi eski oynaning xabarini esa server qabul qilmaydi. Har urinishda xotiradagi eng
   * so‘nggi belgi olinadi (masalan, “Shu qurilmada davom etish”dan keyin u shu oynaga o‘tadi).
   */
  const sendLock = useCallback(async () => {
    if (lockSending.current) return;
    lockSending.current = true;
    try {
      for (let tries = 0; !finishedRef.current && !unmounted.current; tries += 1) {
        const flag = loadLockFlag(attemptId);
        if (!flag) return;
        try {
          const state = await api.post<ServerState>(
            `/attempts/${attemptId}/lock`,
            { clientId: flag.clientId, reason: flag.reason, epoch: flag.epoch },
            // Sahifa yopilayotgan bo‘lsa ham so‘rov yetib boradi.
            { keepalive: true },
          );
          const own = flag.clientId === clientId;
          const refused =
            state.status === 'IN_PROGRESS' &&
            !state.lock &&
            typeof state.lockCount === 'number' &&
            state.lockCount <= flag.epoch;
          if (refused) {
            // Belgi shu orada yangilangan (masalan, boshqa oynaga o‘tkazilgan) — yangisi yuboriladi.
            const latest = loadLockFlag(attemptId);
            if (latest && (latest.clientId !== flag.clientId || latest.epoch !== flag.epoch)) continue;
            // Server qabul qilmadi: to‘xtatgan oyna javob yozayotgan oyna emas edi — belgi bekor.
            clearLockFlag(attemptId);
            if (own && state.deviceConflict) setConflictState(true);
            if (modeRef.current === 'locked') setMode(enforce && canFullscreen && !isFullscreen() ? 'gate' : 'active');
          }
          applyRef.current({ ...state, deviceConflict: own ? state.deviceConflict : undefined }, false);
          return;
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            goLogin();
            return;
          }
          if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) return;
          await sleep(Math.min(2000 * 2 ** tries, 15_000));
        }
      }
    } finally {
      lockSending.current = false;
    }
  }, [attemptId, canFullscreen, clientId, enforce, goLogin, setConflictState, setMode]);

  /** Server holatini qurilma holatiga moslaydi (server — yagona haqiqat manbai). */
  const reconcile = useCallback(
    (state: { lock: LockInfo | null; lockCount: number }, resend: boolean) => {
      epoch.current = state.lockCount;
      if (state.lock) {
        setLockInfo(state.lock);
        enterLocked();
        return;
      }
      // Topshirish natijasi kutilmoqda: kechiktirilgan qoidabuzarlik belgisi submit() da hal qilinadi.
      if (deferredViolation.current) return;
      const flag = loadLockFlag(attemptId);
      if (enforce && unconfirmed(flag, state.lockCount)) {
        // Qurilma to‘xtatgan, xabar esa serverga hali yetmagan — test ochilmaydi, xabar qayta yuboriladi.
        enterLocked();
        if (resend) void sendLock();
        return;
      }
      if (flag) clearLockFlag(attemptId);
      if (modeRef.current === 'locked') {
        // O‘qituvchi ruxsat berdi (qo‘shimcha vaqt bo‘lsa — ko‘rsatiladi).
        const before = deadlineAtLock.current;
        setAddedMinutes(before ? Math.max(0, Math.round((deadlineRef.current - before) / 60_000)) : 0);
        setFullscreenFailed(false);
        setMode('unlocked');
        // Navbatda qolgan javoblar “Davom etish”ni kutmasdan darhol yuboriladi.
        void flushRef.current();
      }
    },
    [attemptId, enforce, enterLocked, sendLock, setMode],
  );

  const applyServer = useCallback(
    (state: ServerState, resend: boolean) => {
      if (finishedRef.current) return;
      syncClock(state.serverNow);
      if (state.status !== 'IN_PROGRESS') {
        finish();
        return;
      }
      if (state.deadlineAt) updateDeadline(Date.parse(state.deadlineAt));
      if (state.deviceConflict) setConflictState(true);
      if (typeof state.lockCount === 'number') {
        reconcile(
          {
            lock: state.lock ? { reason: state.lock.reason, lockedAt: Date.parse(state.lock.lockedAt) } : null,
            lockCount: state.lockCount,
          },
          resend,
        );
      }
    },
    [finish, reconcile, setConflictState, syncClock, updateDeadline],
  );

  useEffect(() => {
    applyRef.current = applyServer;
  }, [applyServer]);

  const refreshState = useCallback(async () => {
    if (finishedRef.current) return;
    try {
      const response = await api.post<ServerState>(`/attempts/${attemptId}/heartbeat`, {
        clientId,
        focusLossCount: Math.max(0, focusLoss.current),
      });
      applyRef.current(response, true);
    } catch {
      // Aloqa yo‘q — keyingi urinishda tiklanadi.
    }
  }, [attemptId, clientId]);

  /**
   * Qoidabuzarlik: savollar darhol yopiladi, xabar serverga yuboriladi. Shu chaqiruv testni
   * to‘xtatgan (yoki topshirish tugashiga qoldirgan) bo‘lsa — true.
   */
  const violate = useCallback(
    (reason: AttemptLockReason): boolean => {
      if (!enforce || modeRef.current !== 'active') return false;
      // Dasturning o‘zi chiqayotganda (yakunlash, qayta kirish) to‘xtatilmaydi.
      if (expectedExit.current || finishedRef.current) return false;
      // Javob yozish huquqi boshqa oynada — bu oynaning xabarini server baribir qabul qilmaydi.
      if (conflictRef.current) return false;
      const flag: LockFlag = { reason, epoch: epoch.current, clientId };
      if (submitting.current) {
        // Topshirish kutilmoqda: muvaffaqiyatli bo‘lsa — ahamiyatsiz, bo‘lmasa — darhol to‘xtatiladi.
        // Belgi hozir yoziladi: sahifa shu orada yopilsa ham, qayta ochilganda test to‘xtatilgan bo‘ladi.
        if (deferredViolation.current) return false;
        deferredViolation.current = reason;
        saveLockFlag(attemptId, flag);
        return true;
      }
      saveLockFlag(attemptId, flag);
      setLockInfo({ reason, lockedAt: serverNow() });
      enterLocked();
      void sendLock();
      return true;
    },
    [attemptId, clientId, enforce, enterLocked, sendLock, serverNow],
  );

  // ------------------------------------------------------------ Javoblarni yuborish navbati
  const flush = useCallback(async (): Promise<void> => {
    if (sending.current || conflictRef.current || finishedRef.current) return;
    const entry = Object.entries(pendingRef.current)[0];
    if (!entry) {
      setSaveState('saved');
      return;
    }
    // To‘xtatilgan test: javoblar navbatda qoladi va ruxsat berilgach yuboriladi.
    if (modeRef.current === 'locked') {
      setSaveState('paused');
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
        goLogin();
      } else if (error.code === 'DEVICE_CONFLICT') {
        setConflictState(true);
      } else if (error.code === 'ATTEMPT_LOCKED') {
        // Javob tashlab yuborilmaydi: ruxsat berilgach qayta yuboriladi.
        setSaveState('paused');
        enterLocked();
        void refreshState();
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
  }, [attemptId, clientId, enterLocked, finish, goLogin, persist, refreshState, setConflictState, toast]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const choose = (question: AttemptQuestion, optionId: string | null) => {
    if (conflictRef.current || finishedRef.current || remainingMs <= 0 || modeRef.current !== 'active') return;
    // Topshirish yuborilgan — javoblar endi o‘zgarmaydi (muvaffaqiyatsiz bo‘lsa, yana ochiladi).
    if (submitting.current) return;
    const revision = (answersRef.current[question.id]?.revision ?? 0) + 1;
    const next = { ...answersRef.current, [question.id]: { optionId, revision } };
    answersRef.current = next;
    setAnswers(next);
    pendingRef.current = { ...pendingRef.current, [question.id]: { optionId, revision } };
    persist();
    void flush();
  };

  // ------------------------------------------------------------ Topshirish
  const submit = useCallback(
    async (automatic: boolean) => {
      if (submitting.current || finishedRef.current) return;
      submitting.current = true;
      deferredViolation.current = null;
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
          if (error instanceof ApiError && error.code === 'ATTEMPT_LOCKED') {
            // To‘xtatilgan test topshirilmaydi; vaqt tugagach server o‘zi yakunlaydi.
            submitting.current = false;
            setFinishing(false);
            // Server allaqachon to‘xtatgan — kutilayotgan qoidabuzarlik belgisi ortiqcha
            // (aks holda ruxsatdan keyin test yana to‘xtab qolardi).
            if (deferredViolation.current) {
              deferredViolation.current = null;
              clearLockFlag(attemptId);
            }
            enterLocked();
            void refreshState();
            return;
          }
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
      // Topshirish kutilayotganda sahifadan chiqilgan bo‘lsa (hozir qaytgan bo‘lsa ham) — endi
      // hisobga olinadi. Vaqt tugagan bo‘lsa, test baribir yakunlanadi.
      const deferred = deferredViolation.current;
      deferredViolation.current = null;
      if (enforce && modeRef.current === 'active' && deadlineRef.current > serverNow()) {
        if (deferred) violate(deferred);
        else if (canFullscreen && !isFullscreen()) violate('FULLSCREEN_EXIT');
        else if (document.visibilityState === 'hidden' || !document.hasFocus()) violate('PAGE_HIDDEN');
      } else if (deferred && !conflictRef.current) {
        clearLockFlag(attemptId);
      }
      if (automatic) setAutoSubmitFailed(true);
      else toast.error('Topshirib bo‘lmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.');
    },
    [
      attemptId,
      canFullscreen,
      clientId,
      enforce,
      enterLocked,
      finish,
      persist,
      refreshState,
      serverNow,
      setConflictState,
      toast,
      violate,
    ],
  );

  // ------------------------------------------------------------ Hayotiy sikl
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(timer);
  }, [serverNow]);

  // Vaqt tugaganda avtomatik topshirish (server baribir o‘zi yakunlaydi).
  useEffect(() => {
    if (remainingMs <= 0 && !finishedRef.current && !conflict) void submit(true);
  }, [remainingMs, conflict, submit]);

  // Qayta yuklangan sahifa: serverga yetmagan to‘xtatish xabari avval yuboriladi (faqat bir marta).
  const reconciledOnMount = useRef(false);
  useEffect(() => {
    if (reconciledOnMount.current) return;
    reconciledOnMount.current = true;
    reconcile(
      {
        lock: initial.lock ? { reason: initial.lock.reason, lockedAt: Date.parse(initial.lock.lockedAt) } : null,
        lockCount: initial.lockCount,
      },
      true,
    );
  }, [initial, reconcile]);

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

  // Telefon/planshet ekrani o‘z-o‘zidan o‘chsa sahifa yashirinadi va test to‘xtab qoladi —
  // nazoratli testda ekran yakunlanguncha yoqiq ushlab turiladi.
  useScreenWakeLock(enforce && !ended);

  // Yurak urishi: odatda 20 soniyada, to‘xtatilganda — ruxsatni tez sezish uchun 3 soniyada.
  const waiting = mode === 'locked';
  useEffect(() => {
    const timer = setInterval(() => void refreshState(), waiting ? LOCKED_POLL_MS : HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [waiting, refreshState]);

  // Faol holatda: to‘liq ekrandan chiqish, boshqa tab/oyna/ilovaga o‘tish va sahifani yopish kuzatiladi.
  useEffect(() => {
    if (!enforce || mode !== 'active') return;
    if (canFullscreen && !isFullscreen()) {
      violate('FULLSCREEN_EXIT');
      return;
    }
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const onFullscreen = () => {
      if (canFullscreen && !isFullscreen()) violate('FULLSCREEN_EXIT');
    };
    const onVisibility = () => {
      // Testni to‘xtatgan chiqishni server “chetlatish” bilan birga sanaydi — qurilma uni qayta
      // qo‘shmaydi (aks holda o‘qituvchi ortiqcha “oynadan chiqish”ni ko‘radi).
      if (document.visibilityState === 'hidden' && violate('PAGE_HIDDEN')) focusLoss.current -= 1;
    };
    // Alt+Tab bilan boshqa ilovaga o‘tganda sahifa “ko‘rinib” qolishi mumkin — fokus tekshiriladi.
    const onBlur = () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!document.hasFocus()) violate('PAGE_HIDDEN');
      }, BLUR_GRACE_MS);
    };
    const onFocus = () => clearTimeout(blurTimer);
    const onPageHide = () => violate('PAGE_HIDDEN');
    const stopFullscreen = onFullscreenChange(onFullscreen);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    // Faol holatga o‘tganda oyna allaqachon fokusda bo‘lmasa ham tekshiriladi.
    if (!document.hasFocus()) onBlur();
    return () => {
      clearTimeout(blurTimer);
      stopFullscreen();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [enforce, mode, canFullscreen, violate]);

  // Kirish sahifasida to‘liq ekranga boshqa yo‘l bilan o‘tilsa ham test ochiladi.
  useEffect(() => {
    if (mode !== 'gate') return;
    return onFullscreenChange(() => {
      if (isFullscreen() && modeRef.current === 'gate') setMode('active');
    });
  }, [mode, setMode]);

  /** “To‘liq ekranda boshlash” / “Davom etish”: to‘liq ekran so‘rovi bosishning o‘zida yuboriladi. */
  const resume = () => {
    setFullscreenFailed(false);
    const proceed = () => {
      if (finishedRef.current) return;
      if (modeRef.current !== 'gate' && modeRef.current !== 'unlocked') return;
      setMode('active');
      void flush();
    };
    if (enforce && canFullscreen && !isFullscreen()) {
      enterFullscreen().then(proceed, () => setFullscreenFailed(true));
    } else {
      proceed();
    }
  };

  const takeover = async () => {
    // Yangi oynada to‘liq ekranga o‘tish ham shu bosish bilan so‘raladi.
    if (enforce && canFullscreen && modeRef.current === 'gate' && !isFullscreen()) {
      enterFullscreen().catch(() => undefined);
    }
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
      updateDeadline(Date.parse(view.deadlineAt));
      setConflictState(false);
      // Serverga yetmagan qoidabuzarlik endi javob yozayotgan shu oyna nomidan yuboriladi.
      const flag = loadLockFlag(attemptId);
      if (enforce && flag && flag.clientId !== clientId && unconfirmed(flag, view.lockCount)) {
        saveLockFlag(attemptId, { ...flag, clientId });
      }
      reconcile(
        {
          lock: view.lock ? { reason: view.lock.reason, lockedAt: Date.parse(view.lock.lockedAt) } : null,
          lockCount: view.lockCount,
        },
        true,
      );
      if (enforce && canFullscreen && modeRef.current === 'active' && !isFullscreen()) setMode('gate');
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
  const shownSaveState: SaveState = mode === 'locked' && pendingCount > 0 ? 'paused' : saveState;

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
          {enforce && (
            <span
              className="hidden items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 sm:inline-flex"
              title="Test to‘liq ekranda ishlanadi. Chiqilsa, test o‘qituvchi ruxsatigacha to‘xtatiladi."
            >
              <ShieldCheck className="size-3.5" aria-hidden />
              To‘liq ekran nazorati
            </span>
          )}
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
        <SaveIndicator state={shownSaveState} pending={pendingCount} />
      </header>

      {/* Ekran o‘quvchilar uchun muhim vaqt ogohlantirishlari */}
      <p className="sr-only" aria-live="assertive">
        {warning === 'critical'
          ? 'Bir daqiqadan kam vaqt qoldi.'
          : warning === 'soon'
            ? 'Besh daqiqadan kam vaqt qoldi.'
            : ''}
      </p>

      {mode === 'gate' ? (
        <FullscreenGate onStart={resume} failed={fullscreenFailed} />
      ) : mode === 'locked' ? (
        <LockedScreen
          reason={lockInfo?.reason ?? 'FULLSCREEN_EXIT'}
          lockedAt={lockInfo?.lockedAt ?? null}
          remainingMs={remainingMs}
          pending={pendingCount}
        />
      ) : mode === 'unlocked' ? (
        <UnlockedScreen
          addedMinutes={addedMinutes}
          needsFullscreen={enforce && canFullscreen}
          failed={fullscreenFailed}
          onResume={resume}
        />
      ) : (
        <>
          <main className="mx-auto max-w-4xl space-y-4 px-4 py-5">
            {enforce && (!canFullscreen || !canKeepAwake) && (
              <Alert tone="warning" title="To‘liq ekran nazorati">
                {!canFullscreen &&
                  'Bu qurilmada to‘liq ekran rejimi yo‘q — boshqa ilova yoki oynaga o‘tsangiz, test to‘xtatiladi. '}
                {!canKeepAwake &&
                  'Qurilma ekrani o‘chib qolsa ham test to‘xtatiladi — ekran avtomatik o‘chmasligi uchun unga vaqti-vaqti bilan teging.'}
              </Alert>
            )}
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
                          (conflict || finishing || remainingMs <= 0) && 'cursor-not-allowed opacity-70',
                        )}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option.id}
                          checked={selected}
                          onChange={() => choose(question, option.id)}
                          disabled={conflict || finishing || remainingMs <= 0}
                          className="mt-1 size-4 shrink-0"
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
                  className="mt-3 text-sm text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                  disabled={conflict || finishing}
                >
                  Javobni bekor qilish
                </button>
              )}
            </section>

            {allowBack ? (
              <nav aria-label="Savollar" className="rounded-xl border border-slate-200 bg-surface p-4">
                <p className="mb-3 text-xs font-medium text-slate-500">
                  Savollar: <span className="inline-block size-2.5 rounded-sm bg-brand-600 align-middle" /> javob
                  berilgan, <span className="inline-block size-2.5 rounded-sm border border-slate-300 align-middle" />{' '}
                  javobsiz
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
              {enforce
                ? 'Javoblar avtomatik saqlanadi. Vaqt server bo‘yicha hisoblanadi. To‘liq ekrandan chiqsangiz yoki boshqa oyna, tab yoki ilovaga o‘tsangiz, test avtomatik to‘xtatiladi va faqat o‘qituvchi ruxsati bilan davom etadi.'
                : 'Javoblar avtomatik saqlanadi. Vaqt server bo‘yicha hisoblanadi. Oynadan chiqish holatlari qayd etiladi, lekin bu avtomatik xulosa uchun asos emas.'}
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
        </>
      )}

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
          <MonitorSmartphone className="size-8 shrink-0 text-brand-700" aria-hidden />
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
    paused: {
      icon: <PauseCircle className="size-3.5" />,
      text: `Test to‘xtatilgan — ${pending} ta javob qurilmada saqlanib turibdi, ruxsat berilgach yuboriladi`,
      tone: 'text-amber-800 bg-amber-50',
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
