/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Task, ThemeConfig, CalendarSettings, Todo, CustomStyleConfig } from '../types';
import { Calendar, ChevronDown, ChevronUp, AlertCircle, RefreshCw, CalendarDays, Clock, Sparkles } from 'lucide-react';
import { startGoogleAuth } from '../utils/calendar';

interface CalendarAccordionProps {
  tasks: Task[];
  todos?: Todo[];
  activeTheme: ThemeConfig;
  calendarSettings: CalendarSettings;
  onSyncTask: (task: Task) => void;
  onSelectTaskId?: (taskId: string) => void;
  customStyle?: CustomStyleConfig;
  onCalendarSettingsChange?: (settings: CalendarSettings) => void;
}

const PRESET_THEME_COLORS = {
  pastel: {
    accentColor: '#ffd803',
    subColor: '#2d334a',
    dark: { accentColor: '#ffd803', subColor: '#828ba3' }
  },
  sage: {
    accentColor: '#0e172c',
    subColor: '#ff70a6',
    dark: { accentColor: '#fec7d7', subColor: '#ff758f' }
  },
  autumn: {
    accentColor: '#6246ea',
    subColor: '#907eff',
    dark: { accentColor: '#a78bfa', subColor: '#818cf8' }
  },
  pop: {
    accentColor: '#3da9fc',
    subColor: '#5f6c7b',
    dark: { accentColor: '#3da9fc', subColor: '#38bdf8' }
  },
  indigo: {
    accentColor: '#9a7b56',
    subColor: '#c19b6c',
    dark: { accentColor: '#d7b58e', subColor: '#be9b7b' }
  }
};

