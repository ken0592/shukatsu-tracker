-- Supabase SQL Editorで一度実行します。既存データは変更しません。
-- 締切時刻は日本時間のHH:MM。空欄は「時刻未設定」です。
alter table public.entries
  add column if not exists deadline_time text not null default ''
  check (deadline_time = '' or deadline_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
notify pgrst, 'reload schema';
