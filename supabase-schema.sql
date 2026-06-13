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
  add column if not exists memo text not null default '';

create index if not exists entries_user_id_created_at_idx
  on public.entries (user_id, created_at desc);

create index if not exists entries_user_id_industry_idx
  on public.entries (user_id, industry);

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists es_templates_user_id_updated_at_idx
  on public.es_templates (user_id, updated_at desc);

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
