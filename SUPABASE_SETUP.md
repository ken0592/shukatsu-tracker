# Supabase同期の設定

配布ユーザーごとにログインして、自分のデータだけをPC/iPhoneで同期するための設定です。

## 1. Supabaseプロジェクトを作る

1. https://supabase.com/ を開く
2. GitHubなどでログイン
3. New projectを作る
4. Project URLとanon public keyを控える

## 2. データベースを作る

SupabaseのSQL Editorで `supabase-schema.sql` の中身を実行します。

このSQLには、ユーザー本人のデータだけ見えるようにするRLSルールも入っています。

すでに一度テーブルを作っている場合も、同じSQLをもう一度実行して大丈夫です。
業種、企業公式サイトURL、企業アイコン画像URL、マイページID、企業マイページURL、ES内容、面接対策メモの列が追加されます。

## 3. アプリに接続情報を入れる

`config.js` を開いて、次の2つを入れます。

```js
window.SHUKATSU_CONFIG = {
  supabaseUrl: "https://xxxxx.supabase.co",
  supabaseAnonKey: "xxxxx"
};
```

anon public keyはブラウザに入れて使う公開用キーです。
安全性は `supabase-schema.sql` のRLSルールで守ります。

## 4. GitHubへ送る

`outputs/push-simple.bat` を実行してGitHubへ送ります。
VercelはGitHubの更新を見て自動で再公開します。

## 5. 使い方

公開URLを開くとログイン画面が出ます。
ユーザーはメールアドレスとパスワードで登録・ログインします。

同じアカウントでiPhoneとPCにログインすると、同じデータを見られます。
