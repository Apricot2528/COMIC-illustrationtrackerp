# デプロイ手順（全部無料）

## 0. 前提
- Node.js が入っていること
- Firebase プロジェクト `gen-lang-client-0471273701`（AI Studio が作ったもの）を使う

## 1. コマンド（PowerShell / ターミナルで順に実行）

```bash
git pull                       # このパッチを取り込んだあと
npm install
npm install -g firebase-tools
firebase login                 # ブラウザが開くので Google アカウントでログイン
firebase use gen-lang-client-0471273701
npm run deploy
```

最後に `Hosting URL: https://gen-lang-client-0471273701.web.app` のようなURLが出ます。これがアプリのURLです。

## 2. Firebase コンソール（ブラウザで1回だけ）

https://console.firebase.google.com/ → プロジェクトを開く

1. **Authentication → Sign-in method** で「Google」が有効になっているか確認（AI Studio 時代に使っていたなら有効のはず）
2. **Authentication → Settings → 承認済みドメイン** に、1で出た `xxx.web.app` が入っているか確認。無ければ追加

## 3. Google Cloud コンソール（ブラウザで1回だけ）

https://console.cloud.google.com/ → 右上のプロジェクトを `gen-lang-client-0471273701` にする

1. **APIとサービス → ライブラリ** で「Google Calendar API」を検索して **有効にする**
2. **APIとサービス → OAuth 同意画面**
   - まだ無ければ作成：ユーザータイプ「外部」、アプリ名は好きな名前、メールは自分のもの
   - 「スコープ」は空のままでOK（アプリ側から要求するため）
   - **テストユーザー** に、アプリで使う Google アカウント（複数なら全部）を追加
   - 公開ステータスは「テスト」のままでOK（自分専用なら審査不要・無料）

## 4. 動作確認

アプリのURLを開いて「Googleでログイン」→ Google の許可画面で
「カレンダーの予定の表示と編集」にチェックが付いていることを確認して許可。
タスクを保存すると Google カレンダーに締切イベントが入ります。

## 補足
- トークンは1時間で切れますが、切れた状態で同期するとポップアップが一瞬出て自動で取り直します
- 以前のように Cloud Run（課金アカウント）は不要です
- スマホのホーム画面に追加すればアプリのように使えます
