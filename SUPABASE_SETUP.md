# Supabase同期の設定

配布ユーザーごとにログインして、自分のデータだけをPC/iPhoneで同期するための設定です。

## 1. Supabaseプロジェクトを作る

1. https://supabase.com/ を開く
2. GitHubなどでログイン
3. New projectを作る
4. Project Settings → APIを開く
5. Project URLとPublishable keyまたはanon public keyを控える

`service_role` keyは絶対に使わないでください。
ブラウザに入れてよいのは `Publishable key` または `anon public` keyだけです。

## 2. データベースを作る

SupabaseのSQL Editorで `supabase-schema.sql` の中身を実行します。

このSQLには、ユーザー本人のデータだけ見えるようにするRLSルールも入っています。

すでに一度テーブルを作っている場合も、同じSQLをもう一度実行して大丈夫です。
業種、企業公式サイトURL、企業アイコン画像URL、マイページID、企業マイページURL、ES質問・回答、面接対策メモ、ES・ガクチカの型保存が追加されます。
企業一覧とES・ガクチカの型の並び替え順も保存するため、最新版では `sort_order` 列も追加されます。
ゴミ箱と復元を使うため、最新版では `deleted_at` 列も追加されます。削除した企業はこの日時だけを付けて非表示にするため、復元できます。
PCとiPhoneの同時編集を安全にまとめるため、最新版では `updated_at` 列と自動更新処理も使います。古い画面からの上書きを検知し、同じ項目が変わっている場合だけ確認画面を表示します。

締切時刻を保存するため、最新版では `deadline_time` 列を追加します。既存環境では `supabase-deadline-time.sql` だけをSQL Editorで実行することもできます。既存の企業・ES・メモは変更しません。実行後にアプリの「同期更新」を押してください。未更新の環境でも時刻が空欄の記録は保存でき、時刻付きの保存・復元は内容を捨てずに中止します。

ESの型も更新日時を照合し、別の項目の変更はまとめ、同じ項目の変更だけ残す内容を確認します。競合・通信失敗・別端末での削除時は、編集中の型を残します。

## 3. ログイン設定を確認する

SupabaseのAuthentication → URL Configurationで、Vercelの公開URLを入れます。

- Site URL: Vercelの公開URL
- Redirect URLs: Vercelの公開URL

友達にも使わせる場合は、Authentication → Providers → Emailが有効になっていることを確認します。
メール確認をONにしている場合、ユーザーは届いたメールの確認リンクを押してからログインします。

## 4. アプリに接続情報を入れる

`config.js` を開いて、次の2つを入れます。

```js
window.SHUKATSU_CONFIG = {
  supabaseUrl: "https://xxxxx.supabase.co",
  supabaseAnonKey: "xxxxx"
};
```

Publishable keyまたはanon public keyはブラウザに入れて使う公開用キーです。
安全性は `supabase-schema.sql` のRLSルールで守ります。

## 5. GitHubへ送る

`outputs/push-simple.bat` を実行してGitHubへ送ります。
VercelはGitHubの更新を見て自動で再公開します。

## 6. 使い方

公開URLを開くとログイン画面が出ます。
ユーザーはメールアドレスとパスワードで登録・ログインします。

同じアカウントでiPhoneとPCにログインすると、同じデータを見られます。

すでに端末保存で入力したデータがある場合は、ログイン後に「端末データを移す」を押すとクラウドへ移せます。
