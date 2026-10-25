-- SMART personal goals and professional development records.

create type public.kpi_metric as enum (
  'deliveries', 'on_time_rate', 'late_rate', 'lead_time', 'cycle_time',
  'predictability', 'rework_rate', 'time_invested', 'learning'
);

create table public.personal_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Specific
  title text not null check (char_length(btrim(title)) between 1 and 150),
  -- Measurable
  metric public.kpi_metric not null,
  comparison text not null default 'at_least' check (comparison in ('at_least', 'at_most')),
  target_value numeric(10, 2) not null check (target_value >= 0),
  -- Achievable / Relevant
  achievability text check (char_length(achievability) <= 1000),
  relevance text check (char_length(relevance) <= 1000),
  -- Time-bound
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_goals_dates_check check (end_date >= start_date),
  constraint personal_goals_percent_check check (
    metric not in ('on_time_rate', 'late_rate', 'rework_rate') or target_value <= 100
  )
);
create index personal_goals_owner_idx on public.personal_goals (owner_id, end_date desc);

create table public.skill_achievements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  kind text not null check (kind in ('course', 'certification', 'skill', 'other')),
  provider text check (char_length(provider) <= 120),
  achieved_on date not null,
  hours numeric(6, 1) check (hours >= 0),
  url text check (url is null or (url ~ '^https://[^\s]+$' and char_length(url) <= 2048)),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index skill_achievements_owner_idx on public.skill_achievements (owner_id, achieved_on desc);

create trigger personal_goals_set_updated_at
  before update on public.personal_goals
  for each row execute function public.set_updated_at();
create trigger skill_achievements_set_updated_at
  before update on public.skill_achievements
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['personal_goals', 'skill_achievements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: owner can read" on public.%1$I for select to authenticated
         using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated
         with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can update" on public.%1$I for update to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can delete" on public.%1$I for delete to authenticated
         using (owner_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
  end loop;
end;
$$;
