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
企業カードのピン留めを同じアカウントの端末間で同期するため、最新版では `company_pins` テーブルも作ります。既存のピンは、その端末でログインしたときにクラウドへ移します。すでにクラウドに保存された固定・解除の状態がある企業は、その状態を優先します。クラウドの解除状態は記録として残るため、別端末に残っている古いピンも復活しません。ログインしたアカウントで開いたアプリ同士に同期されます。端末保存モードのピンは、これまでどおりそのブラウザ内だけに保存されます。

## 3. ログイン設定を確認する

SupabaseのAuthentication → URL Configurationで、Vercelの公開URLを入れます。

- Site URL: Vercelの公開URL
- Redirect URLs: Vercelの公開URL

友達にも使わせる場合は、Authentication → Providers → Emailが有効になっていることを確認します。
メール確認をONにしている場合、ユーザーは届いたメールの確認リンクを押してからログインします。

Authenticationのパスワード設定で、新規登録の最低文字数を8文字にします。アプリ側でも新規登録は8文字以上を確認し、ログインは従来どおり6文字以上で受け付けます。この設定変更で既存ユーザーのパスワード自体は変更されず、Supabase Authは短い既存パスワードでもログインを続けられます。

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

同じアカウントでiPhoneとPCにログインすると、同じデータと企業のピン留めを見られます。アプリを開いている間は定期的に同期し、再度開いたときもクラウドの最新状態を読み込みます。

すでに端末保存で入力したデータがある場合は、ログイン後に「端末データを移す」を押すとクラウドへ移せます。
