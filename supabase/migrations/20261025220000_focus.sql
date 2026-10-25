-- Daily priority list and focus sessions.

create table public.daily_priorities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  priority_date date not null,
  task_id uuid not null,
  position smallint not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, priority_date, task_id),
  foreign key (task_id, owner_id) references public.tasks (id, owner_id) on delete cascade
);
create index daily_priorities_owner_date_idx on public.daily_priorities (owner_id, priority_date, position);
create index daily_priorities_task_idx on public.daily_priorities (task_id);

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  planned_minutes smallint not null check (planned_minutes between 1 and 240),
  completed boolean not null default false,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  foreign key (task_id, owner_id) references public.tasks (id, owner_id) on delete set null (task_id),
  constraint focus_sessions_range_check check (ended_at is null or ended_at >= started_at),
  constraint focus_sessions_completed_check check (not completed or ended_at is not null)
);
-- At most one active focus session per user.
create unique index focus_sessions_one_active_idx on public.focus_sessions (owner_id) where ended_at is null;
create index focus_sessions_owner_started_idx on public.focus_sessions (owner_id, started_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['daily_priorities', 'focus_sessions'] loop
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
