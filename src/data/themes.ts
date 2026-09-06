/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ThemeConfig } from '../types';

/**
 * 旧デザインのカラーテーマ定義（Tailwind クラス一式）は撤去した。
 * 現在の配色は src/index.css のトークンと、設定で選ぶアクセント1色だけで決まる。
 * ここに残っているのは Firestore の activeThemeId を読み書きするための識別子のみ。
 */
export const THEMES: ThemeConfig[] = [
  { id: 'sweet', name: '既定' },
  { id: 'mint', name: 'ミント' },
  { id: 'latte', name: 'ラテ' },
  { id: 'cosmic', name: 'コズミック' },
  { id: 'sakura', name: 'サクラ' },
];
