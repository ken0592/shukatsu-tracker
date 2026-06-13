# 就活管理

iPhoneとPCの両方で使う前提の、就活管理Webアプリです。

## できること

- 近日の締切を見る
- 近日の面接・説明会を見る
- 選考中の企業を一覧する
- インターン、早期選考、本選考などで絞り込む
- 企業名、業種、締切、志望度で検索・絞り込みする
- 企業マイページURLから企業アイコンを表示する
- カレンダーで締切と予定を見る
- 企業・選考を追加する
- 登録した企業・選考を編集する
- 企業ごとのマイページID、マイページURL、ES内容、面接対策メモを保存する
- Supabase設定後は、ログインしたユーザーごとにPC/iPhone同期する

## 保存方式

`config.js` にSupabaseの接続情報が入っていない間は、端末のブラウザ内に保存します。

Supabaseを設定すると、メールアドレスとパスワードでログインできるようになり、ユーザー本人のデータだけをクラウドに保存します。

## Supabase同期

設定手順は [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) を見てください。

## Vercelで公開するとき

VercelでGitHubリポジトリ `ken0592/shukatsu-tracker` をImportします。
Framework PresetはOther、Root Directoryはそのままで公開できます。
