-- Time tracking. Timer actions run in the database (server clock), so a
-- running timer does not depend on the desktop window staying open.

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid,
  description text check (char_length(description) <= 2000),
  source text not null default 'manual' check (source in ('timer', 'manual')),
  started_at timestamptz not null,
  ended_at timestamptz,
  paused_at timestamptz,
  paused_seconds integer not null default 0 check (paused_seconds >= 0),
  duration_seconds integer check (duration_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (task_id, owner_id)
    references public.tasks (id, owner_id) on delete set null (task_id),
  constraint time_entries_range_check check (ended_at is null or ended_at >= started_at),
  constraint time_entries_pause_check check (paused_at is null or ended_at is null),
  constraint time_entries_duration_check check ((ended_at is null) = (duration_seconds is null)),
  -- A single entry may not exceed 24 hours.
  constraint time_entries_max_check check (duration_seconds is null or duration_seconds <= 86400)
);

-- At most one running timer per user.
create unique index time_entries_one_running_idx on public.time_entries (owner_id) where ended_at is null;
create index time_entries_owner_started_idx on public.time_entries (owner_id, started_at desc);
create index time_entries_task_idx on public.time_entries (task_id);

create function public.compute_time_entry_duration()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ended_at is null then
    new.duration_seconds := null;
  else
    new.duration_seconds := greatest(
      floor(extract(epoch from new.ended_at - new.started_at))::int - new.paused_seconds,
      0
    );
  end if;
  return new;
end;
$$;

create trigger time_entries_compute_duration
  before insert or update on public.time_entries
  for each row execute function public.compute_time_entry_duration();

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

alter table public.time_entries enable row level security;

create policy "time_entries: owner can read" on public.time_entries
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "time_entries: owner can insert" on public.time_entries
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "time_entries: owner can update" on public.time_entries
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "time_entries: owner can delete" on public.time_entries
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.time_entries from anon;
revoke truncate, references, trigger on public.time_entries from authenticated;

-- ---------------------------------------------------------------------------
-- Timer actions (security invoker: RLS applies, timestamps come from now()).
-- ---------------------------------------------------------------------------
create function public.start_timer(p_task_id uuid default null, p_description text default null)
returns public.time_entries
language plpgsql
set search_path = ''
as $$
declare
  entry public.time_entries;
begin
  if exists (select 1 from public.time_entries where owner_id = auth.uid() and ended_at is null) then
    raise exception 'a timer is already running' using errcode = 'P0001', hint = 'timer_running';
  end if;

  insert into public.time_entries (task_id, description, source, started_at)
  values (p_task_id, nullif(btrim(p_description), ''), 'timer', now())
  returning * into entry;
  return entry;
end;
$$;

create function public.pause_timer()
returns public.time_entries
language sql
set search_path = ''
as $$
  update public.time_entries
     set paused_at = now()
   where owner_id = auth.uid() and ended_at is null and paused_at is null
  returning *;
$$;

create function public.resume_timer()
returns public.time_entries
language sql
set search_path = ''
as $$
  update public.time_entries
     set paused_seconds = paused_seconds + floor(extract(epoch from now() - paused_at))::int,
         paused_at = null
   where owner_id = auth.uid() and ended_at is null and paused_at is not null
  returning *;
$$;

create function public.stop_timer()
returns public.time_entries
language sql
set search_path = ''
as $$
  update public.time_entries
     set paused_seconds = paused_seconds
           + coalesce(floor(extract(epoch from now() - paused_at))::int, 0),
         paused_at = null,
         ended_at = now()
   where owner_id = auth.uid() and ended_at is null
  returning *;
$$;

revoke execute on function public.start_timer(uuid, text) from public, anon;
revoke execute on function public.pause_timer() from public, anon;
revoke execute on function public.resume_timer() from public, anon;
revoke execute on function public.stop_timer() from public, anon;
revoke execute on function public.compute_time_entry_duration() from public, anon;
grant execute on function public.start_timer(uuid, text) to authenticated;
grant execute on function public.pause_timer() to authenticated;
grant execute on function public.resume_timer() to authenticated;
grant execute on function public.stop_timer() to authenticated;
