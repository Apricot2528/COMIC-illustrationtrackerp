# 作業進捗tracker（漫画・イラスト進捗管理）

Vite + React + Firebase（Auth / Firestore）で動く、締切・工程・打合せの管理アプリ。
サーバーは不要。Firebase Hosting の無料プラン（Spark）で公開できます。

## ローカルで動かす

```bash
npm install
npm run dev
```

## 公開する（初回のみ）

```bash
npm install -g firebase-tools
firebase login
npm run build
firebase deploy --only hosting
```

2回目以降は `npm run deploy` だけでOK。

## Googleカレンダー連携について

Googleログイン（Firebase Auth）にカレンダーのスコープを乗せているので、
アプリ内で「Googleでログイン」するだけでカレンダー接続まで完了します。
クライアントIDの手入力やリダイレクトURIの設定は不要です。

Google Cloud 側で必要な設定は `DEPLOY.md` を参照。
