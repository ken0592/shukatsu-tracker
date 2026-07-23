# 公開AI機能の運営者向け設定

この機能は、公開サイトのVercel FunctionからCloudflare Workers AIを呼び出します。利用者のPCにOllamaを入れる必要はなく、PC・スマホのどちらからでも利用できます。

## 1. Cloudflareの無料AIを準備

1. Cloudflareアカウントを作り、ダッシュボードの「Workers AI」を開きます。
2. 「Use REST API」からWorkers AI用のAPIトークンを作ります。
3. 表示されたAccount IDとAPIトークンを控えます。
4. 課金を発生させたくない場合は、Workers Freeプランのまま利用します。無料枠を使い切ると、その日はAI機能だけが停止します。

APIトークンはGitHub、`config.js`、ブラウザ側のJavaScriptには絶対に書きません。

## 2. Supabaseに利用回数制限を追加

SupabaseのSQL Editorで、このリポジトリの `supabase-schema.sql` を実行します。既存の企業カードを消さず、AI利用回数を数える `ai_daily_usage` と `consume_ai_quota()` が追加されます。

保存するのは利用者ID、日付、回数だけです。メモ本文やAIの回答はこの表に保存しません。

## 3. Vercelに秘密情報を登録

Vercelのプロジェクト設定にあるEnvironment Variablesへ、次の2件を登録します。

- `CLOUDFLARE_ACCOUNT_ID`: CloudflareのAccount ID
- `CLOUDFLARE_AI_TOKEN`: Workers AI用のAPIトークン

Production、Preview、Developmentのうち、利用する環境を選びます。登録後は再デプロイが必要です。

## 安全対策

- ブラウザで氏名、メール、電話、住所、ID、パスワード、URL、識別コードを伏せてから送ります。
- Vercel Functionでも同じ伏せ字処理をもう一度行います。
- Cloudflareへ送るのは伏せ字処理後の文章だけです。
- ログイン状態をサーバーで確認し、AI FAQとメモ整理を合わせて1人1日30回に制限します。
- 既にSupabaseを設定済みの場合も、更新後の `supabase-schema.sql` をSQL Editorで再実行すると、既存データを消さずに上限を更新できます。
- 元のメモをlocalStorage、Supabase、Vercel Functionへ保存しません。
- AIの結果は項目と文字数を検査し、利用者が確認するまで企業カードとして保存しません。
