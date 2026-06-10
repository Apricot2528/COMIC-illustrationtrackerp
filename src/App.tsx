/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Task, ThemeConfig, CalendarSettings, TaskType, DepositStatus, PlacedSticker, CustomStyleConfig } from './types';
import { THEMES } from './data/themes';
import { parseOAuthHash, syncDeadlineToGoogleCalendar, syncMeetingToGoogleCalendar, deleteEventFromGoogleCalendar, syncTodoToGoogleCalendar } from './utils/calendar';
import SettingModal from './components/SettingModal';
import TaskFormModal from './components/TaskFormModal';
import ProgressTable from './components/ProgressTable';
import CalendarAccordion from './components/CalendarAccordion';
import StickerOverlay from './components/StickerOverlay';
import { HeaderClock } from './components/HeaderClock';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Settings, AlertTriangle, Sparkles, BookOpen, Clock, Calendar as CalendarIcon, User, RefreshCw, Heart, Info, Sliders, Moon, Sun, Shuffle, Filter, CheckSquare, Square, Trash, Bell } from 'lucide-react';
import { Todo } from './types';

const LOCAL_STORAGE_TASKS_KEY = 'manga_illust_tasks_v1';
const LOCAL_STORAGE_TODOS_KEY = 'manga_illust_todos_v1';
const LOCAL_STORAGE_THEME_KEY = 'manga_illust_theme_id_v1';
const LOCAL_STORAGE_CAL_KEY = 'manga_illust_calendar_v1';
const LOCAL_STORAGE_STYLE_KEY = 'manga_illust_custom_style_v1';

