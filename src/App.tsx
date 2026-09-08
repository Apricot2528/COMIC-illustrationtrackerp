/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Task, ThemeConfig, CalendarSettings, DepositStatus, PlacedSticker, CustomStyleConfig } from './types';
import { THEMES } from './data/themes';
import { syncDeadlineToGoogleCalendar, syncMeetingToGoogleCalendar, deleteEventFromGoogleCalendar, syncTodoToGoogleCalendar, CALENDAR_SCOPES } from './utils/calendar';
import ProgressTable from './components/ProgressTable';
import CalendarPanel from './components/CalendarPanel';
import { HeaderClock } from './components/HeaderClock';
import { RefreshCw, Trash } from 'lucide-react';
import { Todo } from './types';

// Firebase authentication and storage engine
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, onSnapshot, getDocs, getDoc, setDoc, deleteDoc, doc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './utils/firebase';
import { toast } from './utils/toast';

// モーダル類とステッカー層は初期表示に不要なので遅延読み込みにする
const SettingModal = lazy(() => import('./components/SettingModal'));
const TaskFormModal = lazy(() => import('./components/TaskFormModal'));
const StickerOverlay = lazy(() => import('./components/StickerOverlay'));

const LOCAL_STORAGE_TASKS_KEY = 'manga_illust_tasks_v1';
const LOCAL_STORAGE_TODOS_KEY = 'manga_illust_todos_v1';
const LOCAL_STORAGE_THEME_KEY = 'manga_illust_theme_id_v1';
const LOCAL_STORAGE_CAL_KEY = 'manga_illust_calendar_v1';

// アクセストークンは端末の localStorage にだけ置き、Firestore には保存しない
const stripToken = (cs: CalendarSettings): CalendarSettings => ({ ...cs, accessToken: null, tokenExpiry: null });
const LOCAL_STORAGE_STYLE_KEY = 'manga_illust_custom_style_v1';

// 締切までの日数。時刻は切り捨てて日単位で数える
function daysUntil(dateStr: string): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// YYYY-MM-DD -> YYYY.MM.DD
function formatDot(dateStr: string): string {
  return dateStr ? dateStr.replace(/-/g, '.') : '—';
}

// YYYY-MM-DD -> MM.DD
function formatMd(dateStr: string): string {
  return dateStr ? dateStr.slice(5).replace('-', '.') : '';
}

// 残日数。8日以上は墨、7日以内は青竹字、当日は「本日締切」、超過は白抜き
function DaysLeft({ days }: { days: number }) {
  if (days < 0) return <span className="num tag tag-fill">超過 {Math.abs(days)}日</span>;
  if (days === 0) return <span className="num text-note text-accent">本日締切</span>;
  if (days <= 7) return <span className="num text-note text-accent">残 {days}日</span>;
  return <span className="num text-note">残 {days}日</span>;
}

// 入金の状態は色分けでなく文字で示す
function DepositTag({ status }: { status: DepositStatus }) {
  if (status === 'paid') return <span className="tag shrink-0">済</span>;
  if (status === 'unpaid') return <span className="tag tag-accent shrink-0">未</span>;
  return null;
}

// Hex color shade/brightness helper

// Sine wave buzzer sound for alarms
function playAlarmSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    
    // Play dual tone (charming notification chime)
    const playTone = (freq: number, startDelay: number, duration: number) => {
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + startDelay);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime + startDelay);
      gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + startDelay + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startDelay + duration);
      
      oscillator.start(audioCtx.currentTime + startDelay);
      oscillator.stop(audioCtx.currentTime + startDelay + duration);
    };

    // Tone 1: high chime
    playTone(880, 0, 0.4);
    // Tone 2: secondary sweet chime
    playTone(1046.5, 0.15, 0.6);
  } catch (e) {
    console.warn('AudioContext beep blocked by browser permission or unsupported:', e);
  }
}


