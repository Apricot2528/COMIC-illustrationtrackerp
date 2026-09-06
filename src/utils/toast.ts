/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 画面右下に出て自動で消える非ブロッキング通知。
 * alert() と違って処理を止めないので、保存・同期の途中でも UI が固まらない。
 */

export type ToastType = 'info' | 'success' | 'error';

const CONTAINER_ID = 'app-toast-container';
const MAX_VISIBLE = 4;

// 色は薄墨紙の固定値のみ。注意（error）だけ画面のアクセント1色を使う。
// UI 本体では絵文字を使わない。
const SUMI = '#262A26';
const KEI = '#D7DAD3';
const PAPER = '#F4F5F3';

function accentColor(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim();
  return v || '#2F6B4F';
}

function ensureContainer(): HTMLElement {
  let container = document.getElementById(CONTAINER_ID);
  if (container) return container;

  container = document.createElement('div');
  container.id = CONTAINER_ID;
  Object.assign(container.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '10px',
    pointerEvents: 'none',
    maxWidth: 'min(380px, calc(100vw - 32px))',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(container);
  return container;
}

/** メッセージの長さに応じて表示時間を伸ばす（最短3秒・最長8秒） */
function durationFor(message: string): number {
  return Math.min(8000, Math.max(3000, 1200 + message.length * 55));
}

function dismiss(el: HTMLElement): void {
  // アニメーションは使わないので、そのまま取り除く
  if (el.dataset.leaving === '1') return;
  el.dataset.leaving = '1';
  el.remove();
}

export function toast(message: string, type: ToastType = 'info'): void {
  // SSR やテスト環境など DOM が無い場合は黙って諦める
  if (typeof document === 'undefined' || !document.body) return;

  const container = ensureContainer();
  const edge = type === 'error' ? accentColor() : SUMI;

  const el = document.createElement('div');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  Object.assign(el.style, {
    pointerEvents: 'auto',
    cursor: 'pointer',
    display: 'block',
    padding: '10px 14px',
    borderRadius: '2px',
    border: `0.5px solid ${KEI}`,
    borderLeft: `0.5px solid ${edge}`,
    background: PAPER,
    color: SUMI,
    font: '400 12px/1.7 "IBM Plex Sans JP", system-ui, sans-serif',
    // alert() の \n をそのまま改行として見せる
    whiteSpace: 'pre-line',
    wordBreak: 'break-word',
  } as Partial<CSSStyleDeclaration>);

  // textContent なので HTML は解釈されない（XSS 対策）
  el.textContent = message;
  container.appendChild(el);

  // 溜まりすぎたら古いものから消す
  while (container.childElementCount > MAX_VISIBLE) {
    dismiss(container.firstElementChild as HTMLElement);
  }

  const timer = window.setTimeout(() => dismiss(el), durationFor(message));

  // クリックで即座に閉じる
  el.addEventListener('click', () => {
    window.clearTimeout(timer);
    dismiss(el);
  });
}

export default toast;
