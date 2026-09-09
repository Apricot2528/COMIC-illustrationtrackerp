/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from '../types';

/** カレンダー連携で要求するスコープ（Firebase Auth の Google ログインに乗せる） */
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events'
];

/** Google Calendar API が返した失敗。状況に応じた案内を出すために状態コードを持つ */
export class CalendarApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`Google Calendar Error (${status}): ${detail}`);
    this.name = 'CalendarApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** 失効・削除済みなど、状況から利用者向けの一文をつくる */
export function describeCalendarError(err: unknown): string {
  if (err instanceof CalendarApiError) {
    if (err.status === 401) return 'Googleカレンダーの接続期限が切れています。設定から接続し直してください';
    if (err.status === 403) return 'Googleカレンダーへの権限が足りません。設定から接続し直して、カレンダーの利用を許可してください';
    if (err.status === 404) return '対象のカレンダーまたは予定が見つかりません。設定のカレンダーIDをご確認ください';
    return `Googleカレンダーが登録を拒否しました（${err.status}）: ${err.detail}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Base helper for Google Calendar REST calls
 */
async function callCalendarApi(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  accessToken: string,
  body?: any
): Promise<any> {
  const headers: HeadersInit = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`https://www.googleapis.com/calendar/v3${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Google Calendar API Error [${response.status}]:`, errorText);
    let detail = errorText;
    try {
      detail = JSON.parse(errorText)?.error?.message || errorText;
    } catch {
      /* JSON でなければ本文をそのまま使う */
    }
    throw new CalendarApiError(response.status, detail);
  }

  if (method === 'DELETE') {
    return { success: true };
  }

  return response.json();
}

export interface CalendarEvent {
  id?: string;
  summary: string;
  description: string;
  start: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  colorId?: string; // 1 to 11 for Google Accent Colors
}

/**
 * Synchronise (create or update) Google Calendar event for a Task's deadline
 */
export async function syncDeadlineToGoogleCalendar(
  task: Task,
  accessToken: string,
  calendarId: string = 'primary'
): Promise<string | undefined> {
  const summary = `【締切】${task.type === 'manga' ? '漫画' : 'イラスト'}　${task.title}`;
  
  // イベント本文
  const description = `クライアント: ${task.clientName || 'なし'}` + `\n` +
    `入金: ${task.depositStatus === 'paid' ? '済' : task.depositStatus === 'unpaid' ? '未' : 'なし'}` + `\n` +
    `体裁: ${task.type === 'manga' ? `${task.totalPages}P` : '1点'}` + `\n` +
    `備考:` + `\n` + `${task.notes || 'なし'}` + `\n\n` +
    `作業進捗tracker`;

  // Full day event for Deadline
  const event: CalendarEvent = {
    summary,
    description,
    start: {
      date: task.deadline,
    },
    end: {
      // Calendar API end dates are exclusive, so add 1 day or make it match but end of day.
      // To make it simple, we use the same day for full-day event, but end of day is same date.
      // Actually standard full-day event uses start date = YYYY-MM-DD, end date = next day's YYYY-MM-DD
      date: getNextDayDateString(task.deadline),
    },
    colorId: '11' // Tomato red for deadlines
  };

  try {
    if (task.calendarEventId) {
      // Update existing
      const res = await callCalendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events/${task.calendarEventId}`,
        'PUT',
        accessToken,
        event
      );
      return res.id;
    } else {
      // Create new
      const res = await callCalendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        'POST',
        accessToken,
        event
      );
      return res.id;
    }
  } catch (error) {
    console.error('Failed to sync to Google Calendar', error);
    throw error;
  }
}

/**
 * Synchronise (create or update) Google Calendar meeting event
 */
export async function syncMeetingToGoogleCalendar(
  task: Task,
  accessToken: string,
  calendarId: string = 'primary'
): Promise<string | undefined> {
  if (!task.meetingDate) return undefined;

  const summary = `【打合せ】${task.title}${task.clientName ? `　${task.clientName}` : ''}`;
  const description = `対象: ${task.title}` + `\n` +
    `種別: ${task.type === 'manga' ? '漫画' : 'イラスト'}` + `\n\n` +
    `作業進捗tracker`;

  // 打合せは既定で1時間。timeZone を添えて送るので、日時の文字列は
  // 現地時刻のまま組み立てる（toISOString() は UTC に直してしまうため使わない）
  const startDateTime = task.meetingDate + ':00'; // YYYY-MM-DDTHH:mm:00
  const endDateObj = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const endDateTime =
    `${endDateObj.getFullYear()}-${p2(endDateObj.getMonth() + 1)}-${p2(endDateObj.getDate())}` +
    `T${p2(endDateObj.getHours())}:${p2(endDateObj.getMinutes())}:00`;

  const event: CalendarEvent = {
    summary,
    description,
    start: {
      dateTime: startDateTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo'
    },
    end: {
      dateTime: endDateTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo'
    },
    colorId: '5' // Banana yellow or orange for meetings
  };

  try {
    if (task.meetingEventId) {
      const res = await callCalendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events/${task.meetingEventId}`,
        'PUT',
        accessToken,
        event
      );
      return res.id;
    } else {
      const res = await callCalendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        'POST',
        accessToken,
        event
      );
      return res.id;
    }
  } catch (error) {
    console.error('Failed to sync to Google Calendar', error);
    throw error;
  }
}

/**
 * Delete event from Google Calendar
 */
export async function deleteEventFromGoogleCalendar(
  eventId: string,
  accessToken: string,
  calendarId: string = 'primary'
): Promise<boolean> {
  try {
    await callCalendarApi(
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      'DELETE',
      accessToken
    );
    return true;
  } catch (error) {
    console.error(`Failed to delete Google Calendar event: ${eventId}`, error);
    return false;
  }
}

/**
 * Helper to get next day in string format to support full-day event standard boundary
 */
function getNextDayDateString(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dy}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Synchronise (create or update) Google Calendar event for a Todo
 */
export async function syncTodoToGoogleCalendar(
  todo: { title: string; deadline?: string; calendarEventId?: string },
  accessToken: string,
  calendarId: string = 'primary'
): Promise<string | undefined> {
  if (!todo.deadline) return undefined;

  const summary = `【TODO】${todo.title}`;
  const description = `${todo.title}` + `\n\n` +
    `作業進捗tracker`;

  const event: CalendarEvent = {
    summary,
    description,
    start: {
      date: todo.deadline,
    },
    end: {
      date: getNextDayDateString(todo.deadline),
    },
    colorId: '9' // Blueberry color for general todos
  };

  try {
    if (todo.calendarEventId) {
      const res = await callCalendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events/${todo.calendarEventId}`,
        'PUT',
        accessToken,
        event
      );
      return res.id;
    } else {
      const res = await callCalendarApi(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        'POST',
        accessToken,
        event
      );
      return res.id;
    }
  } catch (error) {
    console.error('Failed to sync to Google Calendar', error);
    throw error;
  }
}
