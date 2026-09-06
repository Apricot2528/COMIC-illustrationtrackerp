/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {Task, CalendarSettings, Todo, CustomStyleConfig } from '../types';
import { RefreshCw } from 'lucide-react';

interface CalendarAccordionProps {
  tasks: Task[];
  todos?: Todo[];
  calendarSettings: CalendarSettings;
  onSyncTask: (task: Task) => void;
  onSelectTaskId?: (taskId: string) => void;
  customStyle?: CustomStyleConfig;
  onCalendarSettingsChange?: (settings: CalendarSettings) => void;
  onConnect?: () => void;
}


export default function CalendarAccordion({
  tasks,
  todos = [],
  calendarSettings,
  onSyncTask,
  onSelectTaskId,
  customStyle,
  onCalendarSettingsChange,
  onConnect
}: CalendarAccordionProps) {
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


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

  // Local deadlines synthesized from current tasks and todos
  const localDeadlinesAndMeetings = React.useMemo(() => {
    const events: { title: string; date: string; type: 'deadline' | 'meeting' | 'todo'; taskTitle: string; taskId?: string }[] = [];
    
    // 1. Scan tasks
    tasks.forEach((task) => {
      if (task.deadline) {
        events.push({
          title: `原稿締切　${task.title}`,
          date: task.deadline,
          type: 'deadline',
          taskTitle: task.title,
          taskId: task.id
        });
      }
      if (task.type === 'manga') {
        if (task.plotDeadline) {
          events.push({
            title: `プロット締切　${task.title}`,
            date: task.plotDeadline,
            type: 'deadline',
            taskTitle: task.title,
            taskId: task.id
          });
        }
        if (task.nameDeadline) {
          events.push({
            title: `ネーム締切　${task.title}`,
            date: task.nameDeadline,
            type: 'deadline',
            taskTitle: task.title,
            taskId: task.id
          });
        }
        if (task.lineartDeadline) {
          events.push({
            title: `線画締切　${task.title}`,
            date: task.lineartDeadline,
            type: 'deadline',
            taskTitle: task.title,
            taskId: task.id
          });
        }
      }
      if (task.meetingDate) {
        events.push({
          title: `打合せ　${task.title}`,
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
          title: `TODO　${todo.title}`,
          date: todo.deadline,
          type: 'todo',
          taskTitle: todo.title
        });
      }
    });

    // Sort by date ascending
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [tasks, todos]);

  // ローカル予定と Google 予定を 1 本のリストに混ぜ、日付順に並べる。
  // 区別のためのアイコンやバッジは付けず、Google 由来だけ補助色で組む。
  const merged = React.useMemo(() => {
    const rows: { key: string; date: Date; md: string; title: string; time: string; taskId?: string; google: boolean }[] = [];

    const pad = (n: number) => String(n).padStart(2, '0');
    const toRow = (raw: string) => {
      const d = new Date(raw.includes('T') || raw.includes(' ') ? raw : `${raw}T00:00:00`);
      const hasTime = /[T ]\d{2}:\d{2}/.test(raw);
      return {
        date: d,
        md: Number.isNaN(d.getTime()) ? '--.--' : `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
        time: hasTime && !Number.isNaN(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '',
      };
    };

    localDeadlinesAndMeetings.forEach((e, idx) => {
      const r = toRow(e.date);
      rows.push({ key: `l${idx}`, date: r.date, md: r.md, title: e.title, time: r.time, taskId: e.taskId, google: false });
    });

    googleEvents.forEach((evt: any, idx: number) => {
      const raw = evt.start?.dateTime || evt.start?.date;
      if (!raw) return;
      const r = toRow(raw);
      rows.push({ key: `g${idx}`, date: r.date, md: r.md, title: evt.summary || '（件名なし）', time: r.time, google: true });
    });

    return rows
      .filter((r) => !Number.isNaN(r.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [localDeadlinesAndMeetings, googleEvents]);

  return (
    <div>
      {!calendarSettings.accessToken && (
        <div className="rule-b mb-3 flex items-center justify-between gap-3 pb-3">
          <span className="text-note text-hojo">Googleカレンダー未接続</span>
          <button type="button" onClick={onConnect} className="btn shrink-0">
            接続する
          </button>
        </div>
      )}

      {calendarSettings.accessToken && (
        <div className="mb-3 flex items-center justify-end">
          <button
            id="refresh-calendar-events-btn"
            onClick={fetchGoogleEvents}
            className="flex items-center gap-1.5 text-note text-hojo"
            title="Googleカレンダーを読み直す"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.25} />
            更新
          </button>
        </div>
      )}

      {error && <p className="mb-3 text-note text-accent">{error}</p>}
      {isLoading && <p className="mb-3 text-note text-hojo">読み込み中…</p>}

      {merged.length === 0 ? (
        <p className="text-note text-hojo">予定はありません。</p>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto">
          {merged.map((row) => (
            <li key={row.key} className="rule-b">
              <button
                type="button"
                disabled={!row.taskId}
                onClick={() => { if (row.taskId) onSelectTaskId?.(row.taskId); }}
                className="tap flex w-full items-center gap-3 py-3 text-left md:py-[9px]"
                style={{ cursor: row.taskId ? 'pointer' : 'default' }}
              >
                <span className={`num shrink-0 text-note ${row.google ? 'text-hojo' : ''}`}>{row.md}</span>
                <span className={`min-w-0 flex-1 truncate text-note ${row.google ? 'text-hojo' : 'text-sumi'}`}>
                  {row.title}
                </span>
                <span className="num shrink-0 text-note text-hojo">{row.time}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