// Hex color shade/brightness helper
function adjustColorBrightness(hex: string, percent: number): string {
  try {
    if (!hex || hex.length < 7) return hex;
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = parseInt(((R * (100 + percent)) / 100).toString());
    G = parseInt(((G * (100 + percent)) / 100).toString());
    B = parseInt(((B * (100 + percent)) / 100).toString());

    R = R < 255 ? R : 255;
    G = G < 255 ? G : 255;
    B = B < 255 ? B : 255;

    R = R > 0 ? R : 0;
    G = G > 0 ? G : 0;
    B = B > 0 ? B : 0;

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  } catch (e) {
    return hex;
  }
}

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

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingModalOpen, setIsSettingModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'manga' | 'illust'>('all');

  // --- TODO States ---
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDeadline, setNewTodoDeadline] = useState('');

  // --- Custom Style Configuration State ---
  const [customStyle, setCustomStyle] = useState<CustomStyleConfig>({
    useCustomColor: true,
    primaryColor: '#ffd803',
    accentColor: '#ffd803',
    bgColor: '#fffffe',
    sidebarColor: '#f7f8fa',
    subColor: '#2d334a',
    textAccentColor: '#272343',
    themePreset: 'pastel',
    headerBgUrl: '',
    deadlineCatUrl: '',
    showEmojis: true,
    showStickers: true,
    darkMode: false,
    dashboardTitle: 'クリエイティブスタジオ・ダッシュボード'
  });

  const PRESET_THEME_COLORS = {
    pastel: {
      accentColor: '#ffd803',
      bgColor: '#fffffe',
      sidebarColor: '#f7f8fa',
      subColor: '#2d334a',
      textAccentColor: '#272343',
      dark: { accentColor: '#ffd803', bgColor: '#1a1b2d', sidebarColor: '#24253a', subColor: '#828ba3', textAccentColor: '#ffffff' }
    },
    sage: {
      accentColor: '#0e172c',
      bgColor: '#fec7d7',
      sidebarColor: '#ffdbe3',
      subColor: '#ff70a6',
      textAccentColor: '#0e172c',
      dark: { accentColor: '#fec7d7', bgColor: '#0e172c', sidebarColor: '#17213d', subColor: '#ff758f', textAccentColor: '#ffffff' }
    },
    autumn: {
      accentColor: '#6246ea',
      bgColor: '#fffffe',
      sidebarColor: '#f4f3ff',
      subColor: '#907eff',
      textAccentColor: '#2b2c34',
      dark: { accentColor: '#a78bfa', bgColor: '#15141c', sidebarColor: '#1d1c26', subColor: '#818cf8', textAccentColor: '#ffffff' }
    },
    pop: {
      accentColor: '#3da9fc',
      bgColor: '#fffffe',
      sidebarColor: '#f0f7ff',
      subColor: '#5f6c7b',
      textAccentColor: '#094067',
      dark: { accentColor: '#3da9fc', bgColor: '#09111e', sidebarColor: '#0f1d30', subColor: '#38bdf8', textAccentColor: '#ffffff' }
    },
    indigo: {
      accentColor: '#9a7b56',
      bgColor: '#fcfaf7',
      sidebarColor: '#f5ede4',
      subColor: '#c19b6c',
      textAccentColor: '#3e2723',
      dark: { accentColor: '#d7b58e', bgColor: '#1c120c', sidebarColor: '#281b12', subColor: '#be9b7b', textAccentColor: '#f5ebd0' }
    }
  };

  // --- active alarm trigger state ---
  const [activeAlarm, setActiveAlarm] = useState<{
    taskId: string;
    title: string;
    clientName: string;
    minutesLeft: number;
    timeString: string;
  } | null>(null);

  // --- Draggable Stickers State ---
  const [stickers, setStickers] = useState<PlacedSticker[]>([]);

  const handleStickersChange = (updated: PlacedSticker[]) => {
    setStickers(updated);
    localStorage.setItem('manga_illust_stickers_v1', JSON.stringify(updated));
  };

  // --- Initial loading from LocalStorage ---
  useEffect(() => {
    // -1. Load custom style selections
    const storedStyleStr = localStorage.getItem(LOCAL_STORAGE_STYLE_KEY);
    if (storedStyleStr) {
      try {
        const parsed = JSON.parse(storedStyleStr);
        setCustomStyle(prev => ({
          ...prev,
          ...parsed
        }));
      } catch (e) {
        console.error('Failed to parse custom styles from localStorage', e);
      }
    }

    // 0. Load todos
    const storedTodosStr = localStorage.getItem(LOCAL_STORAGE_TODOS_KEY);
    if (storedTodosStr) {
      try {
        setTodos(JSON.parse(storedTodosStr) as Todo[]);
      } catch (e) {
        console.error('Failed to parse todos from localStorage', e);
      }
    }

    // 1. Load tasks
    const storedTasksStr = localStorage.getItem(LOCAL_STORAGE_TASKS_KEY);
    if (storedTasksStr) {
      try {
        const parsed = JSON.parse(storedTasksStr) as Task[];
        // Auto-heal duplicate, invalid, or missing task IDs from localStorage
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
        // By default, start with home (null) active
        setSelectedTaskId(null);
      } catch (e) {
        console.error('Failed to parse tasks from localStorage', e);
      }
    }

    // 2. Load theme
    const storedThemeId = localStorage.getItem(LOCAL_STORAGE_THEME_KEY);
    if (storedThemeId) {
      const match = THEMES.find(t => t.id === storedThemeId);
      if (match) setActiveTheme(match);
    }

    // 3. Load Calendar credentials
    const storedCalStr = localStorage.getItem(LOCAL_STORAGE_CAL_KEY);
    if (storedCalStr) {
      try {
        const parsed = JSON.parse(storedCalStr);
        setCalendarSettings({
          clientId: parsed.clientId || '210301309790-kg0bm152ltql8qadr0dmtr4srmcukdsa.apps.googleusercontent.com',
          apiKey: parsed.apiKey || '',
          calendarId: parsed.calendarId || 'primary',
          accessToken: parsed.accessToken || null,
          tokenExpiry: parsed.tokenExpiry || null
        });
      } catch (e) {
        console.error('Failed to parse calendar settings', e);
      }
    }

    // 4. Handle OAuth tokens on callback
    const oauthParsed = parseOAuthHash();
    if (oauthParsed) {
      const storedState = localStorage.getItem('oauth_state');
      if (storedState && oauthParsed.state === storedState) {
        const updated = {
          ...calendarSettings,
          clientId: localStorage.getItem('oauth_client_id_tmp') || '',
          accessToken: oauthParsed.accessToken,
          tokenExpiry: Date.now() + parseInt(oauthParsed.expiresIn) * 1000
        };
        setCalendarSettings(updated);
        localStorage.setItem(LOCAL_STORAGE_CAL_KEY, JSON.stringify(updated));
        localStorage.removeItem('oauth_state');
        localStorage.removeItem('oauth_client_id_tmp');
        alert('Googleカレンダーへの連携とサインインに成功しました！✨📅');
      } else {
        // Fallback merge
        const updated = {
          ...calendarSettings,
          accessToken: oauthParsed.accessToken,
          tokenExpiry: Date.now() + parseInt(oauthParsed.expiresIn) * 1000
        };
        setCalendarSettings(updated);
        localStorage.setItem(LOCAL_STORAGE_CAL_KEY, JSON.stringify(updated));
        alert('カレンダーに接続しました！📅');
      }
    }

    // 5. Load Placed Stickers
    const storedStickersStr = localStorage.getItem('manga_illust_stickers_v1');
    if (storedStickersStr) {
      try {
        setStickers(JSON.parse(storedStickersStr) as PlacedSticker[]);
      } catch (e) {
        console.error('Failed to parse stickers from localStorage', e);
      }
    }
  }, []);

  // --- Real-Time Background Meeting Checker & Alarm Chime ---
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      tasks.forEach((task) => {
        if (task.type === 'meeting' && task.meetingDate) {
          const mDate = new Date(task.meetingDate);
          const diffMs = mDate.getTime() - now.getTime();
          // Convert difference into rounded minutes
          const diffMins = Math.round(diffMs / 60000);

          // We trigger alarm alert popup for 10 or 5 minutes remaining
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
        }
      });
    }, 10000); // Check every 10 seconds for instant action

    return () => clearInterval(timer);
  }, [tasks]);


  // Sync token redirect parameters before auth start
  useEffect(() => {
    if (calendarSettings.clientId) {
      localStorage.setItem('oauth_client_id_tmp', calendarSettings.clientId);
    }
  }, [calendarSettings.clientId]);

  // Make sure to select a valid task when the active task is deleted
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  // --- Theme Change handler ---
  const handleThemeChange = (theme: ThemeConfig) => {
    setActiveTheme(theme);
    localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme.id);
  };

  // --- Calendar state save ---
  const handleCalendarSettingsChange = (newSettings: CalendarSettings) => {
    setCalendarSettings(newSettings);
    localStorage.setItem(LOCAL_STORAGE_CAL_KEY, JSON.stringify(newSettings));
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
      alert('ログアウトしました。🔒');
    }
  };

  // --- Toggle progress step grid cell ---
  const handleToggleCell = (taskId: string, stepName: string, pageIndex: number) => {
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
            alert(`🎉🎨「${t.title}」が【100% 完了】しました！\n本当に素晴らしい出来栄えです！お疲れ様でした！🍓🍒💖`);
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

    // Google Calendarとの非同期連動
    if (calendarSettings.accessToken) {
      alert(isNew ? '新しい制作お仕事を保存しました。Googleカレンダーへの同期登録を行います...✨' : '制作設定を保存しました。カレンダー同期情報を更新しています...♻️');
      await doSyncToGoogle(savedTask, updatedTasks);
    } else {
      alert(isNew ? '制作お仕事を登録しました！🌸' : '制作設定を更新しました！💖');
    }
  };

  // --- Actual Sync operation to Google Cloud ---
  const doSyncToGoogle = async (task: Task, currentTasks: Task[]) => {
    if (!calendarSettings.accessToken) {
      alert('Googleカレンダーにログインしていません。設定内の「カレンダーに接続」から認証してください。🔒');
      return;
    }

    try {
      // 1. Sync Deadline Event
      const deadlineEventId = await syncDeadlineToGoogleCalendar(
        task,
        calendarSettings.accessToken,
        calendarSettings.calendarId
      );

      // 2. Sync Meeting Event if date selected
      let meetingEventId = undefined;
      if (task.meetingDate) {
        meetingEventId = await syncMeetingToGoogleCalendar(
          task,
          calendarSettings.accessToken,
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
      alert('🟢 Googleカレンダーとの自動登録・同期がすべて完了しました！📅✨');
    } catch (err) {
      console.error(err);
      alert('Googleカレンダーの登録に一部失敗しました。設定でログインをやり直してみてね。💦');
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

    // Deselect
    if (selectedTaskId === taskId) {
      setSelectedTaskId(filtered.length > 0 ? filtered[0].id : null);
    }
    alert('制作お仕事を削除しました。🧹');
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
        const calEventId = await syncTodoToGoogleCalendar(newTodo, calendarSettings.accessToken, calendarSettings.calendarId);
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
    alert('「とりあえずやること(TODO)」を追加しました！🌸');
  };

  const handleToggleTodo = (todoId: string) => {
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
  };

  const handleSyncTodoEvent = async (todo: Todo) => {
    if (!calendarSettings.accessToken) {
      alert('Googleカレンダーにログインしていません。設定内の「カレンダーに接続」から認証してください。🔒');
      return;
    }
    if (!todo.deadline) {
      alert('そのTODOには期限・日付が設定されていません。💦');
      return;
    }

    try {
      const calEventId = await syncTodoToGoogleCalendar(todo, calendarSettings.accessToken, calendarSettings.calendarId);
      if (calEventId) {
        const updated = todos.map(t => t.id === todo.id ? { ...t, calendarEventId: calEventId } : t);
        setTodos(updated);
        localStorage.setItem(LOCAL_STORAGE_TODOS_KEY, JSON.stringify(updated));
        alert('🟢 TODOをGoogleカレンダーと連携しました！📅✨');
      }
    } catch (e) {
      alert('カレンダーへの登録に失敗しました。💦');
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

  const isDark = activeTheme.id === 'cosmic' || !!customStyle?.darkMode;

  // Cute system random quote generator for creative encouragement
  const encouragementQuote = React.useMemo(() => {
    const quotes = [
      "ネームから一本の線になびく、あなただけのストーリーを形にしてね。✍️🌸",
      "水分補給をお忘れなく！進捗チェックはあなたの強い味方です。🧉🧸",
      "締め切りを乗り越えた先には、きらきら輝く作品が待っています！✨🍓",
      "下書きが綺麗にのると、线画がとっても楽しくなりますよ！⭐🥐",
      "今日もあなたのキャンバスに、一番素敵な魔法が届きますように。🌟🌙"
    ];
    // Seed simply based on date
    const idx = new Date().getDay() % quotes.length;
    return quotes[idx];
  }, [selectedTaskId]);

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

  const currentPreset = customStyle.themePreset || 'pastel';
  const isPresetCustom = currentPreset === 'custom';
  const presetDefaults = PRESET_THEME_COLORS[currentPreset as 'pastel' | 'sage' | 'autumn' | 'pop' | 'indigo'] || PRESET_THEME_COLORS.pastel;

  const defaultAccent = isDark ? presetDefaults.dark.accentColor : presetDefaults.accentColor;
  const defaultBg = isDark ? presetDefaults.dark.bgColor : presetDefaults.bgColor;
  const defaultSidebar = isDark ? presetDefaults.dark.sidebarColor : presetDefaults.sidebarColor;
  const defaultSub = isDark ? presetDefaults.dark.subColor : presetDefaults.subColor;
  const defaultTextAccent = isDark ? presetDefaults.dark.textAccentColor : presetDefaults.textAccentColor;

  const customAccent = isPresetCustom ? (customStyle.accentColor || '#9b7fe8') : defaultAccent;
  const customBg = isPresetCustom ? (customStyle.bgColor || (isDark ? '#0c0a18' : '#f5f3f9')) : defaultBg;
  const customSidebar = isPresetCustom ? (customStyle.sidebarColor || (isDark ? '#16132b' : '#eae5f5')) : defaultSidebar;
  const customSub = isPresetCustom ? (customStyle.subColor || '#e197b9') : defaultSub;
  const customTextAccent = isPresetCustom ? (customStyle.textAccentColor || '#22173d') : defaultTextAccent;

  return (
    <div className={`min-h-screen py-6 px-4 md:px-8 font-sans transition-all duration-300 ${activeTheme.bgClass} ${isDark ? 'text-indigo-150' : 'text-slate-800'}`}>
      
      {/* Custom primary color style overrides if enabled */}
      {customStyle.useCustomColor && (
        <style dangerouslySetInnerHTML={{__html: `
          :root {
            --primary-color: ${customAccent} !important;
            --primary-hover: ${adjustColorBrightness(customAccent, -12)} !important;
            --primary-light: ${customAccent}14 !important;
            --primary-border: ${customAccent}2b !important;
            --primary-strong: ${customAccent}cc !important;
            --sub-color: ${customSub} !important;
            --text-heading-color: ${customTextAccent} !important;
          }
          
          /* Screen Background Plain and Solid (Color 2: BG Color) */
          body, .min-h-screen {
            background-color: ${customBg} !important;
            background-image: none !important;
          }

          /* Match all sidebar boxes to transparent (Color 3: Sidebar background removed completely) */
          .custom-sidebar-container {
            background-color: transparent !important;
            background-image: none !important;
          }
          .custom-sidebar-container .bg-white, 
          .custom-sidebar-container [class*="cardClass"], 
          .custom-sidebar-container .bg-slate-50 {
            background-color: transparent !important;
          }

          /* Match all content cards, boxes, and modal popups to page background color (customBg) */
          .custom-content-container,
          .custom-content-container .bg-white,
          .custom-content-container [class*="cardClass"],
          .custom-content-container .bg-slate-50,
          .custom-content-container .bg-indigo-900\\/45,
          .custom-content-container .bg-indigo-950\\/20,
          .custom-content-container .bg-white\\/40,
          .custom-content-container .bg-white\\/50,
          .custom-content-container .bg-rose-50\\/40,
          .bg-slate-50\\/50,
          .bg-white\\/75,
          .bg-white\\/70,
          .fixed .bg-white,
          .fixed [class*="cardClass"],
          .fixed .rounded-3xl,
          .fixed .bg-indigo-950\\/40,
          #setting-modal-container,
          #task-form-modal-container {
            background-color: ${customBg} !important;
          }

          /* Remove outline of environments & customizations setting modal / task modal */
          #setting-modal-container,
          #task-form-modal-container {
            border: none !important;
            border-width: 0px !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
          }

          /* Unified box frames matching the soft eucalyptus/ochre/cherry tones (Color 4: Sub Color) */
          .border, .border-2, .border-dashed, [class*="borderClass"], .border-slate-100, .border-slate-200, .border-indigo-800, .border-rose-100\\/32, .border-rose-200\\/50, .border-indigo-850, .border-rose-100\\/30, .border-slate-150 {
            border-color: ${customSub}80 !important;
            border-width: 2px !important;
          }
          hr {
            border-color: ${customSub}40 !important;
          }

          .custom-primary-bg { 
            background-color: ${customAccent} !important; 
            border-color: ${customAccent} !important; 
            color: #fff !important; 
          }
          .custom-primary-bg:hover {
            background-color: ${adjustColorBrightness(customAccent, -12)} !important;
            border-color: ${adjustColorBrightness(customAccent, -12)} !important;
          }
          .custom-primary-text { 
            color: ${customAccent} !important; 
          }
          .custom-primary-border { 
            border-color: ${customAccent} !important; 
          }
          .custom-shadow {
            box-shadow: 0 10px 15px -3px ${customAccent}22 !important;
          }
          .accent-rose-500 {
            accent-color: ${customAccent} !important;
          }

          /* --- Dynamic global style overrides --- */
          /* 1. All primary background elements (Color 1: Accent Color) */
          .bg-rose-500, .bg-rose-600, .bg-emerald-500, .bg-emerald-600, .bg-pink-500, .bg-pink-600 {
            background-color: ${customAccent} !important;
            color: #ffffff !important;
          }
          
          /* 2. All hover states */
          .hover\\:bg-rose-600:hover, .hover\\:bg-rose-500:hover, .hover\\:bg-emerald-600:hover, .hover\\:bg-pink-600:hover {
            background-color: ${adjustColorBrightness(customAccent, -12)} !important;
          }

          /* 3. Text contrast pairing with customTextAccent for branding, h1, h2 (Color 5: Text Accent) */
          h1, h2, h3, .font-extrabold {
            color: ${customTextAccent} !important;
          }
          .text-slate-800, .text-slate-700, .text-slate-650, .text-slate-600, .text-slate-50,
          p, span, h4, th, td, label, .text-slate-900, .font-sans {
            color: ${isDark ? '#e4f0fc' : '#22173d'} !important; 
          }
          .text-slate-400, .text-slate-450, .text-slate-455 {
            color: ${isDark ? '#cbd5e1' : '#726d88'} !important;
          }
          .text-indigo-600, .text-rose-600, .text-pink-600, .text-emerald-700, .text-rose-700, .text-indigo-700, .text-emerald-800, .text-indigo-150, .text-indigo-200 {
            color: ${isDark ? '#cbd5e1' : '#5b21b6'} !important; 
          }
          .text-rose-500, .text-pink-500, .text-rose-400, .text-pink-400 {
            color: ${isDark ? '#fed7aa' : '#9f1239'} !important;
          }

          /* 4. Soft backgrounds & checkbox states - using customSub or customAccent for subtle integration */
          .bg-rose-50, .bg-pink-50, .bg-rose-100\\/70, .bg-pink-100, .bg-rose-100, .bg-emerald-100, .bg-pink-100\\/20, .bg-rose-500\\/10, .bg-rose-500\\/15, .bg-rose-500\\/5, .bg-rose-555\\/10, .bg-rose-500\\/30, .bg-rose-500\\/20, .bg-rose-550\\/10 {
            background-color: ${customSub}1a !important;
            color: ${isDark ? '#e4f0fc' : '#22173d'} !important;
          }
          
          /* 6. Active checkbox backgrounds */
          .bg-indigo-100.text-indigo-700, .bg-rose-100.text-rose-700, .bg-emerald-100.text-emerald-700 {
            background-color: ${customSub}30 !important;
            color: ${customAccent} !important;
            border-color: ${customSub}60 !important;
          }

          /* 7. Input focus rings */
          input:focus, textarea:focus {
            border-color: ${customAccent} !important;
            --tw-ring-color: ${customAccent}33 !important;
            outline: none !important;
          }

          /* 8. Progress and gradient fills */
          .bg-linear-to-r.from-emerald-400.to-indigo-500 {
            background: linear-gradient(to right, ${customSub}, ${customAccent}) !important;
          }
          .bg-linear-to-r.from-rose-400.to-amber-400 {
            background: linear-gradient(to right, ${customAccent}, ${customSub}) !important;
          }

          /* 9. Sidebar selection, active highlights, rings and focus states override */
          .ring-rose-450, .ring-rose-400\/20, .border-rose-450, .focus-visible:focus, :focus {
            --tw-ring-color: ${customAccent}35 !important;
            border-color: ${customAccent} !important;
          }
          .border-l-rose-500 {
            border-left-color: ${customAccent} !important;
          }
          .ring-4, .ring-2 {
            --tw-ring-color: ${customAccent}35 !important;
          }

          /* 10. Global Custom Scrollbars matching the dynamic UI theme accents */
          /* Firefox */
          * {
            scrollbar-width: thin !important;
            scrollbar-color: ${customAccent}80 transparent !important;
          }
          /* Chrome, Edge, Safari WebKit Engine styling */
          ::-webkit-scrollbar {
            width: 8px !important;
            height: 8px !important;
          }
          ::-webkit-scrollbar-track {
            background: transparent !important;
          }
          ::-webkit-scrollbar-thumb {
            background-color: ${customAccent}80 !important;
            border-radius: 9999px !important;
          }
          ::-webkit-scrollbar-thumb:hover {
            background-color: ${customAccent} !important;
          }
        `}} />
      )}

      {/* Visual background ambient container */}
      <div className="max-w-7xl mx-auto">

        {/* Header Section */}
        {customStyle.headerBgUrl ? (
          /* Massive Full-Width Premium Illustration Banner styled like professional art portfolio headers */
          <div className="rounded-3xl border-0 mb-6 relative overflow-hidden group shadow-lg transition-all duration-300">
            {/* The main banner image, fully visible (opacity 100%) and beautifully filled */}
            <img 
              src={customStyle.headerBgUrl} 
              alt="カスタムイラストヘッダー" 
              referrerPolicy="no-referrer"
              className="w-full h-48 sm:h-64 md:h-80 lg:h-[300px] object-cover select-none cursor-pointer hover:brightness-[0.98] duration-300"
              onClick={() => setSelectedTaskId(null)}
              title="クリックでホームに戻る 🏠"
            />
            
            {/* Minimalist guide overlay inside the banner */}
            <div className="absolute top-4 left-4 bg-slate-950/60 backdrop-blur-md text-white text-[10px] font-black tracking-widest uppercase py-1 px-3 rounded-full z-10 flex items-center gap-1.5 select-none hover:bg-slate-900 pointer-events-none">
              <span>🏠 STUDIO PREVIEW</span>
              <span className="opacity-60">•</span>
              <span>CLICK BANNER FOR HOME</span>
            </div>

            {/* Real-time Clock overlaid on top of the header image - Text only, larger, borderless/backgroundless */}
            <div className="absolute top-4 right-4 z-10 text-right select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-white">
              <HeaderClock isDark={isDark} alwaysWhite={true} />
            </div>

            {/* Quick action buttons floating elegantly in glassmorphic tray in the banner corner */}
            <div className="absolute bottom-4 right-4 flex items-center gap-2.5 z-10 bg-black/30 dark:bg-black/60 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-lg">
              {/* Settings button */}
              <button
                id="open-settings-btn-banner"
                onClick={() => setIsSettingModalOpen(true)}
                className="p-2.5 rounded-xl bg-white/90 text-slate-800 hover:bg-white border border-slate-200 cursor-pointer shadow-xs duration-200"
                title="ヘッダー画像変更 & 各種カラーテーマ設定 ⚙️"
              >
                <Settings className="w-4 h-4 text-slate-700 hover:text-indigo-650" />
              </button>

              {/* Add task button */}
              <button
                id="add-task-btn-banner"
                onClick={() => {
                  setEditingTask(null);
                  setIsTaskModalOpen(true);
                }}
                className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 duration-200 hover:scale-[1.03] shadow-md ${customStyle.useCustomColor ? 'custom-primary-bg' : 'bg-rose-500 text-white'}`}
              >
                <Plus className="w-3.5 h-3.5 text-white" />
                <span>タスク追加</span>
              </button>
            </div>
          </div>
        ) : (
          /* Default Header Ribbon when no illustration banner is customized */
          <div className={`rounded-3xl border-0 p-5 mb-5 flex flex-col sm:flex-row items-center justify-between gap-4 relative overflow-hidden ${activeTheme.cardClass}`} style={{ border: 'none' }}>
            <div 
              onClick={() => setSelectedTaskId(null)}
              className="flex items-center gap-3 cursor-pointer group select-none relative z-10"
              title="トップページへ戻る"
            >
              {customStyle.showEmojis && (
                <span className="text-3.5xl select-none group-hover:rotate-12 duration-300 animate-bounce-slow font-sans">🎨</span>
              )}
              <div className="text-center sm:text-left">
                <h1 className={`text-2xl font-black font-sans tracking-tight leading-none ${isDark ? 'text-indigo-50' : 'text-slate-800'} flex items-center justify-center sm:justify-start gap-1.5`}>
                  <span className="group-hover:opacity-80 transition duration-200">お絵描き進捗マン！</span>
                  <span className={`text-white font-extrabold text-sm border-2 px-1.5 rounded-lg rotate-3 inline-block transition shrink-0 duration-200 ${customStyle.useCustomColor ? 'custom-primary-bg border-transparent' : 'bg-rose-500 border-rose-400/30'}`}>
                    Manga & Illust
                  </span>
                </h1>
                <p className={`text-[11px] mt-1.5 font-medium opacity-80 ${isDark ? 'text-indigo-300' : 'text-slate-500'} flex items-center gap-1`}>
                  <span>{encouragementQuote}</span>
                  <span className="text-[9px] text-indigo-400 group-hover:translate-x-1 duration-300">（クリックでホームへ 🏠）</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end relative z-10">
              {/* Real-time Date and clock - Text only, larger, borderless/backgroundless */}
              <div className="px-2.5">
                <HeaderClock isDark={isDark} />
              </div>

              {/* Setting Button */}
              <button
                id="open-settings-btn"
                onClick={() => setIsSettingModalOpen(true)}
                className="p-2.5 rounded-2xl border-2 border-slate-200 hover:bg-slate-100 dark:border-indigo-800 dark:hover:bg-indigo-900/50 cursor-pointer duration-200 shrink-0 bg-white dark:bg-indigo-950/20"
                title="カラーテーマ & Googleカレンダー API設定"
              >
                <Settings className="w-5 h-5 text-indigo-400 rotate-hover" />
              </button>

              {/* Task Add Button (Click to pop up) */}
              <button
                id="add-task-btn"
                onClick={() => {
                  setEditingTask(null);
                  setIsTaskModalOpen(true);
                }}
                className={`py-3 px-5 rounded-2xl text-xs font-bold font-sans cursor-pointer flex items-center justify-center gap-2 duration-300 transform hover:scale-[1.03] shrink-0 ${customStyle.useCustomColor ? 'custom-primary-bg custom-shadow' : activeTheme.primaryClass}`}
              >
                <Plus className="w-4 h-4 text-white" />
                <span>タスクを追加 (ポップアップ)</span>
              </button>
            </div>
          </div>
        )}

        {/* 🚨 Urgent Imminent Threats Notification Banner for manga/illust otakus */}
        {urgentImminentItems.length > 0 && (
          <div 
            className="mb-5 p-4 rounded-3xl border-2 relative overflow-hidden flex flex-col md:flex-row items-center gap-4 animate-bounce-slow"
            style={{ 
              background: `linear-gradient(to right, ${customSub}15, ${customAccent}08, ${customSub}15)`, 
              borderColor: customAccent 
            }}
          >
            <div className="flex-shrink-0 relative">
              <img 
                src={customStyle.deadlineCatUrl || "/src/assets/images/sticker_deadline_cat_1780950114571.png"} 
                alt="締め切りピンチ" 
                referrerPolicy="no-referrer"
                className="w-16 h-16 object-contain rotate-[-5deg] drop-shadow-lg select-none"
              />
              <span 
                className="absolute -top-1 -right-1 text-white font-black text-[10px] px-1.5 py-0.5 rounded-full ring-2 ring-white"
                style={{ backgroundColor: customAccent }}
              >
                SOS
              </span>
            </div>
            
            <div className="flex-1 w-full">
              <div className="flex items-center gap-2 mb-1.5 justify-center md:justify-start">
                <Bell className="w-4 h-4 animate-swing" style={{ color: customAccent }} />
                <h3 
                  className="text-sm font-black tracking-wider"
                  style={{ color: isDark ? '#f3effc' : customAccent }}
                >
                  ⚠️ 進行ピンチ！期限間近または進捗遅れの作業・TODOが {urgentImminentItems.length} 件あります！
                </h3>
              </div>
              
              {/* alerts badge list */}
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {urgentImminentItems.map((item, idx) => {
                  const hasTask = item.source === 'task' && !!item.id;
                  return (
                    <button 
                      key={idx}
                      type="button"
                      disabled={!hasTask}
                      onClick={() => {
                        if (item.id) {
                          setSelectedTaskId(item.id);
                          window.scrollTo({ top: 300, behavior: 'smooth' });
                        }
                      }}
                      className="px-3 py-1.5 rounded-2xl border text-xs flex flex-row items-center gap-2.5 shadow-xs transition duration-150"
                      style={{ 
                        borderColor: `${customAccent}3b`,
                        backgroundColor: isDark ? `${customAccent}22` : `${customAccent}0e`,
                        cursor: hasTask ? 'pointer' : 'default',
                        transform: 'none'
                      }}
                      title={hasTask ? 'クリックしてお仕事ワークスペースを開く 🚀' : undefined}
                    >
                      <span className="font-extrabold max-w-[120px] truncate" style={{ color: customAccent }}>{item.title}</span>
                      <span 
                        className="text-[10px] py-0.5 px-2 rounded-full text-white font-mono shrink-0 font-bold"
                        style={{ backgroundColor: customAccent }}
                      >
                        あと {item.daysLeft} 日
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-500 text-[9px] font-black shrink-0">
                        {item.reason}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-indigo-200 shrink-0 font-medium">({item.detail})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Main interactive split panel - Left tasks menu, Right detailed checker */}
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          
          {/* Left panel: Task Lists Overview */}
          <div className="w-full sm:w-[260px] md:w-[310px] shrink-0 space-y-4 block custom-sidebar-container">
            
            {/* Filter tab row - no background, clean border */}
            <div 
              className={`p-1 rounded-2xl border flex gap-1`}
              style={{
                backgroundColor: 'transparent',
                borderColor: customStyle.useCustomColor ? `${customSub}40` : undefined
              }}
            >
              <button
                id="filter-all-btn"
                onClick={() => setFilterType('all')}
                className={`flex-1 py-1 px-2.5 text-[11px] text-center font-bold rounded-xl cursor-pointer transition`}
                style={{
                  backgroundColor: filterType === 'all' 
                    ? (isDark ? `${customAccent}25` : `${customAccent}14`) 
                    : 'transparent',
                  color: filterType === 'all' ? customAccent : (isDark ? '#94a3b8' : '#726d88')
                }}
              >
                全部
              </button>
              <button
                id="filter-manga-btn"
                onClick={() => setFilterType('manga')}
                className={`flex-1 py-1 px-2.5 text-[11px] text-center font-bold rounded-xl cursor-pointer transition`}
                style={{
                  backgroundColor: filterType === 'manga' 
                    ? (isDark ? `${customAccent}25` : `${customAccent}14`) 
                    : 'transparent',
                  color: filterType === 'manga' ? customAccent : (isDark ? '#94a3b8' : '#726d88')
                }}
              >
                マンガ
              </button>
              <button
                id="filter-illust-btn"
                onClick={() => setFilterType('illust')}
                className={`flex-1 py-1 px-2.5 text-[11px] text-center font-bold rounded-xl cursor-pointer transition`}
                style={{
                  backgroundColor: filterType === 'illust' 
                    ? (isDark ? `${customAccent}25` : `${customAccent}14`) 
                    : 'transparent',
                  color: filterType === 'illust' ? customAccent : (isDark ? '#94a3b8' : '#726d88')
                }}
              >
                イラスト
              </button>
            </div>

            {/* Tasks list */}
            <div className="space-y-2.5 max-h-[640vh] overflow-y-auto px-2 py-1.5 overflow-x-hidden">
              
              {/* Home navigation item button to return to the top page - Completely transparent when unselected, dynamic background when selected */}
              <button
                id="home-dashboard-tab-btn"
                onClick={() => setSelectedTaskId(null)}
                className={`w-full p-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-200 flex items-center justify-between gap-3 focus:outline-none focus:ring-0 ${
                  selectedTaskId === null 
                    ? `border-l-4 shadow-sm scale-[1.01]`
                    : `border-slate-150 border-l-4 border-l-slate-300 dark:border-indigo-850`
                }`}
                style={{
                  backgroundColor: selectedTaskId === null 
                    ? (isDark ? `${customAccent}2a` : `${customAccent}14`)
                    : 'transparent',
                  borderColor: selectedTaskId === null 
                    ? customAccent 
                    : (isDark ? '#2a2440' : '#e2e8f0'),
                  borderLeftColor: selectedTaskId === null 
                    ? customAccent 
                    : (isDark ? '#4b5563' : '#cbd5e1')
                }}
                title="ダッシュボード(カレンダー・TODO一覧)を表示"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg shrink-0">🏠</span>
                  <div className="min-w-0">
                    <span className="block text-xs font-black truncate text-slate-800 dark:text-indigo-150">
                      ホーム / ダッシュボード
                    </span>
                    <span className="block text-[10px] text-slate-400 block mt-0.5">
                      📅 カレンダー ＆ 📌 全体TODO
                    </span>
                  </div>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-500 dark:bg-indigo-950/40 dark:text-indigo-200 font-bold px-1.5 py-0.5 rounded-lg shrink-0 uppercase">
                  HOME
                </span>
              </button>

              {/* Sidebar items separator */}
              <div className="flex items-center gap-2 py-1 px-1">
                <span className="block h-[1px] bg-slate-200/50 flex-1" />
                <span className="text-[9px] font-black text-slate-450 tracking-wider">個別のワークスペース</span>
                <span className="block h-[1px] bg-slate-200/50 flex-1" />
              </div>

              {filteredTasks.length === 0 ? (
                <div 
                  className="p-8 text-center rounded-2xl border-2 border-dashed"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: `${customAccent}35`
                  }}
                >
                  <p className="text-xs text-slate-400 font-medium">登録されているお仕事はありません</p>
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const isSelected = task.id === selectedTaskId;
                  const progressVal = getTaskProgressPercentage(task);

                  // Cal days diff color and border alerts to satisfy "締め切りが近づくとタスクの色が変わる"
                  const deadlineDate = new Date(task.deadline);
                  const today = new Date();
                  const oneDay = 24 * 60 * 60 * 1000;
                  const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / oneDay);

                  let statusTitle = '';

                  if (daysLeft <= 1) {
                    statusTitle = '🚨直前！';
                  } else if (daysLeft <= 3) {
                    statusTitle = '⚠️急ぎ！';
                  } else if (daysLeft <= 7) {
                    statusTitle = '📅今週';
                  } else {
                    statusTitle = '🌴余裕';
                  }

                  return (
                    <button
                      id={`task-card-${task.id}`}
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`w-full p-4 rounded-2xl border text-left cursor-pointer transition-all duration-200 flex flex-col justify-between border-l-4 hover:scale-[1.01] active:scale-[0.99] hover:shadow-xs focus:outline-none focus:ring-0`}
                      style={{
                        backgroundColor: isSelected 
                          ? (isDark ? `${customAccent}2a` : `${customAccent}14`)
                          : 'transparent',
                        borderColor: isSelected 
                          ? customAccent 
                          : (isDark ? '#2a2440' : '#e2e8f0'),
                        borderLeftColor: isSelected 
                          ? customAccent 
                          : (daysLeft <= 1 ? '#ef4444' : daysLeft <= 3 ? '#fbbf24' : (isDark ? '#4b5563' : '#cbd5e1'))
                      }}
                    >
                      <div>
                        {/* Status ribbon and task metadata */}
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-black tracking-wider uppercase opacity-40">
                            {task.type === 'manga' ? `📖 マンガ (${task.totalPages}p)` : task.type === 'illust' ? '🎨 イラスト (1枚)' : '🤝 打ち合わせ'}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            daysLeft <= 1 
                              ? 'bg-rose-200 text-rose-800 dark:bg-rose-900/40 dark:text-rose-250 animate-bounce-slow' 
                              : daysLeft <= 3
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-905/30'
                                : 'bg-slate-100 text-slate-500 dark:bg-indigo-805/30 dark:text-indigo-200'
                          }`}>
                            {statusTitle} {daysLeft < 0 ? '終了' : `あと${daysLeft}日`}
                          </span>
                        </div>

                        {/* Task project Title */}
                        <h4 className={`text-sm font-black font-sans leading-tight line-clamp-1 ${
                          isSelected ? 'text-slate-800 dark:text-indigo-150' : 'opacity-90'
                        }`}>
                          {task.title}
                        </h4>

                        {/* Client details & Primary deadline */}
                        <div className="flex flex-col gap-0.5 mt-1.5">
                          <p className="text-[11px] opacity-65 flex items-center gap-1.5">
                            <User className="w-3 h-3 flex-shrink-0 text-slate-400 dark:text-indigo-300" />
                            <span className="truncate">{task.clientName || '個人用（宛先なし）'}</span>
                          </p>
                          <p className={`text-[10px] flex items-center gap-1.5 font-bold ${
                            daysLeft <= 1 
                              ? 'text-rose-500 dark:text-rose-450 animate-pulse' 
                              : daysLeft <= 3 
                                ? 'text-amber-500 dark:text-amber-400' 
                                : 'text-slate-500 dark:text-indigo-300'
                          }`}>
                            <CalendarIcon className="w-3 h-3 flex-shrink-0" />
                            <span>原稿締切: {task.deadline}</span>
                          </p>
                        </div>

                        {/* Manga Optional Deadlines (Plot, Name, Lineart) (Request 2) */}
                        {task.type === 'manga' && (task.plotDeadline || task.nameDeadline || task.lineartDeadline) && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5 pt-1.5 border-t border-dashed border-slate-100 dark:border-indigo-950/20 text-[9px] text-slate-450 dark:text-indigo-300/70">
                            {task.plotDeadline && (
                              <span className="bg-slate-50 dark:bg-indigo-950/40 px-1 py-0.5 rounded-sm">P: {task.plotDeadline.substring(5)}</span>
                            )}
                            {task.nameDeadline && (
                              <span className="bg-slate-50 dark:bg-indigo-950/40 px-1 py-0.5 rounded-sm">N: {task.nameDeadline.substring(5)}</span>
                            )}
                            {task.lineartDeadline && (
                              <span className="bg-slate-50 dark:bg-indigo-950/40 px-1 py-0.5 rounded-sm">L: {task.lineartDeadline.substring(5)}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Small inline Mini progress bar with lovely percentage indicator */}
                      <div className="mt-3 w-full">
                        <div className="flex items-center justify-between text-[10px] opacity-75 font-mono mb-1">
                          <span>進捗状況</span>
                          <span>{progressVal}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div 
                            className={`h-full duration-550 ease-out rounded-full ${
                              progressVal === 100 
                                ? 'bg-linear-to-r from-pink-400 to-amber-300' 
                                : 'bg-linear-to-r from-emerald-400 to-indigo-500'
                            }`}
                            style={{ width: `${progressVal}%` }}
                          />
                        </div>
                      </div>

                    </button>
                  );
                })
              )}
            </div>

          </div>

          {/* Right panel: Table Details & Check grid to modify task progress in absolute real-time */}
          <div className="flex-1 min-w-0 w-full custom-content-container border-0" style={{ border: 'none' }}>
            {selectedTaskId === null ? (
              <div className="space-y-6">
                
                {/* Dashboard Welcome Block */}
                <div 
                  className={`p-6 rounded-3xl border-2 ${activeTheme.cardClass} relative overflow-hidden`}
                  style={{
                    background: `linear-gradient(135deg, ${customAccent}08, ${customSub}08)`,
                    borderColor: `${customAccent}20`
                  }}
                >
                  <div className="relative z-10 flex flex-col md:flex-row items-center gap-5 justify-between">
                    <div>
                      <h2 className="text-lg font-black font-sans leading-none flex items-center gap-2 custom-primary-text">
                        <span>{customStyle.showEmojis ? '👑' : ''} {customStyle.dashboardTitle || 'クリエイティブスタジオ・ダッシュボード'}</span>
                      </h2>
                      <div className="text-xs text-slate-500 dark:text-indigo-200 mt-2 leading-relaxed whitespace-pre-wrap">
                        {customStyle.dashboardContent ? customStyle.dashboardContent : (
                          <>
                            ようこそ！ここは作品制作の司令塔です。💡<br />
                            サイドメニューでお仕事を選択すると、工程別（ネーム、下書き、線画など）の進捗チェック管理画面に変わります。<br />
                            カレンダーでは締め切り、打合せのご予定、期限付きTODOが分かりやすく登録・確認できます。
                          </>
                        )}
                      </div>
                    </div>

                    <div 
                      className="shrink-0 flex items-center gap-2 text-xs py-2 px-3 rounded-2xl border font-bold"
                      style={{
                        borderColor: `${customAccent}35`,
                        color: customAccent,
                        backgroundColor: isDark ? `${customAccent}1b` : `${customAccent}0a`
                      }}
                    >
                      <span>{customStyle.showEmojis ? '🚀' : ''} 総タスク数: {tasks.length} 件</span>
                    </div>
                  </div>
                </div>

                {/* Main Page Central Calendar view */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-indigo-300 flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4 text-rose-500" />
                      <span>📅 進行カレンダー & スケジュール（Google Calendar同期対応）</span>
                    </h3>
                  </div>
                  <CalendarAccordion
                    tasks={tasks}
                    todos={todos}
                    activeTheme={activeTheme}
                    calendarSettings={calendarSettings}
                    onSyncTask={handleManualSync}
                    onSelectTaskId={setSelectedTaskId}
                    customStyle={customStyle}
                    onCalendarSettingsChange={handleCalendarSettingsChange}
                  />
                </div>

                {/* Main Page Central TODO List Manager */}
                <div className={`p-6 rounded-3xl border-2 ${activeTheme.cardClass} space-y-4`}>
                  <div className="flex items-center justify-between pb-3 border-b border-rose-100/20">
                    <h3 className="text-sm font-black text-slate-800 dark:text-indigo-100 flex items-center gap-2">
                      <CheckSquare className="w-5 h-5 text-rose-400" />
                      <span>📌 コミック・イラスト用TODO & 期限付きやること</span>
                    </h3>
                    <span className="text-[10px] bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-extrabold px-2 py-0.5 rounded-lg">
                      {todos.filter(t => !t.completed).length} 件未完了
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Add todo box */}
                    <div className="space-y-4 p-4 rounded-2xl bg-slate-50/50 dark:bg-indigo-950/10 border border-slate-150/60 dark:border-indigo-850/50">
                      <h4 className="text-xs font-bold text-slate-600 dark:text-indigo-200">✨ やることをサクッと追加</h4>
                      <form 
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!newTodoTitle.trim()) return;
                          handleAddTodo(newTodoTitle, newTodoDeadline || undefined);
                          setNewTodoTitle('');
                          setNewTodoDeadline('');
                        }}
                        className="space-y-2.5"
                      >
                        <input
                          id="dash-todo-title-input"
                          type="text"
                          placeholder="タスク内容を入力してね..."
                          value={newTodoTitle}
                          onChange={(e) => setNewTodoTitle(e.target.value)}
                          className={`w-full text-xs px-3 py-2 rounded-xl focus:outline-hidden focus:ring-1 border bg-white dark:bg-indigo-950/40 border-slate-200 dark:border-indigo-800 text-slate-900 dark:text-white focus:ring-rose-455`}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            id="dash-todo-deadline-input"
                            type="date"
                            value={newTodoDeadline}
                            onChange={(e) => setNewTodoDeadline(e.target.value)}
                            className="text-xs px-2.5 py-1.5 rounded-xl border bg-white dark:bg-indigo-950/40 border-slate-200 dark:border-indigo-805 text-slate-900 dark:text-white"
                          />
                          <button
                            id="dash-todo-submit-btn"
                            type="submit"
                            className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold cursor-pointer transition ${customStyle.useCustomColor ? 'custom-primary-bg' : activeTheme.primaryClass}`}
                          >
                            追加する
                          </button>
                        </div>
                      </form>
                      <p className="text-[10px] text-slate-400 leading-relaxed font-semibold">
                        ※日付をいれると、Googleカレンダーとも連携でき、締切3日前になると自動でアラーム警告に反映されます！
                      </p>
                    </div>

                    {/* Todo mapping board */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {todos.length === 0 ? (
                        <div className="py-12 text-center border border-dashed border-slate-150/60 dark:border-indigo-850 rounded-2xl">
                          <p className="text-xs text-slate-400 font-semibold">現在、やることTODOはありません！🍵</p>
                        </div>
                      ) : (
                        todos.map((todo) => {
                          // check deadline color
                          let isNearDeadline = false;
                          let daysLeft = 99;
                          if (todo.deadline && !todo.completed) {
                            const dl = new Date(todo.deadline);
                            const tdy = new Date();
                            const diff = dl.getTime() - tdy.getTime();
                            daysLeft = Math.ceil(diff / (24 * 60 * 60 * 1000));
                            if (daysLeft <= 3) isNearDeadline = true;
                          }

                          return (
                            <div 
                              key={todo.id}
                              className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 duration-150 ${
                                todo.completed 
                                  ? 'bg-slate-50/50 dark:bg-indigo-950/10 opacity-60 border-slate-100 dark:border-transparent' 
                                  : isNearDeadline 
                                    ? 'bg-rose-500/10 border-rose-300 animate-pulse-slow' 
                                    : 'bg-white dark:bg-indigo-900/30 border-slate-150 dark:border-indigo-800'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <button
                                  id={`dash-todo-toggle-${todo.id}`}
                                  type="button"
                                  onClick={() => handleToggleTodo(todo.id)}
                                  className="text-rose-455 hover:text-rose-500 cursor-pointer shrink-0"
                                >
                                  {todo.completed ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-500 fill-emerald-500/10" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300 dark:text-indigo-805" />
                                  )}
                                </button>
                                <div className="min-w-0">
                                  <span className={`block font-bold leading-none truncate ${todo.completed ? 'line-through text-slate-400' : 'text-slate-800 dark:text-indigo-150'}`}>
                                    {todo.title}
                                  </span>
                                  {todo.deadline && (
                                    <span className={`text-[10px] font-semibold flex items-center gap-0.5 mt-1 ${isNearDeadline ? 'text-rose-500' : 'text-slate-400'}`}>
                                      <CalendarIcon className="w-3 h-3 shrink-0" />
                                      {todo.deadline}まで（{daysLeft < 0 ? '期限超過' : `あと ${daysLeft}日`}）
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {!todo.completed && todo.deadline && !todo.calendarEventId && calendarSettings.accessToken && (
                                  <button
                                    id={`dash-todo-sync-${todo.id}`}
                                    onClick={() => handleSyncTodoEvent(todo)}
                                    className="p-1 rounded-lg text-slate-450 hover:bg-slate-100 hover:text-indigo-500 dark:hover:bg-indigo-900/50 cursor-pointer"
                                    title="Googleカレンダーに同期"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  id={`dash-todo-del-${todo.id}`}
                                  onClick={() => handleDeleteTodo(todo.id)}
                                  className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/30 cursor-pointer"
                                  title="削除"
                                >
                                  <Trash className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <ProgressTable
                task={selectedTask}
                tasks={tasks}
                onSelectTaskId={setSelectedTaskId}
                activeTheme={activeTheme}
                onToggleCell={handleToggleCell}
                onEditTask={(t) => {
                  setEditingTask(t);
                  setIsTaskModalOpen(true);
                }}
                onDeleteTask={handleDeleteTask}
                onSyncCalendar={handleManualSync}
                calendarConnected={!!calendarSettings.accessToken}
                customStyle={customStyle}
                onBackToList={() => setSelectedTaskId(null)}
              />
            )}
          </div>

        </div>

      </div>

      {/* --- Pop-up modals --- */}
      
      {/* 1. Settings Menu customization */}
      {isSettingModalOpen && (
        <SettingModal
          isOpen={isSettingModalOpen}
          onClose={() => setIsSettingModalOpen(false)}
          activeTheme={activeTheme}
          onThemeChange={handleThemeChange}
          calendarSettings={calendarSettings}
          onCalendarSettingsChange={handleCalendarSettingsChange}
          onLogout={handleLogout}
          customStyle={customStyle}
          onCustomStyleChange={(updatedStyle) => {
            setCustomStyle(updatedStyle);
            localStorage.setItem(LOCAL_STORAGE_STYLE_KEY, JSON.stringify(updatedStyle));
          }}
        />
      )}

      {/* 2. Task Form creation and Modification popped up */}
      {isTaskModalOpen && (
        <TaskFormModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setEditingTask(null);
          }}
          onSave={handleSaveTask}
          editingTask={editingTask}
          activeTheme={activeTheme}
          customStyle={customStyle}
        />
      )}

      {/* 3. Draggable stickers overlay layer */}
      {customStyle.showStickers !== false && (
        <StickerOverlay
          stickers={stickers}
          onStickersChange={handleStickersChange}
          activeTheme={activeTheme}
          customStyle={customStyle}
        />
      )}

    </div>
  );
}
