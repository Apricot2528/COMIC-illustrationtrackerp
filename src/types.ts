/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TaskType = 'manga' | 'illust' | 'meeting';

export type DepositStatus = 'paid' | 'unpaid' | 'none';

export interface ProgressSteps {
  [key: string]: boolean[]; // e.g. "ネーム": [false, false, false] (for pages 1, 2, 3)
}

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  clientName: string;
  depositStatus: DepositStatus;
  deadline: string; // YYYY-MM-DD
  plotDeadline?: string; // プロット締め切り日 (YYYY-MM-DD)
  nameDeadline?: string; // ネーム締め切り日 (YYYY-MM-DD)
  lineartDeadline?: string; // 線画締め切り日 (YYYY-MM-DD)
  totalPages: number; // For manga, number of pages; for illust, generally 1
  steps: ProgressSteps;
  notes: string;
  calendarEventId?: string; // ID of the linked Google Calendar event for the deadline
  meetingEventId?: string;  // ID of the linked Google Calendar event for meetings
  meetingDate?: string;    // Meeting Date/Time (YYYY-MM-DDTHH:mm)
  createdAt: string;
  updatedAt?: string;
}

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  deadline?: string; // YYYY-MM-DD
  calendarEventId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PlacedSticker {
  id: string;
  type: string;
  imgUrl?: string;
  emoji?: string;
  x: number; // px or %
  y: number; // px or %
  rotate: number; // degrees
  scale: number;
  containerId: string; // "header" | "sidebar" | "table"
}

export type ThemeType = 'sweet' | 'mint' | 'latte' | 'cosmic' | 'sakura';

/**
 * 配色は薄墨紙の固定値＋アクセント1色に統一したため、テーマは
 * Firestore の userConfigs.activeThemeId を保持するためだけに残している。
 * （firestore.rules の isValidUserConfig が activeThemeId を必須にしている）
 */
export interface ThemeConfig {
  name: string;
  id: ThemeType;
}

export interface CalendarSettings {
  clientId: string;
  apiKey: string;
  calendarId: string;
  accessToken: string | null;
  tokenExpiry: number | null; // epoch ms
}

export interface CustomStyleConfig {
  useCustomColor: boolean;
  primaryColor: string;
  headerBgUrl: string;
  deadlineCatUrl: string;
  showEmojis: boolean;
  showStickers?: boolean;
  darkMode?: boolean;
  themePreset?: 'pastel' | 'sage' | 'autumn' | 'pop' | 'indigo' | 'custom';
  accentColor?: string;
  bgColor?: string;
  sidebarColor?: string;
  subColor?: string;
  textAccentColor?: string;
  dashboardTitle?: string;
  dashboardContent?: string;
}

