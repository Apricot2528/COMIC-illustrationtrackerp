/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Google Identity Services（GIS）を使ったアクセストークンの取り直し。
 *
 * Firebase Auth のポップアップ方式ではブラウザにリフレッシュトークンが渡らず、
 * アクセストークンは約1時間で切れる。GIS のトークンクライアントなら、
 * Google のセッションが生きていて同意済みであれば、ポップアップを出さずに
 * 裏で取り直せる（prompt: '' の指定）。
 *
 * 失敗しうる条件（いずれもこちらでは制御できない）:
 *  - Google Cloud Console でこのオリジンが「承認済みのJavaScript生成元」に
 *    登録されていない
 *  - ブラウザが3rd party Cookie を強く制限している（Safari など）
 *  - Google のセッションが切れている／同意がまだ
 * これらの場合は null を返すので、呼び出し側でポップアップに切り替える。
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let loadPromise: Promise<void> | null = null;

/** GIS のスクリプトを一度だけ読み込む */
export function loadGis(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('ブラウザ環境ではありません'));
  }
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const fail = () => {
      loadPromise = null;
      reject(new Error('Google Identity Services を読み込めませんでした'));
    };

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', fail);
      return;
    }

    const el = document.createElement('script');
    el.src = GIS_SRC;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = fail;
    document.head.appendChild(el);
  });

  return loadPromise;
}

export interface TokenResult {
  accessToken: string;
  /** 失効時刻（ミリ秒） */
  expiresAt: number;
}

/**
 * アクセストークンを要求する。
 * silent = true ならポップアップを出さずに取り直しを試みる。
 * 取れなければ null を返す（例外は投げない）。
 */
export async function requestAccessToken(opts: {
  clientId: string;
  scope: string;
  silent: boolean;
  /** 対象アカウントのヒント。無言更新の成功率が上がる */
  hint?: string;
  /** 応答が返らない場合の打ち切り時間 */
  timeoutMs?: number;
}): Promise<TokenResult | null> {
  if (!opts.clientId) return null;

  try {
    await loadGis();
  } catch {
    return null;
  }

  const oauth2 = (window as any).google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) return null;

  return new Promise<TokenResult | null>((resolve) => {
    let settled = false;
    let timer = 0;
    const done = (r: TokenResult | null) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      resolve(r);
    };

    let client: any;
    try {
      client = oauth2.initTokenClient({
        client_id: opts.clientId,
        scope: opts.scope,
        hint: opts.hint,
        callback: (resp: any) => {
          if (resp && resp.access_token) {
            const sec = Number(resp.expires_in) || 3600;
            done({ accessToken: resp.access_token, expiresAt: Date.now() + sec * 1000 });
          } else {
            done(null);
          }
        },
        error_callback: () => done(null),
      });
    } catch {
      done(null);
      return;
    }

    // 応答が来ない場合に備えて打ち切る（無言更新は短めに）
    timer = window.setTimeout(() => done(null), opts.timeoutMs ?? (opts.silent ? 8000 : 120000));

    try {
      client.requestAccessToken(opts.silent ? { prompt: '' } : {});
    } catch {
      done(null);
    }
  });
}
