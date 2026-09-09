/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Task, CalendarSettings, Todo } from '../types';
import { RefreshCw } from 'lucide-react';

interface CalendarPanelProps {
  tasks: Task[];
  todos?: Todo[];
  calendarSettings: CalendarSettings;
  onSelectTaskId?: (taskId: string) => void;
  onConnect?: () => void;
  /** 期限切れのときに新しいトークンを取り直す。取れなければ null */
  onRefreshToken?: () => Promise<string | null>;
}

/** この画面で扱う予定の1件 */
interface Entry {
  key: string;
  dateKey: string; // YYYY-MM-DD
  time: string; // HH:mm（終日なら空）
  title: string;
  taskId?: string;
  google: boolean;
  sortAt: number;
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm' / ISO 文字列を日付キーと時刻に分解する */
function parseWhen(raw: string): { dateKey: string; time: string; sortAt: number } | null {
  if (!raw) return null;
  const hasTime = /[T ]\d{2}:\d{2}/.test(raw);
  const d = new Date(hasTime ? raw : `${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return {
    dateKey: keyOf(d),
    time: hasTime ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '',
    sortAt: d.getTime(),
  };
}

export default function CalendarPanel({
  tasks,
  todos = [],
  calendarSettings,
  onSelectTaskId,
  onConnect,
  onRefreshToken,
}: CalendarPanelProps) {
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 表示中の月（その月の1日）と、選んだ日
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const monthStart = viewMonth;
  const monthEnd = useMemo(
    () => new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
    [viewMonth]
  );
  const monthKey = `${viewMonth.getFullYear()}-${pad(viewMonth.getMonth() + 1)}`;

  const token = calendarSettings.accessToken;
  const calendarId = calendarSettings.calendarId || 'primary';

  // 表示中の月ぶんの予定を取り込む。接続済みなら自動で読みに行く
  useEffect(() => {
    if (!token) {
      setGoogleEvents([]);
      return;
    }
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          timeMin: monthStart.toISOString(),
          timeMax: monthEnd.toISOString(),
          maxResults: '250',
          orderBy: 'startTime',
          singleEvents: 'true',
        });
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
        const call = (bearer: string) =>
          fetch(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });

        let res = await call(token);

        // 期限切れなら一度だけ取り直して再試行する
        if (res.status === 401 && onRefreshToken) {
          const fresh = await onRefreshToken();
          if (fresh) res = await call(fresh);
        }

        if (!res.ok) {
          throw new Error(
            res.status === 401
              ? '接続の期限が切れています。設定から接続し直してください'
              : `取得に失敗しました（${res.status}）`
          );
        }
        const data = await res.json();
        if (!cancelled) setGoogleEvents(data.items || []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || '予定の取得に失敗しました');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [token, calendarId, monthKey, monthStart, monthEnd, onRefreshToken]);

  const reload = () => setViewMonth(new Date(viewMonth));

  // アプリ側の予定（締切・打合せ・TODO）
  const localEntries = useMemo(() => {
    const out: Entry[] = [];
    const push = (raw: string, title: string, taskId?: string, k?: string) => {
      const w = parseWhen(raw);
      if (!w) return;
      out.push({ key: k || `${title}-${raw}`, ...w, title, taskId, google: false });
    };

    tasks.forEach((task) => {
      if (task.deadline) push(task.deadline, `原稿締切　${task.title}`, task.id, `d-${task.id}`);
      if (task.type === 'manga') {
        if (task.plotDeadline) push(task.plotDeadline, `プロット締切　${task.title}`, task.id, `p-${task.id}`);
        if (task.nameDeadline) push(task.nameDeadline, `ネーム締切　${task.title}`, task.id, `n-${task.id}`);
        if (task.lineartDeadline) push(task.lineartDeadline, `線画締切　${task.title}`, task.id, `l-${task.id}`);
      }
      if (task.meetingDate) push(task.meetingDate, `打合せ　${task.title}`, task.id, `m-${task.id}`);
    });

    todos.forEach((todo) => {
      if (todo.deadline && !todo.completed) push(todo.deadline, `TODO　${todo.title}`, undefined, `t-${todo.id}`);
    });

    return out;
  }, [tasks, todos]);

  // アプリが Google カレンダーへ書き出した予定の id。
  // 同じ予定を「この表の予定」と「Google の予定」で二重に出さないために使う。
  const appEventIds = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach((t) => {
      if (t.calendarEventId) ids.add(t.calendarEventId);
      if (t.meetingEventId) ids.add(t.meetingEventId);
    });
    todos.forEach((t) => {
      if (t.calendarEventId) ids.add(t.calendarEventId);
    });
    return ids;
  }, [tasks, todos]);

  // Google 側の予定（アプリが作ったものは除く）
  const googleEntries = useMemo(() => {
    const out: Entry[] = [];
    googleEvents.forEach((evt: any, i: number) => {
      const raw = evt.start?.dateTime || evt.start?.date;
      const w = parseWhen(raw);
      if (!w) return;
      // 繰り返し予定は id が「元のid_日時」に展開されるので、頭の部分でも照合する
      const gid = String(evt.id || '');
      if (gid && (appEventIds.has(gid) || appEventIds.has(gid.split('_')[0]))) return;
      out.push({
        key: `g-${evt.id || i}`,
        ...w,
        title: evt.summary || '（件名なし）',
        google: true,
      });
    });
    return out;
  }, [googleEvents, appEventIds]);

  // 日付ごとにまとめる
  const byDate = useMemo(() => {
    const map = new Map<string, Entry[]>();
    [...localEntries, ...googleEntries].forEach((e) => {
      const arr = map.get(e.dateKey);
      if (arr) arr.push(e);
      else map.set(e.dateKey, [e]);
    });
    map.forEach((arr) => arr.sort((a, b) => a.sortAt - b.sortAt));
    return map;
  }, [localEntries, googleEntries]);

  // 月のマス目（日曜始まり）
  const cells = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const offset = first.getDay();
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i - offset + 1);
      return { date: d, inMonth: d.getMonth() === viewMonth.getMonth() };
    });
  }, [viewMonth]);

  const todayKey = keyOf(new Date());

  // 下に並べる一覧。日を選んでいればその日、選んでいなければ表示中の月ぜんぶ
  const listed = useMemo(() => {
    const all = [...localEntries, ...googleEntries];
    const filtered = selectedDate
      ? all.filter((e) => e.dateKey === selectedDate)
      : all.filter((e) => e.dateKey.startsWith(monthKey));
    return filtered.sort((a, b) => a.sortAt - b.sortAt);
  }, [localEntries, googleEntries, selectedDate, monthKey]);

  const shiftMonth = (delta: number) => {
    setSelectedDate(null);
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));
  };

  return (
    <div>
      {/* 月の見出しと送り */}
      <div className="rule-b mb-2 flex items-center justify-between pb-2">
        <span className="num text-note">
          {viewMonth.getFullYear()}.{pad(viewMonth.getMonth() + 1)}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => shiftMonth(-1)} className="num tap-icon px-2 text-note text-hojo" title="前の月">
            ‹
          </button>
          <button
            onClick={() => {
              const n = new Date();
              setViewMonth(new Date(n.getFullYear(), n.getMonth(), 1));
              setSelectedDate(null);
            }}
            className="tap-icon px-2 text-note text-hojo"
            title="今月"
          >
            今月
          </button>
          <button onClick={() => shiftMonth(1)} className="num tap-icon px-2 text-note text-hojo" title="次の月">
            ›
          </button>
        </div>
      </div>

      {/* 曜日 */}
      <div className="grid grid-cols-7">
        {WEEK.map((w) => (
          <div key={w} className="pb-1 text-center text-note text-hojo">
            {w}
          </div>
        ))}
      </div>

      {/* 日付のマス */}
      <div className="grid grid-cols-7" style={{ borderTop: '0.5px solid #262A26' }}>
        {cells.map(({ date, inMonth }) => {
          const k = keyOf(date);
          const entries = byDate.get(k) || [];
          const isToday = k === todayKey;
          const isSelected = k === selectedDate;
          const localCount = entries.filter((e) => !e.google).length;
          const googleCount = entries.length - localCount;

          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelectedDate(isSelected ? null : k)}
              className="flex h-[46px] flex-col items-center justify-start gap-[3px] pt-[5px]"
              style={{
                borderBottom: '0.5px solid #D7DAD3',
                background: isSelected ? '#EDEFEA' : 'transparent',
                cursor: 'pointer',
              }}
              title={entries.length ? `${k}　${entries.length}件` : k}
            >
              <span
                className="num text-note"
                style={{
                  color: inMonth ? '#262A26' : '#D7DAD3',
                  borderBottom: isToday ? '0.5px solid #262A26' : '0.5px solid transparent',
                  lineHeight: 1.3,
                }}
              >
                {date.getDate()}
              </span>

              {/* 予定の印。アプリ側は墨の●、Google は補助色の○ */}
              <span className="flex items-center justify-center gap-[2px] leading-none" style={{ height: '12px' }}>
                {Array.from({ length: Math.min(localCount, 3) }).map((_, i) => (
                  <span key={`l${i}`} className="text-note leading-none text-sumi">
                    ●
                  </span>
                ))}
                {Array.from({ length: Math.min(googleCount, 3 - Math.min(localCount, 3)) }).map((_, i) => (
                  <span key={`g${i}`} className="text-note leading-none text-hojo">
                    ○
                  </span>
                ))}
                {entries.length > 3 && (
                  <span className="num text-note leading-none text-hojo">+{entries.length - 3}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* 凡例と取り込み状態 */}
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-note text-hojo">●この表の予定　○Googleの予定</span>
        {token ? (
          <button onClick={reload} className="flex shrink-0 items-center gap-1.5 text-note text-hojo" title="読み直す">
            <RefreshCw className="h-4 w-4" strokeWidth={1.25} />
            更新
          </button>
        ) : (
          <button type="button" onClick={onConnect} className="btn shrink-0">
            接続する
          </button>
        )}
      </div>

      {isLoading && <p className="mt-2 text-note text-hojo">読み込み中…</p>}
      {error && <p className="mt-2 text-note text-accent">{error}</p>}

      {/* 選んだ日、または表示中の月の一覧 */}
      <div className="mt-4">
        <div className="rule-b mb-1 flex items-baseline justify-between pb-1">
          <span className="num text-note text-hojo">
            {selectedDate ? selectedDate.replace(/-/g, '.') : `${monthKey.replace('-', '.')} のすべて`}
          </span>
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="text-note text-hojo">
              月ぜんぶ
            </button>
          )}
        </div>

        {listed.length === 0 ? (
          <p className="py-2 text-note text-hojo">予定はありません。</p>
        ) : (
          <ul className="max-h-[240px] overflow-y-auto">
            {listed.map((e) => (
              <li key={e.key} className="rule-b">
                <button
                  type="button"
                  disabled={!e.taskId}
                  onClick={() => e.taskId && onSelectTaskId?.(e.taskId)}
                  className="tap flex w-full items-center gap-3 py-3 text-left md:py-[9px]"
                  style={{ cursor: e.taskId ? 'pointer' : 'default' }}
                >
                  <span className={`num shrink-0 text-note ${e.google ? 'text-hojo' : ''}`}>
                    {e.dateKey.slice(5).replace('-', '.')}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-note ${e.google ? 'text-hojo' : 'text-sumi'}`}>
                    {e.title}
                  </span>
                  <span className="num shrink-0 text-note text-hojo">{e.time}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
