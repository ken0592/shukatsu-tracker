# 公開AI機能の運営者向け設定

この機能は、公開サイトのVercel FunctionからCloudflare Workers AIを呼び出します。利用者のPCにOllamaを入れる必要はなく、PC・スマホのどちらからでも利用できます。

## 1. Cloudflareの無料AIを準備

1. Cloudflareアカウントを作り、ダッシュボードの「Workers AI」を開きます。
2. 「Use REST API」からWorkers AI用のAPIトークンを作ります。
3. 表示されたAccount IDとAPIトークンを控えます。
4. 課金を発生させたくない場合は、Workers Freeプランのまま利用します。無料枠を使い切ると、その日はAI機能だけが停止します。

APIトークンはGitHub、`config.js`、ブラウザ側のJavaScriptには絶対に書きません。

## 2. Supabaseに利用回数制限を追加

SupabaseのSQL Editorで、このリポジトリの `supabase-schema.sql` を実行します。既存の企業カードを消さず、AI利用回数を数える `ai_daily_usage` と `consume_ai_quota()`、同じ企業・選考区分の同時登録を防ぐ一意制約が追加されます。

すでに重複カードがある場合はデータを勝手に消さず、一意制約の作成だけを保留する通知がSQL Editorに出ます。重複を整理してから同じSQLを再実行してください。

保存するのは利用者ID、日付、回数だけです。メモ本文やAIの回答はこの表に保存しません。

## 3. Vercelに秘密情報を登録

Vercelのプロジェクト設定にあるEnvironment Variablesへ、次の2件を登録します。

- `CLOUDFLARE_ACCOUNT_ID`: CloudflareのAccount ID
- `CLOUDFLARE_AI_TOKEN`: Workers AI用のAPIトークン

Production、Preview、Developmentのうち、利用する環境を選びます。登録後は再デプロイが必要です。

## ESチェック・AI添削

企業詳細の「具体的なES」で回答を編集し、「ESチェック・AI添削」を押します。字数や未記入のチェックは端末内で実行され、ログインやAIの利用回数は不要です。「400字」など回答の見出しや設問に明記された字数から目安を表示します。

AI添削は既存のCloudflare設定と同じAPIを使います。追加の秘密情報・データベース変更は不要です。質問は1000文字、回答は2000文字までで、伏せ字のプレビューを確認して実行します。送信対象は選択中の質問・回答と目安の文字数だけです。メモ整理・FAQと共通の1日30回制限に含まれます。

添削案は元の文章を残して別回答に追加できます。内容・字数・伏せ字を確認してから「詳細を保存」で保存します。AIの提案が事実や意味を保っているか、本人が確認してください。閉じた添削画面には送信文章・結果を残しません。

利用仕様: [Cloudflare Workers AI JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)

## 安全対策

- ブラウザで氏名、メール、電話、住所、ユーザー名、ID、パスワード、合言葉、URL（ポート・IP形式を含む）、識別コードを伏せてから送ります。
- Vercel Functionでも同じ伏せ字処理をもう一度行います。
- Cloudflareへ送るのは伏せ字処理後の文章だけです。
- CSVはブラウザ内だけで解析し、本文・マイページID・URLをAI APIへ送りません。パスワード関連列は取り込みません。
- ログイン状態をサーバーで確認し、AI FAQ・メモ整理・ES添削を合わせて1人1日30回に制限します。
- 既にSupabaseを設定済みの場合も、更新後の `supabase-schema.sql` をSQL Editorで再実行すると、既存データを消さずに上限を更新できます。
- 元のメモをlocalStorage、Supabase、Vercel Functionへ保存しません。
- AIの結果は項目と文字数を検査し、利用者が確認するまで企業カードとして保存しません。