export default function CalendarAccordion({
  tasks,
  todos = [],
  activeTheme,
  calendarSettings,
  onSyncTask,
  onSelectTaskId,
  customStyle,
  onCalendarSettingsChange
}: CalendarAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempClientId, setTempClientId] = useState(calendarSettings.clientId || '');
  const [copied, setCopied] = useState(false);

  // Google認証完了している場合、またはトークンがある場合はアコーディオンを自動で開く
  useEffect(() => {
    if (calendarSettings.accessToken) {
      setIsOpen(true);
    }
  }, [calendarSettings.accessToken]);

  // 同期ClientIdの最新状態をローカルに反映
  useEffect(() => {
    setTempClientId(calendarSettings.clientId || '');
  }, [calendarSettings.clientId]);

  // Fetch real Google Calendar events if connected
  useEffect(() => {
    if (isOpen && calendarSettings.accessToken) {
      fetchGoogleEvents();
    }
  }, [isOpen, calendarSettings.accessToken, calendarSettings.calendarId]);

  const fetchGoogleEvents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const timeMin = new Date().toISOString();
      const calendarId = encodeURIComponent(calendarSettings.calendarId || 'primary');
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${timeMin}&maxResults=8&orderBy=startTime&singleEvents=true`,
        {
          headers: {
            'Authorization': `Bearer ${calendarSettings.accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!res.ok) {
        throw new Error(`エラー (${res.status}): APIの取得に失敗しました。トークンが失効している可能性があります。`);
      }

      const data = await res.json();
      setGoogleEvents(data.items || []);
    } catch (err: any) {
      console.error('Failed to fetch google calendar events:', err);
      setError(err?.message || 'イベントのロードに失敗しました。設定で再連携してください。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyRedirectUri = () => {
    const redirectUri = window.location.origin + window.location.pathname;
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveAndConnect = () => {
    if (!tempClientId.trim()) {
      alert('クライアントIDを入力してください。💧');
      return;
    }
    const updated = {
      ...calendarSettings,
      clientId: tempClientId.trim()
    };
    if (onCalendarSettingsChange) {
      onCalendarSettingsChange(updated);
    }
    // Trigger auth immediately with GAPI flow
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ];
    startGoogleAuth(tempClientId.trim(), scopes);
  };

  const handleTriggerAuth = () => {
    if (!calendarSettings.clientId) {
      alert('クライアントIDが設定されていません。💧');
      return;
    }
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ];
    startGoogleAuth(calendarSettings.clientId, scopes);
  };

  // Local deadlines synthesized from current tasks and todos
  const localDeadlinesAndMeetings = React.useMemo(() => {
    const events: { title: string; date: string; type: 'deadline' | 'meeting' | 'todo'; taskTitle: string; taskId?: string }[] = [];
    
    // 1. Scan tasks
    tasks.forEach((task) => {
      if (task.deadline) {
        events.push({
          title: `🏁 原稿締切: 「${task.title}」`,
          date: task.deadline,
          type: 'deadline',
          taskTitle: task.title,
          taskId: task.id
        });
      }
      if (task.type === 'manga') {
        if (task.plotDeadline) {
          events.push({
            title: `📝 プロット締切: 「${task.title}」`,
            date: task.plotDeadline,
            type: 'deadline',
            taskTitle: task.title,
            taskId: task.id
          });
        }
        if (task.nameDeadline) {
          events.push({
            title: `🎨 ネーム締切: 「${task.title}」`,
            date: task.nameDeadline,
            type: 'deadline',
            taskTitle: task.title,
            taskId: task.id
          });
        }
        if (task.lineartDeadline) {
          events.push({
            title: `✒️ 線画締切: 「${task.title}」`,
            date: task.lineartDeadline,
            type: 'deadline',
            taskTitle: task.title,
            taskId: task.id
          });
        }
      }
      if (task.meetingDate) {
        events.push({
          title: `🤝 打合: 「${task.title}」 様`,
          date: task.meetingDate.replace('T', ' '),
          type: 'meeting',
          taskTitle: task.title,
          taskId: task.id
        });
      }
    });

    // 2. Scan uncompleted todos with deadline
    todos.forEach((todo) => {
      if (todo.deadline && !todo.completed) {
        events.push({
          title: `📌 TODO: 「${todo.title}」`,
          date: todo.deadline,
          type: 'todo',
          taskTitle: todo.title
        });
      }
    });

    // Sort by date ascending
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [tasks, todos]);

  const isDark = activeTheme.id === 'cosmic' || !!customStyle?.darkMode;

  const currentPreset = customStyle?.themePreset || 'pastel';
  const isPresetCustom = currentPreset === 'custom';
  const presetDefaults = PRESET_THEME_COLORS[currentPreset as 'pastel' | 'sage' | 'autumn' | 'pop' | 'indigo'] || PRESET_THEME_COLORS.pastel;
  const customAccent = isPresetCustom ? (customStyle?.accentColor || '#9b7fe8') : (isDark ? presetDefaults.dark.accentColor : presetDefaults.accentColor);
  const customSub = isPresetCustom ? (customStyle?.subColor || '#e197b9') : (isDark ? presetDefaults.dark.subColor : presetDefaults.subColor);

  return (
    <div className={`rounded-2xl border-2 mb-4 overflow-hidden transition-all duration-300 ${activeTheme.cardClass}`}>
      
      {/* Accordion Toggle Box */}
      <button
        id="toggle-calendar-accordion"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 flex items-center justify-between text-left cursor-pointer hover:bg-slate-50/55 dark:hover:bg-indigo-900/20 duration-200"
      >
        <div className="flex items-center gap-2.5">
          <Calendar className="w-5 h-5 animate-pulse" style={{ color: customAccent }} />
          <div>
            <span className="text-xs font-bold uppercase tracking-wider block text-slate-400">カレンダー連携</span>
            <span className={`text-sm font-extrabold flex items-center gap-1.5 ${isDark ? 'text-indigo-100' : 'text-slate-800'}`}>
              ◼️ 登録イベント・スケジュール予定一覧（タップで折りたたみ）
              {calendarSettings.accessToken && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold ml-1.5">
                  ● Google同期中
                </span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {calendarSettings.accessToken && isOpen && (
            <button
              id="refresh-calendar-events-btn"
              onClick={(e) => {
                e.stopPropagation();
                fetchGoogleEvents();
              }}
              className="p-1 px-2 text-[10px] rounded-lg border hover:bg-slate-100 dark:hover:bg-indigo-800 text-slate-500 hover:text-indigo-600 flex items-center gap-1 duration-200"
              title="Googleカレンダー情報更新"
            >
              <RefreshCw className="w-3 h-3" />
              更新
            </button>
          )}
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Slide Content */}
      {isOpen && (
        <div 
          className="p-4 border-t max-h-[350px] overflow-y-auto transition-colors duration-300"
          style={{
            backgroundColor: isDark ? `${customAccent}10` : `${customAccent}04`,
            borderTopColor: `${customAccent}18`
          }}
        >
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Column 1: Live Google Calendar Service Events */}
            <div className="space-y-2">
              <h3 
                className="text-xs font-extrabold flex items-center gap-1.5 border-b pb-1"
                style={{
                  color: customAccent,
                  borderBottomColor: `${customAccent}20`
                }}
              >
                <CalendarDays className="w-4 h-4" style={{ color: customAccent }} />
                Google カレンダー登録中の予定 (クラウド)
              </h3>

              {!calendarSettings.accessToken ? (
                <div className="p-4 rounded-2xl bg-amber-500/5 dark:bg-amber-550/5 border border-amber-500/15 text-center leading-relaxed space-y-3.5 my-1.5 max-w-sm mx-auto shadow-xs">
                  <div className="flex flex-col items-center gap-1">
                    <Sparkles className="w-5 h-5 text-amber-500 animate-spin-slow" />
                    <p className="text-xs font-black text-amber-700 dark:text-amber-300">
                      Googleカレンダー連携
                    </p>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      予定の同期やTODOのクラウド同期を一発で行えるようになります！✨
                    </p>
                  </div>

                  {calendarSettings.clientId ? (
                    <div className="space-y-2">
                      <p className="text-[9px] text-slate-400 font-mono">
                        保存済みID: <span className="opacity-80">{calendarSettings.clientId.substring(0, 15)}...</span>
                      </p>
                      <button
                        type="button"
                        onClick={handleTriggerAuth}
                        className="py-2 px-4 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl cursor-pointer duration-150 shadow-sm flex items-center justify-center gap-1.5 w-full transform hover:scale-[1.01] active:scale-[0.99]"
                      >
                        ⚡ ワンクリックでカレンダー接続 🔑
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 text-left">
                      <div className="space-y-1.5">
                        <label className="block text-[9.5px] font-bold text-slate-450 dark:text-indigo-300">
                          🔑 OAuth クライアントID
                        </label>
                        <input
                          id="acc-client-id-inline-input"
                          type="text"
                          placeholder="ここに クライアントID を入力..."
                          value={tempClientId}
                          onChange={(e) => setTempClientId(e.target.value)}
                          className="w-full text-[10.5px] px-2.5 py-1.5 rounded-xl border bg-white dark:bg-indigo-950 text-slate-900 dark:text-white border-slate-200 dark:border-indigo-700 focus:outline-hidden"
                        />
                      </div>
                      
                      <button
                        type="button"
                        onClick={handleSaveAndConnect}
                        className="w-full py-2 px-3 text-xs bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl cursor-pointer duration-150 text-center shadow-xs"
                      >
                        💾 保存してワンクリック接続 🚀
                      </button>

                      <div className="pt-2 border-t border-slate-200/40 text-[9.5px] text-slate-400 space-y-1">
                        <div className="flex items-center justify-between gap-1.5 bg-slate-100/50 dark:bg-indigo-900/20 p-1.5 rounded border border-slate-200/30">
                          <span className="truncate max-w-[170px]">🌐 URI: {window.location.origin}</span>
                          <button
                            type="button"
                            onClick={handleCopyRedirectUri}
                            className="text-[9px] text-indigo-550 dark:text-indigo-400 hover:underline font-bold shrink-0 cursor-pointer"
                          >
                            {copied ? '✅ コピー済' : '📋 コピー'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : isLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                  <span>Googleカレンダーから予定を読み込み中...</span>
                </div>
              ) : error ? (
                <div className="p-3 text-[11px] rounded-xl bg-rose-500/10 border border-rose-200 text-rose-600">
                  {error}
                </div>
              ) : googleEvents.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 font-medium">
                  📅 直近のGoogleカレンダーイベントはありません
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {googleEvents.map((evt) => {
                    const dateStr = evt.start?.dateTime ? 
                      new Date(evt.start.dateTime).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 
                      evt.start?.date ? `${evt.start.date} (全日)` : '日程未定';
                    return (
                      <div 
                        key={evt.id} 
                        className="p-2 rounded-xl text-xs flex justify-between items-start border transition duration-205"
                        style={{
                          backgroundColor: isDark ? `${customAccent}1b` : '#ffffff',
                          borderColor: isDark ? `${customAccent}28` : `${customAccent}10`
                        }}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-extrabold truncate text-slate-700 dark:text-indigo-200">{evt.summary}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">{evt.description ? evt.description.substring(0, 50) : '詳細なし'}</p>
                        </div>
                        <span 
                          className="text-[10px] font-bold py-0.5 px-2 rounded-md whitespace-nowrap"
                          style={{
                            backgroundColor: isDark ? `${customAccent}2d` : `${customAccent}14`,
                            color: isDark ? '#ffffff' : customAccent
                          }}
                        >
                          {dateStr}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Column 2: Local Application Scheduled Deadlines & Meetings */}
            <div className="space-y-2">
              <h3 
                className="text-xs font-extrabold flex items-center gap-1.5 border-b pb-1"
                style={{
                  color: customSub,
                  borderBottomColor: `${customSub}20`
                }}
              >
                <Clock className="w-4 h-4" style={{ color: customSub }} />
                制作お仕事の締め切り・打合せ日程 (ローカル)
              </h3>

              {localDeadlinesAndMeetings.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 font-medium">
                  🌸 登録されている締め切りや予定はありません
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {localDeadlinesAndMeetings.map((localEvt, index) => {
                    const isDeadline = localEvt.type === 'deadline';
                    const isTodo = localEvt.type === 'todo';
                    const hasTask = !!localEvt.taskId;
                    const baseColor = isDeadline ? customSub : isTodo ? customAccent : '#10b981'; // emerald for meetings
                    
                    return (
                      <button 
                        key={index}
                        type="button"
                        disabled={!hasTask}
                        onClick={() => {
                          if (localEvt.taskId) {
                            onSelectTaskId?.(localEvt.taskId);
                          }
                        }}
                        className={`p-2 rounded-xl text-xs flex justify-between items-center border w-full text-left transition duration-200 ${
                          hasTask ? 'cursor-pointer hover:scale-[1.01] active:scale-[0.99]' : 'cursor-default'
                        }`}
                        style={{
                          backgroundColor: isDark ? `${baseColor}1c` : `${baseColor}05`,
                          borderColor: isDark ? `${baseColor}2a` : `${baseColor}12`
                        }}
                        title={hasTask ? 'クリックしてお仕事ワークスペースに移動 🚀' : undefined}
                      >
                        <span 
                          className="font-bold truncate max-w-[200px]"
                          style={{ color: isDark ? '#f3effc' : baseColor }}
                        >
                          {localEvt.title}
                        </span>
                        
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span 
                            className="text-[10px] font-bold py-0.5 px-1.5 rounded-md whitespace-nowrap"
                            style={{
                              backgroundColor: isDark ? `${baseColor}2d` : `${baseColor}14`,
                              color: isDark ? '#ffffff' : baseColor
                            }}
                          >
                            {localEvt.date}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Prompt banner to connect Google */}
          <div className="mt-4 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-1.5 text-[10.5px] text-amber-600 dark:text-amber-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>予定をGoogleカレンダーにワンクリックで登録同期するには、各タスク詳細の「Cal同期」ボタンをクリックしてね！✨</span>
          </div>

        </div>
      )}

    </div>
  );
}