export default function App() {
  // --- States ---
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTheme, setActiveTheme] = useState<ThemeConfig>(THEMES[0]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>({
    clientId: '210301309790-kg0bm152ltql8qadr0dmtr4srmcukdsa.apps.googleusercontent.com',
    apiKey: '',
    calendarId: 'primary',
    accessToken: null,
    tokenExpiry: null
  });

  // Google のアクセストークンは端末の localStorage にしか無い（Firestore には
  // 保存しない方針のため）。ログインの有無に関わらず、起動時に必ず読み戻す。
  // これを user の有無で分岐させると、ログイン中の再読み込みでトークンが
  // 失われ、カレンダー同期が黙って止まる。
  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_CAL_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      setCalendarSettings((prev) => ({
        ...prev,
        clientId: parsed.clientId || prev.clientId,
        apiKey: parsed.apiKey || '',
        calendarId: parsed.calendarId || 'primary',
        accessToken: parsed.accessToken || null,
        tokenExpiry: parsed.tokenExpiry || null,
      }));
    } catch (e) {
      console.error('Failed to parse calendar settings', e);
    }
  }, []);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingModalOpen, setIsSettingModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'manga' | 'illust'>('all');

  // --- TODO States ---
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDeadline, setNewTodoDeadline] = useState('');

  // --- Custom Style Configuration State ---
  // Firestore の customStyle は既存のキーをそのまま保つ（データ構造は変えない）。
  // ただし配色として実際に使うのは accentColor だけで、他は薄墨紙の固定値に揃えてある。
  const [customStyle, setCustomStyle] = useState<CustomStyleConfig>({
    useCustomColor: true,
    primaryColor: '#2F6B4F',
    accentColor: '#2F6B4F',
    bgColor: '#F4F5F3',
    sidebarColor: '#F4F5F3',
    subColor: '#838A80',
    textAccentColor: '#262A26',
    themePreset: 'pastel',
    headerBgUrl: '',
    deadlineCatUrl: '',
    showEmojis: false,
    showStickers: true,
    darkMode: false,
    dashboardTitle: ''
  });


  // --- active alarm trigger state ---
  const [activeAlarm, setActiveAlarm] = useState<{
    taskId: string;
    title: string;
    clientName: string;
    minutesLeft: number;
    timeString: string;
  } | null>(null);

  // userId を除き、キー順に依存しない指紋。Firestore から来た doc.data() と
  // ローカルのオブジェクトを同じ土俵で比較するために使う。
  const stickerFingerprint = (st: PlacedSticker): string => {
    const { userId: _userId, ...rest } = st as PlacedSticker & { userId?: string };
    return JSON.stringify(rest, Object.keys(rest).sort());
  };

  // --- Draggable Stickers State ---
  const [stickers, setStickers] = useState<PlacedSticker[]>([]);

  // ドラッグ中は毎フレーム onStickersChange が飛んでくるので、state だけ即時更新し、
  // 永続化（localStorage / Firestore）は 1 秒デバウンスで 1 回だけ行う。
  const STICKER_PERSIST_DEBOUNCE_MS = 1000;
  // 直近で保存済みのステッカー内容（id -> JSON）。こことの差分だけを書き込む。
  const persistedStickersRef = useRef<Map<string, string>>(new Map());
  const pendingStickersRef = useRef<PlacedSticker[] | null>(null);
  const stickerFlushTimerRef = useRef<number | null>(null);
  const userRef = useRef<FirebaseUser | null>(null);
  userRef.current = user;

  const flushStickers = useCallback(async () => {
    if (stickerFlushTimerRef.current !== null) {
      window.clearTimeout(stickerFlushTimerRef.current);
      stickerFlushTimerRef.current = null;
    }
    const updated = pendingStickersRef.current;
    if (!updated) return;
    pendingStickersRef.current = null;

    localStorage.setItem('manga_illust_stickers_v1', JSON.stringify(updated));

    const currentUser = userRef.current;
    if (!currentUser) {
      // 未ログイン時は localStorage のみ。次回ログイン時に差分判定できるよう記録は残す。
      persistedStickersRef.current = new Map(updated.map(st => [st.id, stickerFingerprint(st)]));
      return;
    }

    const previous = persistedStickersRef.current;
    const next = new Map<string, string>();
    for (const sticker of updated) next.set(sticker.id, stickerFingerprint(sticker));

    try {
      // 削除されたステッカー（直前の state との差分。getDocs は不要）
      for (const id of previous.keys()) {
        if (!next.has(id)) {
          await deleteDoc(doc(db, 'stickers', id));
        }
      }

      // 追加・変更のあったステッカーのみ書き込む
      for (const sticker of updated) {
        if (previous.get(sticker.id) === next.get(sticker.id)) continue;
        await setDoc(doc(db, 'stickers', sticker.id), { ...sticker, userId: currentUser.uid });
      }

      persistedStickersRef.current = next;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'stickers');
    }
  }, []);

  const handleStickersChange = useCallback((updated: PlacedSticker[]) => {
    setStickers(updated);
    pendingStickersRef.current = updated;
    if (stickerFlushTimerRef.current !== null) {
      window.clearTimeout(stickerFlushTimerRef.current);
    }
    stickerFlushTimerRef.current = window.setTimeout(() => {
      stickerFlushTimerRef.current = null;
      void flushStickers();
    }, STICKER_PERSIST_DEBOUNCE_MS);
  }, [flushStickers]);

  // ドラッグ終了・離脱時には待たずに書き出す
  useEffect(() => {
    const flushNow = () => { void flushStickers(); };
    window.addEventListener('mouseup', flushNow);
    window.addEventListener('touchend', flushNow);
    window.addEventListener('beforeunload', flushNow);
    return () => {
      window.removeEventListener('mouseup', flushNow);
      window.removeEventListener('touchend', flushNow);
      window.removeEventListener('beforeunload', flushNow);
      void flushStickers();
    };
  }, [flushStickers]);

  // --- Google Authentication state observer ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Prepare migration state if we have local data keys in localStorage
        const localTasksStr = localStorage.getItem(LOCAL_STORAGE_TASKS_KEY);
        const localTodosStr = localStorage.getItem(LOCAL_STORAGE_TODOS_KEY);
        const localStickersStr = localStorage.getItem('manga_illust_stickers_v1');
        
        let hasLocalTasks = false;
        let hasLocalTodos = false;
        let hasLocalStickers = false;
        
        try {
          if (localTasksStr) {
            const parsed = JSON.parse(localTasksStr);
            hasLocalTasks = Array.isArray(parsed) && parsed.length > 0;
          }
        } catch (_) {}
        
        try {
          if (localTodosStr) {
            const parsed = JSON.parse(localTodosStr);
            hasLocalTodos = Array.isArray(parsed) && parsed.length > 0;
          }
        } catch (_) {}
        
        try {
          if (localStickersStr) {
            const parsed = JSON.parse(localStickersStr);
            hasLocalStickers = Array.isArray(parsed) && parsed.length > 0;
          }
        } catch (_) {}
        
        if (hasLocalTasks || hasLocalTodos || hasLocalStickers) {
          setIsMigrating(true);
        }
      }
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // --- Real-time Sync for Tasks ---
  useEffect(() => {
    if (!user) {
      const storedTasksStr = localStorage.getItem(LOCAL_STORAGE_TASKS_KEY);
      if (storedTasksStr) {
        try {
          const parsed = JSON.parse(storedTasksStr) as Task[];
          let modified = false;
          const usedIds = new Set<string>();
          const healedTasks = parsed.map((t) => {
            let healedId = t.id;
            const isInvalid = !healedId || healedId === 'undefined' || healedId === 'null';
            if (isInvalid || usedIds.has(healedId)) {
              healedId = Math.random().toString(36).substring(2, 9);
              modified = true;
            }
            usedIds.add(healedId);
            return { ...t, id: healedId };
          });
          setTasks(healedTasks);
          if (modified) {
            localStorage.setItem(LOCAL_STORAGE_TASKS_KEY, JSON.stringify(healedTasks));
          }
        } catch (e) {
          console.error('Failed to parse tasks from localStorage', e);
        }
      } else {
        setTasks([]);
      }
      return;
    }

    if (isMigrating) return;

    const q = query(collection(db, 'tasks'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedTasks: Task[] = [];
      snapshot.forEach((doc) => {
        loadedTasks.push(doc.data() as Task);
      });
      loadedTasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTasks(loadedTasks);
    }, (error) => {
      console.warn('Firestore real-time sync error for tasks (retrying/reconnecting):', error.message || error);
    });

    return () => unsubscribe();
  }, [user, isMigrating]);

  // --- Real-time Sync for Todos ---
  useEffect(() => {
    if (!user) {
      const storedTodosStr = localStorage.getItem(LOCAL_STORAGE_TODOS_KEY);
      if (storedTodosStr) {
        try {
          setTodos(JSON.parse(storedTodosStr) as Todo[]);
        } catch (e) {
          console.error('Failed to parse todos from localStorage', e);
        }
      } else {
        setTodos([]);
      }
      return;
    }

    if (isMigrating) return;

    const q = query(collection(db, 'todos'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedTodos: Todo[] = [];
      snapshot.forEach((doc) => {
        loadedTodos.push(doc.data() as Todo);
      });
      loadedTodos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTodos(loadedTodos);
    }, (error) => {
      console.warn('Firestore real-time sync error for todos (retrying/reconnecting):', error.message || error);
    });

    return () => unsubscribe();
  }, [user, isMigrating]);

  // --- Real-time Sync for Placed Stickers ---
  useEffect(() => {
    if (!user) {
      const storedStickersStr = localStorage.getItem('manga_illust_stickers_v1');
      if (storedStickersStr) {
        try {
          setStickers(JSON.parse(storedStickersStr) as PlacedSticker[]);
        } catch (e) {
          console.error('Failed to parse stickers from localStorage', e);
        }
      } else {
        setStickers([]);
      }
      return;
    }

    if (isMigrating) return;

    const q = query(collection(db, 'stickers'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedStickers: PlacedSticker[] = [];
      snapshot.forEach((doc) => {
        loadedStickers.push(doc.data() as PlacedSticker);
      });
      setStickers(loadedStickers);
      // クラウドの内容＝保存済みとして記録。これが差分書き込みの基準になる。
      // ローカルで編集中（デバウンス待ち）の分は上書きしない。
      if (!pendingStickersRef.current) {
        persistedStickersRef.current = new Map(loadedStickers.map(st => [st.id, stickerFingerprint(st)]));
      }
    }, (error) => {
      console.warn('Firestore real-time sync error for stickers (retrying/reconnecting):', error.message || error);
    });

    return () => unsubscribe();
  }, [user, isMigrating]);

  // --- Real-time Sync for User configs ---
  useEffect(() => {
    if (!user) {
      const storedStyleStr = localStorage.getItem(LOCAL_STORAGE_STYLE_KEY);
      if (storedStyleStr) {
        try {
          const parsed = JSON.parse(storedStyleStr);
          setCustomStyle(prev => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error('Failed to parse custom styles from localStorage', e);
        }
      }
      const storedThemeId = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
      if (storedThemeId) {
        const match = THEMES.find(t => t.id === storedThemeId);
        if (match) setActiveTheme(match);
      }
      return;
    }

    if (isMigrating) return;

    // ユーザーが変わったら存在フラグを引き継がない
    userConfigExistsRef.current = false;

    const configDocRef = doc(db, 'userConfigs', user.uid);
    const unsubscribe = onSnapshot(configDocRef, (snap) => {
      userConfigExistsRef.current = snap.exists();
      if (snap.exists()) {
        const data = snap.data();
        if (data.customStyle) {
          setCustomStyle(prev => ({ ...prev, ...data.customStyle }));
        }
        if (data.activeThemeId) {
          const match = THEMES.find(t => t.id === data.activeThemeId);
          if (match) setActiveTheme(match);
        }
        if (data.calendarSettings?.calendarId) {
          setCalendarSettings(prev => ({ ...prev, calendarId: data.calendarSettings.calendarId }));
        }
      }
    }, (error) => {
      console.warn('Firestore real-time sync error for userConfigs (retrying/reconnecting):', error.message || error);
    });

    return () => unsubscribe();
  }, [user, isMigrating]);

  // --- One-Time Cloud Migration on Sign-In ---
  useEffect(() => {
    if (!user) {
      setIsMigrating(false);
      return;
    }

    const migrateLocalDataToCloud = async () => {
      let migratedTasksCount = 0;
      let migratedTodosCount = 0;
      let migratedStickersCount = 0;
      let hasMigratedAny = false;

      // Determine if there is indeed any local data
      const localTasksStr = localStorage.getItem(LOCAL_STORAGE_TASKS_KEY);
      const localTodosStr = localStorage.getItem(LOCAL_STORAGE_TODOS_KEY);
      const localStickersStr = localStorage.getItem('manga_illust_stickers_v1');

      let hasLocalTasks = false;
      let hasLocalTodos = false;
      let hasLocalStickers = false;

      try {
        if (localTasksStr) {
          const parsed = JSON.parse(localTasksStr);
          hasLocalTasks = Array.isArray(parsed) && parsed.length > 0;
        }
      } catch (_) {}

      try {
        if (localTodosStr) {
          const parsed = JSON.parse(localTodosStr);
          hasLocalTodos = Array.isArray(parsed) && parsed.length > 0;
        }
      } catch (_) {}

      try {
        if (localStickersStr) {
          const parsed = JSON.parse(localStickersStr);
          hasLocalStickers = Array.isArray(parsed) && parsed.length > 0;
        }
      } catch (_) {}

      if (!hasLocalTasks && !hasLocalTodos && !hasLocalStickers) {
        setIsMigrating(false);
        return;
      }

      setIsMigrating(true);

      try {
        // 1. Migrate tasks
        if (localTasksStr) {
          const localTasks = JSON.parse(localTasksStr) as Task[];
          if (localTasks.length > 0) {
            // Get existing cloud task ids
            const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', user.uid));
            const snapshot = await getDocs(tasksQuery);
            const cloudTaskIds = new Set(snapshot.docs.map(doc => doc.id));

            const migratedTasks: Task[] = [];

            for (const task of localTasks) {
              if (!task.id) continue;
              // Only migrate if not already in cloud to prevent duplicates
              if (!cloudTaskIds.has(task.id)) {
                const taskDocRef = doc(db, 'tasks', task.id);
                // Schema Healing - Ensure all required keys exist to satisfy Firestore Rules isValidTask
                const healedTask = {
                  id: task.id,
                  type: task.type || 'manga',
                  title: task.title || '無題の作品',
                  clientName: task.clientName || '',
                  depositStatus: task.depositStatus || 'unpaid',
                  deadline: task.deadline || '',
                  totalPages: typeof task.totalPages === 'number' ? task.totalPages : 1,
                  steps: task.steps || {},
                  notes: task.notes || '',
                  createdAt: task.createdAt || new Date().toISOString(),
                  userId: user.uid,
                  calendarEventId: task.calendarEventId || '',
                  meetingEventId: task.meetingEventId || '',
                  meetingDate: task.meetingDate || '',
                  updatedAt: task.updatedAt || new Date().toISOString()
                };
                await setDoc(taskDocRef, healedTask);
                migratedTasksCount++;
                hasMigratedAny = true;
                migratedTasks.push(healedTask);
              }
            }
            if (migratedTasks.length > 0) {
              setTasks(prev => {
                const existingIds = new Set(prev.map(t => t.id));
                const next = [...prev];
                for (const t of migratedTasks) {
                  if (!existingIds.has(t.id)) {
                    next.push(t);
                  }
                }
                return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              });
            }
            // Clear storage if all processed
            localStorage.removeItem(LOCAL_STORAGE_TASKS_KEY);
          }
        }

        // 2. Migrate todos
        if (localTodosStr) {
          const localTodos = JSON.parse(localTodosStr) as Todo[];
          if (localTodos.length > 0) {
            // Get existing cloud todo ids
            const todosQuery = query(collection(db, 'todos'), where('userId', '==', user.uid));
            const snapshot = await getDocs(todosQuery);
            const cloudTodoIds = new Set(snapshot.docs.map(doc => doc.id));

            const migratedTodos: Todo[] = [];

            for (const todo of localTodos) {
              if (!todo.id) continue;
              if (!cloudTodoIds.has(todo.id)) {
                const todoDocRef = doc(db, 'todos', todo.id);
                // Schema Healing - Ensure all required keys exist for isValidTodo
                const healedTodo = {
                  id: todo.id,
                  title: todo.title || '無題のタスク',
                  completed: typeof todo.completed === 'boolean' ? todo.completed : false,
                  deadline: todo.deadline || '',
                  calendarEventId: todo.calendarEventId || '',
                  createdAt: todo.createdAt || new Date().toISOString(),
                  userId: user.uid,
                  updatedAt: todo.updatedAt || new Date().toISOString()
                };
                await setDoc(todoDocRef, healedTodo);
                migratedTodosCount++;
                hasMigratedAny = true;
                migratedTodos.push(healedTodo);
              }
            }
            if (migratedTodos.length > 0) {
              setTodos(prev => {
                const existingIds = new Set(prev.map(t => t.id));
                const next = [...prev];
                for (const t of migratedTodos) {
                  if (!existingIds.has(t.id)) {
                    next.push(t);
                  }
                }
                return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              });
            }
            localStorage.removeItem(LOCAL_STORAGE_TODOS_KEY);
          }
        }

        // 3. Migrate stickers
        if (localStickersStr) {
          const localStickers = JSON.parse(localStickersStr) as PlacedSticker[];
          if (localStickers.length > 0) {
            // Get existing cloud sticker ids
            const stickersQuery = query(collection(db, 'stickers'), where('userId', '==', user.uid));
            const snapshot = await getDocs(stickersQuery);
            const cloudStickerIds = new Set(snapshot.docs.map(doc => doc.id));

            const migratedStickers: PlacedSticker[] = [];

            for (const sticker of localStickers) {
              if (!sticker.id) continue;
              if (!cloudStickerIds.has(sticker.id)) {
                const stickerDocRef = doc(db, 'stickers', sticker.id);
                // Schema Healing - Ensure all required keys exist for isValidSticker
                const healedSticker = {
                  id: sticker.id,
                  type: sticker.type || 'emoji',
                  imgUrl: sticker.imgUrl || '',
                  emoji: sticker.emoji || '',
                  x: typeof sticker.x === 'number' ? sticker.x : 100,
                  y: typeof sticker.y === 'number' ? sticker.y : 100,
                  rotate: typeof sticker.rotate === 'number' ? sticker.rotate : 0,
                  scale: typeof sticker.scale === 'number' ? sticker.scale : 1,
                  containerId: sticker.containerId || 'default',
                  userId: user.uid
                };
                await setDoc(stickerDocRef, healedSticker);
                migratedStickersCount++;
                hasMigratedAny = true;
                migratedStickers.push(healedSticker);
              }
            }
            if (migratedStickers.length > 0) {
              setStickers(prev => {
                const existingIds = new Set(prev.map(s => s.id));
                const next = [...prev];
                for (const s of migratedStickers) {
                  if (!existingIds.has(s.id)) {
                    next.push(s);
                  }
                }
                return next;
              });
            }
            localStorage.removeItem('manga_illust_stickers_v1');
          }
        }

        // 4. Migrate configurations
        const configDocRef = doc(db, 'userConfigs', user.uid);
        const configSnap = await getDoc(configDocRef);
        if (!configSnap.exists()) {
          const localStyleStr = localStorage.getItem(LOCAL_STORAGE_STYLE_KEY);
          const localThemeId = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
          const localCalStr = localStorage.getItem(LOCAL_STORAGE_CAL_KEY);

          const customStyleParsed = localStyleStr ? JSON.parse(localStyleStr) : customStyle;
          const activeThemeId = localThemeId || 'pastel';
          const calendarSettingsParsed = localCalStr ? JSON.parse(localCalStr) : calendarSettings;

          const activeThemeObject = THEMES.find(t => t.id === activeThemeId) || activeTheme;

          await setDoc(configDocRef, {
            userId: user.uid,
            customStyle: customStyleParsed,
            activeThemeId,
            calendarSettings: stripToken(calendarSettingsParsed)
          });

          // Instantly update states to reflect local preference config
          setCustomStyle(prev => ({ ...prev, ...customStyleParsed }));
          setActiveTheme(activeThemeObject);
          setCalendarSettings(calendarSettingsParsed);
        }

        if (hasMigratedAny) {
          toast(`Googleにログインしました。この端末のデータをクラウドへ移しました\n（タスク: ${migratedTasksCount}件、TODO: ${migratedTodosCount}件、ステッカー: ${migratedStickersCount}件）`, 'success');
        }
      } catch (e) {
        console.error('Error during cloud migration on login:', e);
      } finally {
        setIsMigrating(false);
      }
    };

    migrateLocalDataToCloud();
  }, [user]);


  // --- Real-Time Background Meeting Checker & Alarm Chime ---
  // 打合せタスクが 1 件も無い間はタイマーを動かさない。
  const meetingTasks = useMemo(
    () => tasks.filter((task) => task.type === 'meeting' && task.meetingDate),
    [tasks]
  );
  // 打合せの顔ぶれ・日時が変わった時だけタイマーを張り直す
  // （進捗率の更新など無関係な編集で再起動しないように）
  const meetingSignature = meetingTasks.map((t) => `${t.id}@${t.meetingDate}`).join('|');
  const meetingTasksRef = useRef(meetingTasks);
  meetingTasksRef.current = meetingTasks;

  useEffect(() => {
    if (!meetingSignature) return;

    const check = () => {
      const now = new Date();
      meetingTasksRef.current.forEach((task) => {
        const mDate = new Date(task.meetingDate as string);
        const diffMs = mDate.getTime() - now.getTime();
        // Convert difference into rounded minutes
        const diffMins = Math.round(diffMs / 60000);

        // We trigger alarm alert popup for 10 or 5 minutes remaining.
        // 分に丸めているので該当する状態は 60 秒続く。30 秒間隔なら取りこぼさない。
        if (diffMins === 5 || diffMins === 10) {
          const cacheKey = `meeting_alarm_alert_${task.id}_${diffMins}`;
          const alreadyTriggered = sessionStorage.getItem(cacheKey);
          if (!alreadyTriggered) {
            sessionStorage.setItem(cacheKey, 'true');
            setActiveAlarm({
              taskId: task.id,
              title: task.title,
              clientName: task.clientName || '（打ち合わせ先）',
              minutesLeft: diffMins,
              timeString: mDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            });
            playAlarmSound();
          }
        }
      });
    };

    check(); // 読み込み直後の取りこぼしを防ぐ
    const timer = setInterval(check, 30000);

    return () => clearInterval(timer);
  }, [meetingSignature]);


  // --- Google Sign-In & Sign-Out handlers ---
  // Google ログイン ＝ カレンダー接続。Firebase Auth の Google プロバイダに
  // カレンダーのスコープを乗せ、返ってきた OAuth アクセストークンを保持する。
  const connectGoogle = async (silent = false): Promise<string | null> => {
    const provider = new GoogleAuthProvider();
    CALENDAR_SCOPES.forEach(scope => provider.addScope(scope));
    if (auth.currentUser?.email) {
      provider.setCustomParameters({ login_hint: auth.currentUser.email });
    }
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken || null;
      const updated: CalendarSettings = {
        ...calendarSettings,
        accessToken,
        tokenExpiry: accessToken ? Date.now() + 55 * 60 * 1000 : null
      };
      setCalendarSettings(updated);
      localStorage.setItem(LOCAL_STORAGE_CAL_KEY, JSON.stringify(updated));
      if (!silent) {
        toast(accessToken ? 'Googleでログインし、カレンダーに接続しました' : 'Googleでログインしました', 'success');
      }
      return accessToken;
    } catch (err) {
      console.error("Sign in failed:", err);
      if (!silent) {
        toast("Googleサインインに失敗しました。詳細: " + (err instanceof Error ? err.message : String(err)), 'error');
      }
      return null;
    }
  };

  // 有効なアクセストークンを返す。期限切れならポップアップで取り直す。
  const ensureCalendarToken = async (): Promise<string | null> => {
    const valid = calendarSettings.accessToken && calendarSettings.tokenExpiry && calendarSettings.tokenExpiry > Date.now() + 60 * 1000;
    if (valid) return calendarSettings.accessToken;
    return await connectGoogle(true);
  };

  const handleGoogleSignIn = async () => {
    await connectGoogle();
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOut(auth);
      toast('ログアウトしました');
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  // userConfigs ドキュメントが既に存在するか（差分更新できるかの判定に使う）
  const userConfigExistsRef = useRef(false);

  // --- Sync user-level configurations to Firestore ---
  const updateUserConfig = async (
    style?: CustomStyleConfig,
    themeId?: string,
    calSettings?: CalendarSettings
  ) => {
    if (!user) return;
    try {
      const configDocRef = doc(db, 'userConfigs', user.uid);

      // firestore.rules の isValidUserConfig は 4 つのキーが揃っていることを
      // create / update 双方で要求する。merge 更新の場合 request.resource.data は
      // 「マージ後のドキュメント」なので、既存ドキュメントに対してなら
      // 差分だけ送っても検証を通る。まだ作られていない時だけ全体を書く。
      if (!userConfigExistsRef.current) {
        await setDoc(configDocRef, {
          userId: user.uid,
          customStyle: style || customStyle,
          activeThemeId: themeId || activeTheme.id,
          calendarSettings: stripToken(calSettings || calendarSettings)
        }, { merge: true });
        userConfigExistsRef.current = true;
        return;
      }

      // 変更のあったフィールドだけ送る。customStyle には base64 のヘッダー画像が
      // 入るので、テーマ変更のたびに丸ごと送ると通信量が大きくなる。
      const payload: Record<string, unknown> = { userId: user.uid };
      if (style !== undefined) payload.customStyle = style;
      if (themeId !== undefined) payload.activeThemeId = themeId;
      if (calSettings !== undefined) payload.calendarSettings = stripToken(calSettings);

      // userId しか無い＝更新対象が無い
      if (Object.keys(payload).length === 1) return;

      await setDoc(configDocRef, payload, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `userConfigs/${user.uid}`);
    }
  };

  // --- Calendar state save ---
  const handleCalendarSettingsChange = (newSettings: CalendarSettings) => {
    setCalendarSettings(newSettings);
    localStorage.setItem(LOCAL_STORAGE_CAL_KEY, JSON.stringify(newSettings));
    if (user) {
      updateUserConfig(undefined, undefined, newSettings);
    }
  };

  // --- Google Sign-Out ---
  const handleLogout = () => {
    if (window.confirm('Googleカレンダーの連携を解除して、カレンダーからサインアウトしますか？')) {
      const reset = {
        ...calendarSettings,
        accessToken: null,
        tokenExpiry: null
      };
      setCalendarSettings(reset);
      localStorage.setItem(LOCAL_STORAGE_CAL_KEY, JSON.stringify(reset));
      if (user) {
        updateUserConfig(undefined, undefined, reset);
      }
      toast('ログアウトしました');
    }
  };

  // --- Toggle progress step grid cell ---
  const handleToggleCell = async (taskId: string, stepName: string, pageIndex: number) => {
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        const stepPages = [...(t.steps[stepName] || [])];
        const prevValue = stepPages[pageIndex] || false;
        stepPages[pageIndex] = !prevValue;

        // Check if this action triggers 100% completion in the task
        const newSteps = {
          ...t.steps,
          [stepName]: stepPages
        };

        const totalSteps = t.type === 'manga' 
          ? ['ネーム', '下書き', '線画', '仕上げ'].length * t.totalPages
          : ['ラフ', '下書き', '線画', '着色', '仕上げ'].length * t.totalPages;

        let checkedCount = 0;
        const activeStepsList = t.type === 'manga' 
          ? ['ネーム', '下書き', '線画', '仕上げ'] 
          : ['ラフ', '下書き', '線画', '着色', '仕上げ'];

        activeStepsList.forEach((st) => {
          (newSteps[st] || []).forEach((v) => { if (v) checkedCount++; });
        });

        // If newly completed to 100%
        if (checkedCount === totalSteps && prevValue === false) {
          // Play a slight celebratory alert message shortly
          setTimeout(() => {
            toast(`「${t.title}」が100%完了しました\nお疲れさまでした`, 'success');
          }, 150);
        }

        return {
          ...t,
          steps: newSteps
        };
      }
      return t;
    });

    setTasks(updated);
    localStorage.setItem(LOCAL_STORAGE_TASKS_KEY, JSON.stringify(updated));

    if (user) {
      const targetTask = updated.find(t => t.id === taskId);
      if (targetTask) {
        try {
          await setDoc(doc(db, 'tasks', taskId), { ...targetTask, userId: user.uid });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `tasks/${taskId}`);
        }
      }
    }
  };

  // --- Save / Create Task ---
  const handleSaveTask = async (formData: Omit<Task, 'id' | 'createdAt' | 'steps'> & { id?: string }) => {
    let updatedTasks: Task[] = [];
    const isNew = !formData.id;
    let savedTask: Task;

    if (isNew) {
      // 1. Initialise blank 2D progress steps for all pages
      const blankSteps: { [key: string]: boolean[] } = {};
      const stepsListNormalized = formData.type === 'manga'
        ? ['ネーム', '下書き', '線画', '仕上げ']
        : ['ラフ', '下書き', '線画', '着色', '仕上げ'];

      stepsListNormalized.forEach((step) => {
        blankSteps[step] = Array(formData.totalPages).fill(false);
      });

      savedTask = {
        ...formData,
        id: Math.random().toString(36).substring(2, 9),
        steps: blankSteps,
        createdAt: new Date().toISOString()
      };

      updatedTasks = [savedTask, ...tasks];
    } else {
      // 2. Editing existing
      let foundTask: Task | undefined;
      updatedTasks = tasks.map((t) => {
        if (t.id === formData.id) {
          const totalPagesChanged = t.totalPages !== formData.totalPages || t.type !== formData.type;
          let steps = t.steps;

          if (totalPagesChanged) {
            // Re-initialise steps based on new pages / type
            const blankSteps: { [key: string]: boolean[] } = {};
            const stepsListNormalized = formData.type === 'manga'
              ? ['ネーム', '下書き', '線画', '仕上げ']
              : ['ラフ', '下書き', '線画', '着色', '仕上げ'];

            stepsListNormalized.forEach((step) => {
              // Preserve old checks up to shorter index limit
              const oldChecks = t.steps[step] || [];
              const newChecks = Array(formData.totalPages).fill(false);
              for (let i = 0; i < Math.min(oldChecks.length, newChecks.length); i++) {
                newChecks[i] = oldChecks[i];
              }
              blankSteps[step] = newChecks;
            });
            steps = blankSteps;
          }

          foundTask = {
            ...t,
            ...formData,
            steps
          };
          return foundTask;
        }
        return t;
      });

      if (!foundTask) return;
      savedTask = foundTask;
    }

    // 同期的に最速でローカルに確実に状態を保存
    setTasks(updatedTasks);
    localStorage.setItem(LOCAL_STORAGE_TASKS_KEY, JSON.stringify(updatedTasks));
    setSelectedTaskId(savedTask.id);
    setEditingTask(null);

    // Save to Cloud Firestore if logged in
    if (user) {
      try {
        await setDoc(doc(db, 'tasks', savedTask.id), { ...savedTask, userId: user.uid });
      } catch (e) {
        handleFirestoreError(e, isNew ? OperationType.CREATE : OperationType.UPDATE, `tasks/${savedTask.id}`);
      }
    }

    // Google Calendarとの非同期連動
    if (calendarSettings.accessToken) {
      toast(isNew ? '案件を保存しました。Googleカレンダーへ同期します' : '案件を保存しました。カレンダーの同期情報を更新します');
      await doSyncToGoogle(savedTask, updatedTasks);
    } else {
      toast(
        (isNew ? '案件を登録しました' : '案件を更新しました') +
          '（Googleカレンダーは未接続のため同期していません）',
        'success'
      );
    }
  };

  // --- Actual Sync operation to Google Cloud ---
  const doSyncToGoogle = async (task: Task, currentTasks: Task[]) => {
    const accessToken = await ensureCalendarToken();
    if (!accessToken) {
      toast('Googleカレンダーに接続できませんでした。設定からログインし直してください', 'error');
      return;
    }

    try {
      // 1. Sync Deadline Event
      const deadlineEventId = await syncDeadlineToGoogleCalendar(
        task,
        accessToken,
        calendarSettings.calendarId
      );

      // 2. Sync Meeting Event if date selected
      let meetingEventId = undefined;
      if (task.meetingDate) {
        meetingEventId = await syncMeetingToGoogleCalendar(
          task,
          accessToken,
          calendarSettings.calendarId
        );
      }

      // 3. Update local task with Google Calendar Event IDs
      const finalTasks = currentTasks.map((t) => {
        if (t.id === task.id) {
          return {
            ...t,
            calendarEventId: deadlineEventId || t.calendarEventId,
            meetingEventId: meetingEventId || t.meetingEventId
          };
        }
        return t;
      });

      setTasks(finalTasks);
      localStorage.setItem(LOCAL_STORAGE_TASKS_KEY, JSON.stringify(finalTasks));

      if (user) {
        const targetTask = finalTasks.find(t => t.id === task.id);
        if (targetTask) {
          try {
            await setDoc(doc(db, 'tasks', task.id), { ...targetTask, userId: user.uid });
          } catch (e) {
            handleFirestoreError(e, OperationType.UPDATE, `tasks/${task.id}`);
          }
        }
      }

      toast('Googleカレンダーへの登録・同期が完了しました', 'success');
    } catch (err) {
      console.error(err);
      toast('Googleカレンダーの登録に一部失敗しました。設定からログインし直してください', 'error');
    }
  };

  // --- Manual Sync triggering ---
  const handleManualSync = async (task: Task) => {
    await doSyncToGoogle(task, tasks);
  };

  // --- Delete Task ---
  const handleDeleteTask = async (taskId: string) => {
    const target = tasks.find(t => t.id === taskId);
    if (!target) return;

    const confirmed = window.confirm(`本当に「${target.title}」を削除しますか？\n(進行状況や詳細メモはすべて消去されます)`);
    if (!confirmed) return;

    // Delete connected Google calendar events if they exist
    if (calendarSettings.accessToken) {
      if (target.calendarEventId) {
        try {
          await deleteEventFromGoogleCalendar(
            target.calendarEventId,
            calendarSettings.accessToken,
            calendarSettings.calendarId
          );
        } catch (e) {
          console.warn('Failed to delete calendar deadline event:', e);
        }
      }
      if (target.meetingEventId) {
        try {
          await deleteEventFromGoogleCalendar(
            target.meetingEventId,
            calendarSettings.accessToken,
            calendarSettings.calendarId
          );
        } catch (e) {
          console.warn('Failed to delete calendar meeting event:', e);
        }
      }
    }

    const filtered = tasks.filter(t => t.id !== taskId);
    setTasks(filtered);
    localStorage.setItem(LOCAL_STORAGE_TASKS_KEY, JSON.stringify(filtered));

    if (user) {
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `tasks/${taskId}`);
      }
    }

    // Deselect
    if (selectedTaskId === taskId) {
      setSelectedTaskId(filtered.length > 0 ? filtered[0].id : null);
    }
    toast('案件を削除しました');
  };

  // --- TODO Handlers ---
  const handleAddTodo = async (todoTitle: string, todoDeadline?: string) => {
    if (!todoTitle.trim()) return;

    const newTodo: Todo = {
      id: Math.random().toString(36).substring(2, 9),
      title: todoTitle,
      completed: false,
      deadline: todoDeadline || undefined,
      createdAt: new Date().toISOString()
    };

    let finalTodo = newTodo;
    if (todoDeadline && calendarSettings.accessToken) {
      try {
        const token = await ensureCalendarToken();
        const calEventId = token ? await syncTodoToGoogleCalendar(newTodo, token, calendarSettings.calendarId) : undefined;
        if (calEventId) {
          finalTodo.calendarEventId = calEventId;
        }
      } catch (err) {
        console.error('Failed to sync todo to Google Calendar during creation', err);
      }
    }

    const updated = [finalTodo, ...todos];
    setTodos(updated);
    localStorage.setItem(LOCAL_STORAGE_TODOS_KEY, JSON.stringify(updated));

    if (user) {
      try {
        await setDoc(doc(db, 'todos', finalTodo.id), { ...finalTodo, userId: user.uid });
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `todos/${finalTodo.id}`);
      }
    }

    toast('TODOを追加しました', 'success');
  };

  const handleToggleTodo = async (todoId: string) => {
    const updated = todos.map((t) => {
      if (t.id === todoId) {
        return {
          ...t,
          completed: !t.completed
        };
      }
      return t;
    });

    setTodos(updated);
    localStorage.setItem(LOCAL_STORAGE_TODOS_KEY, JSON.stringify(updated));

    if (user) {
      const targetTodo = updated.find(t => t.id === todoId);
      if (targetTodo) {
        try {
          await setDoc(doc(db, 'todos', todoId), { ...targetTodo, userId: user.uid });
        } catch (e) {
          handleFirestoreError(e, OperationType.UPDATE, `todos/${todoId}`);
        }
      }
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    const target = todos.find(t => t.id === todoId);
    if (!target) return;

    if (calendarSettings.accessToken && target.calendarEventId) {
      try {
        await deleteEventFromGoogleCalendar(target.calendarEventId, calendarSettings.accessToken, calendarSettings.calendarId);
      } catch (e) {
        console.warn('Failed to delete todo calendar event:', e);
      }
    }

    const filtered = todos.filter(t => t.id !== todoId);
    setTodos(filtered);
    localStorage.setItem(LOCAL_STORAGE_TODOS_KEY, JSON.stringify(filtered));

    if (user) {
      try {
        await deleteDoc(doc(db, 'todos', todoId));
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, `todos/${todoId}`);
      }
    }
  };

  const handleSyncTodoEvent = async (todo: Todo) => {
    if (!calendarSettings.accessToken) {
      toast('Googleカレンダーに接続していません。設定から接続してください', 'error');
      return;
    }
    if (!todo.deadline) {
      toast('そのTODOには期限が設定されていません', 'error');
      return;
    }

    try {
      const token = await ensureCalendarToken();
      if (!token) return;
      const calEventId = await syncTodoToGoogleCalendar(todo, token, calendarSettings.calendarId);
      if (calEventId) {
        const updated = todos.map(t => t.id === todo.id ? { ...t, calendarEventId: calEventId } : t);
        setTodos(updated);
        localStorage.setItem(LOCAL_STORAGE_TODOS_KEY, JSON.stringify(updated));

        if (user) {
          const targetTodo = updated.find(t => t.id === todo.id);
          if (targetTodo) {
            try {
              await setDoc(doc(db, 'todos', todo.id), { ...targetTodo, userId: user.uid });
            } catch (e) {
              handleFirestoreError(e, OperationType.UPDATE, `todos/${todo.id}`);
            }
          }
        }

        toast('TODOをGoogleカレンダーに登録しました', 'success');
      }
    } catch (e) {
      toast('カレンダーへの登録に失敗しました', 'error');
    }
  };

  // --- Calculate Task Progress Rate for Sidebar Lists ---
  const getTaskProgressPercentage = (task: Task) => {
    const stepsList = task.type === 'manga'
      ? ['ネーム', '下書き', '線画', '仕上げ']
      : task.type === 'illust'
        ? ['ラフ', '下書き', '線画', '着色', '仕上げ']
        : ['事前準備', 'ラフ・資料提示', '日程・見積調整', '決定事項メモ', 'お礼・共有'];

    const itemsPerStep = task.type === 'manga' ? task.totalPages : 1;
    let checked = 0;
    const total = stepsList.length * itemsPerStep;

    stepsList.forEach((step) => {
      const pageStates = task.steps[step];
      if (pageStates) {
        for (let i = 0; i < itemsPerStep; i++) {
          if (pageStates[i]) checked++;
        }
      }
    });

    return Math.round((checked / total) * 100);
  };

  // --- Filter and sort Tasks lists ---
  const filteredTasks = tasks.filter((t) => {
    if (filterType === 'all') return true;
    return t.type === filterType;
  });

  // Find all uncompleted items that match the urgent conditions:
  // - Within 1 week (<= 7 days) and progress is 80% or less
  // - OR within 3 days (<= 3 days) and progress is less than 100% (not fully completed)
  const urgentImminentItems = React.useMemo(() => {
    const items: { id?: string; source: 'task' | 'todo'; title: string; detail: string; daysLeft: number; reason: string }[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    const oneDay = 24 * 60 * 60 * 1000;

    // 1. Scan tasks
    tasks.forEach((t) => {
      const deadlineDate = new Date(t.deadline);
      deadlineDate.setHours(0,0,0,0);
      const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / oneDay);
      
      const stepsList = t.type === 'manga'
        ? ['ネーム', '下書き', '線画', '仕上げ']
        : t.type === 'illust'
          ? ['ラフ', '下書き', '線画', '着色', '仕上げ']
          : ['事前準備', 'ラフ・資料提示', '日程・見積調整', '決定事項メモ', 'お礼・共有'];

      const itemsPerStep = t.type === 'manga' ? t.totalPages : 1;
      let checked = 0;
      stepsList.forEach((step) => {
        const pageStates = t.steps[step];
        if (pageStates) {
          for (let i = 0; i < itemsPerStep; i++) {
            if (pageStates[i]) checked++;
          }
        }
      });
      const total = stepsList.length * itemsPerStep;
      const progressPercent = total > 0 ? Math.round((checked / total) * 100) : 0;

      // Condition 1: within 7 days && progress percentage <= 80
      const isUrgentOneWeek = (daysLeft >= 0 && daysLeft <= 7 && progressPercent <= 80);
      // Condition 2: within 3 days && progress percentage < 100
      const isUrgentThreeDays = (daysLeft >= 0 && daysLeft <= 3 && progressPercent < 100);

      if (isUrgentOneWeek || isUrgentThreeDays) {
        const uncompletedSteps: string[] = [];
        stepsList.forEach((step) => {
          const pageStates = t.steps[step] || [];
          for (let i = 0; i < itemsPerStep; i++) {
            if (!pageStates[i]) {
              const label = t.type === 'manga' ? `${i + 1}p[${step}]` : `[${step}]`;
              if (!uncompletedSteps.includes(label)) {
                uncompletedSteps.push(label);
              }
            }
          }
        });

        let reason = '';
        if (isUrgentThreeDays) {
          reason = '締切間近 (3日以内/未完了)';
        } else if (isUrgentOneWeek) {
          reason = `進捗遅れ (7日以内/進捗 ${progressPercent}%)`;
        }

        items.push({
          id: t.id,
          source: 'task',
          title: t.title,
          detail: `進捗率 ${progressPercent}% | 未完了: ${uncompletedSteps.slice(0, 3).join(', ')}${uncompletedSteps.length > 3 ? '..' : ''}`,
          daysLeft,
          reason
        });
      }
    });

    // 2. Scan todos
    todos.forEach((todo) => {
      if (todo.completed || !todo.deadline) return;
      const deadlineDate = new Date(todo.deadline);
      deadlineDate.setHours(0,0,0,0);
      const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / oneDay);
      
      // Todo's progress is binary (completed / not completed)
      const isUrgentOneWeek = (daysLeft >= 0 && daysLeft <= 7);
      const isUrgentThreeDays = (daysLeft >= 0 && daysLeft <= 3);

      if (isUrgentOneWeek || isUrgentThreeDays) {
         items.push({
           source: 'todo',
           title: todo.title,
           detail: '期限間近のとりあえずやること',
           daysLeft,
           reason: daysLeft <= 3 ? '締切間近 (3日以内)' : '期限切迫 (7日以内)'
         });
      }
    });

    return items;
  }, [tasks, todos]);

  // 設定で選べるのはアクセント1色だけ。地・文字・罫は薄墨紙の固定値。
  // themePreset === 'custom' は「利用者が自分で色を選んだ」印。
  // 旧デザインのプリセット由来の色は引き継がず、既定の青竹に寄せる。
  const uiAccent =
    (customStyle.themePreset === 'custom' && customStyle.accentColor) || '#2F6B4F';

  return (
    <div className="min-h-screen bg-desk font-gothic text-sumi">

      {/* データの同期・移行中（一括マイグレーション）オーバーレイ */}
      {isMigrating && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-desk">
          <div className="mx-4 w-full max-w-[420px] bg-paper px-8 py-9" style={{ border: '0.5px solid #262A26' }}>
            <h3 className="mincho text-title leading-none">クラウドとデータを同期しています</h3>
            <p className="mt-4 text-note text-hojo leading-[1.8]">
              この端末に保存されていたお仕事・TODO・ステッカーを、接続した Google アカウントのクラウドへ
              移しています。終わるまで画面を閉じないでください。
            </p>
            <p className="num mt-5 text-note text-hojo">Syncing…</p>
          </div>
        </div>
      )}

      {/* 選んだアクセント1色だけを流し込む（地・文字・罫は固定値） */}
      <style dangerouslySetInnerHTML={{ __html: `:root { --ui-accent: ${uiAccent}; }` }} />

      <div className="mx-auto w-full max-w-[1440px] bg-paper min-h-screen" style={{ borderLeft: '0.5px solid #D7DAD3', borderRight: '0.5px solid #D7DAD3' }}>

        {/* 打合せ通知。画面最上端に1行・塗らない・上下に青竹罫。
            オーバーレイせず、以下を下に押し下げる */}
        {activeAlarm && (
          <div
            className="flex items-center gap-3 px-4 py-2 md:gap-5 md:px-12"
            style={{ borderTop: '0.5px solid var(--ui-accent)', borderBottom: '0.5px solid var(--ui-accent)' }}
          >
            <span className="shrink-0 text-note text-accent">
              <span className="hidden md:inline">打合せ</span>{activeAlarm.minutesLeft}分前
            </span>
            <span className="min-w-0 flex-1 truncate text-note">
              {activeAlarm.title}
              <span className="text-hojo">　{activeAlarm.clientName}</span>
            </span>
            <span className="num shrink-0 text-note text-hojo">{activeAlarm.timeString}</span>
            <button
              onClick={() => {
                setSelectedTaskId(activeAlarm.taskId);
                setActiveAlarm(null);
              }}
              className="tap hidden shrink-0 items-center text-note md:flex"
              style={{ textDecoration: 'underline', textDecorationThickness: '0.5px' }}
            >
              開く
            </button>
            <button
              onClick={() => setActiveAlarm(null)}
              className="num tap-icon shrink-0 text-note text-hojo"
              title="閉じる"
            >
              ×
            </button>
          </div>
        )}

        {/* 打合せ・締切の注意帯。1行・塗らない・上下に青竹罫 */}
        {urgentImminentItems.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 md:px-12"
            style={{ borderTop: '0.5px solid var(--ui-accent)', borderBottom: '0.5px solid var(--ui-accent)' }}
          >
            <span className="text-note text-accent shrink-0">
              期限間近 {urgentImminentItems.length}件
            </span>
            {urgentImminentItems.map((item, idx) => (
              <button
                key={idx}
                type="button"
                disabled={!(item.source === 'task' && !!item.id)}
                onClick={() => { if (item.id) setSelectedTaskId(item.id); }}
                className="tap flex items-center gap-2 text-note"
                style={{ cursor: item.source === 'task' && item.id ? 'pointer' : 'default' }}
              >
                <span className="max-w-[220px] truncate text-sumi">{item.title}</span>
                <span className="num text-accent">
                  {item.daysLeft < 0 ? `超過 ${Math.abs(item.daysLeft)}日` : item.daysLeft === 0 ? '本日締切' : `残 ${item.daysLeft}日`}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ヘッダー画像（任意）。地の上に置く帯。枠も影も付けない */}
        {customStyle.headerBgUrl && (
          <div className="rule-b relative">
            <img
              src={customStyle.headerBgUrl}
              alt=""
              referrerPolicy="no-referrer"
              onClick={() => setSelectedTaskId(null)}
              className="h-[132px] w-full cursor-pointer select-none object-cover md:h-[184px]"
              title="クリックで一覧に戻る"
            />
          </div>
        )}

        {/* 題字欄。スマホでは題字の下に日付時刻を置き、右は名前と ＋ に縮める */}
        <header className="rule-b flex items-end justify-between gap-4 px-4 pb-3 pt-5 md:gap-6 md:px-12 md:pb-4 md:pt-7">
          <div className="min-w-0">
            <div className="title-mark truncate">作業進捗tracker</div>
            <div className="mt-1 md:hidden">
              <HeaderClock />
            </div>
          </div>

          <div className="flex shrink-0 items-end gap-3 md:gap-7">
            <div className="hidden md:block">
              <HeaderClock />
            </div>

            {user ? (
              <>
                <span className="hidden max-w-[120px] truncate text-note text-hojo md:inline">
                  {user.displayName || 'ユーザー'}
                </span>
                <button onClick={handleGoogleSignOut} className="btn hidden md:inline-block" title="ログアウト">
                  ログアウト
                </button>
                <button onClick={handleGoogleSignOut} className="tap flex items-center text-note text-hojo md:hidden" title="ログアウト">
                  {user.displayName || 'ユーザー'}
                </button>
              </>
            ) : (
              <>
                <button onClick={handleGoogleSignIn} className="btn hidden md:inline-block">
                  Googleでログイン
                </button>
                <button onClick={handleGoogleSignIn} className="tap flex items-center text-note text-hojo md:hidden">
                  ログイン
                </button>
              </>
            )}

            {/* スマホは見た目 28px 角のまま、外側で 44px の当たり判定を確保する */}
            <button
              id="task-add-btn"
              onClick={() => { setEditingTask(null); setIsTaskModalOpen(true); }}
              className="tap flex items-center justify-center"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              title="新規案件"
            >
              <span
                className="btn btn-primary flex h-7 w-7 items-center justify-center p-0 md:hidden"
                style={{ minHeight: 0 }}
              >
                ＋
              </span>
              <span className="btn btn-primary hidden md:inline-block">＋ 新規案件</span>
            </button>
            <button
              id="setting-open-btn"
              onClick={() => setIsSettingModalOpen(true)}
              className="btn hidden md:inline-block"
            >
              設定
            </button>
            <button
              onClick={() => setIsSettingModalOpen(true)}
              className="tap flex items-center text-note text-hojo md:hidden"
            >
              設定
            </button>
          </div>
        </header>

        {/* 本体：左＝案件一覧（可変） ／ 右＝440px 締切カレンダー＋TODO */}
        <div className="flex flex-col lg:flex-row items-stretch">

          {/* ============ 左：案件一覧 ============ */}
          <div className="min-w-0 flex-1">

            {/* フィルタ行 */}
            <div className="rule-b flex items-center justify-between px-4 py-2 md:px-12 md:py-3">
              <div className="flex items-center gap-5">
                {([['all', '全部'], ['manga', '漫画'], ['illust', 'イラスト']] as const).map(([key, label]) => (
                  <button
                    key={key}
                    id={`filter-${key}-btn`}
                    onClick={() => setFilterType(key)}
                    className="tap flex items-end text-note"
                    style={
                      filterType === key
                        ? { color: '#262A26', borderBottom: '0.5px solid #262A26', paddingBottom: '2px' }
                        : { color: '#838A80', paddingBottom: '2px' }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="num text-note text-hojo">{filteredTasks.length} 件</span>
            </div>

            {/* 案件の行 */}
            {filteredTasks.length === 0 ? (
              <div className="px-4 py-16 md:px-12">
                <p className="text-note text-hojo">登録されているお仕事はありません。</p>
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isOpen = task.id === selectedTaskId;
                const progressVal = getTaskProgressPercentage(task);
                const daysLeft = daysUntil(task.deadline);

                return (
                  <div key={task.id} className="rule-b">
                    {/* 行本体。全体がクリック可能 */}
                    <div
                      id={`task-card-${task.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedTaskId(isOpen ? null : task.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedTaskId(isOpen ? null : task.id);
                        }
                      }}
                      className="cursor-pointer px-4 py-3 md:px-12 md:py-[20px]"
                      style={{ background: isOpen ? '#EDEFEA' : 'transparent' }}
                      onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = '#EDEFEA'; }}
                      onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {/* 1段目：［種別］＋ 作品名 ＋ 入金バッジ */}
                      <div className="flex items-baseline gap-3">
                        <span className="shrink-0 text-note text-hojo">
                          ［{task.type === 'manga' ? '漫画' : task.type === 'illust' ? 'イラスト' : '打合せ'}］
                        </span>
                        <h4 className="mincho min-w-0 flex-1 truncate text-title leading-snug">
                          {task.title}
                        </h4>
                        <DepositTag status={task.depositStatus} />
                      </div>

                      {/* 2段目：クライアント／締切／残日数／進捗 */}
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-1">
                        <span className="w-full truncate text-note text-hojo md:w-[280px] md:shrink-0">
                          {task.clientName || '—'}
                        </span>
                        <span className="num text-note">
                          締切 {formatDot(task.deadline)}
                        </span>
                        <DaysLeft days={daysLeft} />
                        <span className="num text-note text-hojo">進捗 {progressVal}%</span>
                      </div>
                    </div>

                    {/* 行展開＝進行表 */}
                    {isOpen && (
                      <div className="rule-t" style={{ background: '#EDEFEA' }}>
                        <ProgressTable
                          task={task}
                          tasks={tasks}
                          onSelectTaskId={setSelectedTaskId}
                                      onToggleCell={handleToggleCell}
                          onEditTask={(t) => { setEditingTask(t); setIsTaskModalOpen(true); }}
                          onDeleteTask={handleDeleteTask}
                          onSyncCalendar={handleManualSync}
                          calendarConnected={!!calendarSettings.accessToken}
                          customStyle={customStyle}
                          onBackToList={() => setSelectedTaskId(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ============ 右：締切カレンダー＋TODO ============ */}
          <aside className="w-full shrink-0 lg:w-[440px] lg:border-l-[0.5px] lg:border-l-kei">
            {/* 締切カレンダー。スマホでは一覧の下に縦積みし、欄の頭に墨罫を引く */}
            <section className="rule-t-sumi rule-t rule-b px-4 py-5 md:px-8 lg:rule-t-none">
              <h3 className="mb-4 text-note text-hojo">締切カレンダー</h3>
              <CalendarPanel
                tasks={tasks}
                todos={todos}
                calendarSettings={calendarSettings}
                onSelectTaskId={setSelectedTaskId}
                onConnect={handleGoogleSignIn}
              />
            </section>

            {/* TODO */}
            <section className="rule-t-sumi rule-t px-4 py-5 md:px-8 lg:rule-t-none">
              <div className="mb-4 flex items-baseline justify-between">
                <h3 className="text-note text-hojo">TODO</h3>
                <span className="num text-note text-hojo">
                  {todos.filter((t) => t.completed).length} / {todos.length}
                </span>
              </div>

              {/* 追加欄。罫線の上に直接置く */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTodoTitle.trim()) return;
                  handleAddTodo(newTodoTitle, newTodoDeadline || undefined);
                  setNewTodoTitle('');
                  setNewTodoDeadline('');
                }}
                className="rule-b mb-4 flex items-center gap-3 pb-2"
              >
                <input
                  id="dash-todo-title-input"
                  type="text"
                  placeholder="やることを書く"
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  className="field min-w-0 flex-1 text-note"
                />
                <input
                  id="dash-todo-deadline-input"
                  type="date"
                  value={newTodoDeadline}
                  onChange={(e) => setNewTodoDeadline(e.target.value)}
                  className="field field-num w-[124px] shrink-0 text-hojo"
                />
                <button id="dash-todo-submit-btn" type="submit" className="btn shrink-0">
                  追加
                </button>
              </form>

              {todos.length === 0 ? (
                <p className="text-note text-hojo">やることはありません。</p>
              ) : (
                <ul>
                  {todos.map((todo) => (
                    <li key={todo.id} className="rule-b flex items-center gap-3">
                      {/* チェックは □ / ■ の文字。行クリックでトグル */}
                      <button
                        id={`dash-todo-toggle-${todo.id}`}
                        type="button"
                        onClick={() => handleToggleTodo(todo.id)}
                        className="tap flex min-w-0 flex-1 items-center py-3 text-left md:py-[10px]"
                      >
                        <span className={`text-note ${todo.completed ? 'text-hojo' : 'text-sumi'}`}>
                          <span className="mr-2">{todo.completed ? '■' : '□'}</span>
                          <span className={todo.completed ? 'line-through' : ''}>{todo.title}</span>
                        </span>
                      </button>

                      {todo.deadline && (
                        <span className="num shrink-0 text-note text-hojo">
                          {formatMd(todo.deadline)}
                        </span>
                      )}

                      {!todo.completed && todo.deadline && !todo.calendarEventId && calendarSettings.accessToken && (
                        <button
                          id={`dash-todo-sync-${todo.id}`}
                          onClick={() => handleSyncTodoEvent(todo)}
                          className="tap-icon shrink-0 text-hojo"
                          title="Googleカレンダーに登録"
                        >
                          <RefreshCw className="h-4 w-4" strokeWidth={1.25} />
                        </button>
                      )}
                      <button
                        id={`dash-todo-del-${todo.id}`}
                        onClick={() => handleDeleteTodo(todo.id)}
                        className="tap-icon shrink-0 text-hojo"
                        title="削除"
                      >
                        <Trash className="h-4 w-4" strokeWidth={1.25} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

        </div>
      </div>

      {/* --- Pop-up modals --- */}
      
      {/* 1. Settings Menu customization */}
      {isSettingModalOpen && (
        <Suspense fallback={null}>
        <SettingModal
          isOpen={isSettingModalOpen}
          onClose={() => setIsSettingModalOpen(false)}
          calendarSettings={calendarSettings}
          onCalendarSettingsChange={handleCalendarSettingsChange}
          onLogout={handleLogout}
          onConnect={handleGoogleSignIn}
          customStyle={customStyle}
          onCustomStyleChange={(updatedStyle) => {
            setCustomStyle(updatedStyle);
            localStorage.setItem(LOCAL_STORAGE_STYLE_KEY, JSON.stringify(updatedStyle));
            if (user) {
              updateUserConfig(updatedStyle, undefined, undefined);
            }
          }}
        />
        </Suspense>
      )}

      {/* 2. Task Form creation and Modification popped up */}
      {isTaskModalOpen && (
        <Suspense fallback={null}>
        <TaskFormModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setEditingTask(null);
          }}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          editingTask={editingTask}
          customStyle={customStyle}
        />
        </Suspense>
      )}

      {/* 3. Draggable stickers overlay layer */}
      {customStyle.showStickers !== false && (
        <Suspense fallback={null}>
        <StickerOverlay
          stickers={stickers}
          onStickersChange={handleStickersChange}
          customStyle={customStyle}
        />
        </Suspense>
      )}

    </div>
  );
}
