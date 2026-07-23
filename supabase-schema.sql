create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null,
  industry text not null default '',
  mypage_id text not null default '',
  official_url text not null default '',
  logo_url text not null default '',
  track_type text not null default '本選考',
  status text not null default '気になる',
  deadline date,
  event_date date,
  event_type text not null default '面接',
  priority text not null default '未定',
  mypage_url text not null default '',
  es_content text not null default '',
  es_items jsonb not null default '[]'::jsonb,
  interview_notes text not null default '',
  memo text not null default '',
  sort_order double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.entries
  add column if not exists industry text not null default '',
  add column if not exists mypage_id text not null default '',
  add column if not exists official_url text not null default '',
  add column if not exists logo_url text not null default '',
  add column if not exists mypage_url text not null default '',
  add column if not exists es_content text not null default '',
  add column if not exists es_items jsonb not null default '[]'::jsonb,
  add column if not exists interview_notes text not null default '',
  add column if not exists memo text not null default '',
  add column if not exists sort_order double precision,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists entries_user_id_created_at_idx
  on public.entries (user_id, created_at desc);

create index if not exists entries_user_id_industry_idx
  on public.entries (user_id, industry);

create index if not exists entries_user_id_sort_order_idx
  on public.entries (user_id, sort_order);

create index if not exists entries_user_id_deleted_at_idx
  on public.entries (user_id, deleted_at);

alter table public.entries enable row level security;

drop policy if exists "Users can read own entries" on public.entries;
drop policy if exists "Users can insert own entries" on public.entries;
drop policy if exists "Users can update own entries" on public.entries;
drop policy if exists "Users can delete own entries" on public.entries;

create policy "Users can read own entries"
  on public.entries
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can insert own entries"
  on public.entries
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can update own entries"
  on public.entries
  for update
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id)
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete own entries"
  on public.entries
  for delete
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

create table if not exists public.es_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'ガクチカ',
  title text not null,
  body text not null default '',
  sort_order double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.es_templates
  add column if not exists sort_order double precision;

create index if not exists es_templates_user_id_updated_at_idx
  on public.es_templates (user_id, updated_at desc);

create index if not exists es_templates_user_id_sort_order_idx
  on public.es_templates (user_id, sort_order);

alter table public.es_templates enable row level security;

drop policy if exists "Users can read own templates" on public.es_templates;
drop policy if exists "Users can insert own templates" on public.es_templates;
drop policy if exists "Users can update own templates" on public.es_templates;
drop policy if exists "Users can delete own templates" on public.es_templates;

create policy "Users can read own templates"
  on public.es_templates
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can insert own templates"
  on public.es_templates
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can update own templates"
  on public.es_templates
  for update
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id)
  with check (auth.uid() is not null and auth.uid() = user_id);

create policy "Users can delete own templates"
  on public.es_templates
  for delete
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_set_updated_at on public.entries;

create trigger entries_set_updated_at
  before update on public.entries
  for each row
  execute function public.set_updated_at();

drop trigger if exists es_templates_set_updated_at on public.es_templates;

create trigger es_templates_set_updated_at
  before update on public.es_templates
  for each row
  execute function public.set_updated_at();

-- 公開AIの無料枠を利用者ごとに守るため、本文を保存せず回数だけを記録します。
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default ((now() at time zone 'Asia/Tokyo')::date),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;

revoke all on table public.ai_daily_usage from anon, authenticated;

create or replace function public.consume_ai_quota()
returns table (is_allowed boolean, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  today_jst date := (now() at time zone 'Asia/Tokyo')::date;
  current_count integer;
  daily_limit constant integer := 30;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  insert into public.ai_daily_usage (user_id, usage_date, request_count)
  values (current_user_id, today_jst, 1)
  on conflict (user_id, usage_date) do update
    set request_count = public.ai_daily_usage.request_count + 1
    where public.ai_daily_usage.request_count < daily_limit
  returning request_count into current_count;

  if current_count is null then
    return query select false, 0;
  end if;

  return query select true, greatest(0, daily_limit - current_count);
end;
$$;

revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
