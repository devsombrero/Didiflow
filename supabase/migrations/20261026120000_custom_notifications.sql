-- Custom notifications: user-defined alerts (one-off, daily, weekdays,
-- weekly or every N minutes). Delivered by the desktop app while it is open;
-- last_fired_at records the latest delivered occurrence.

create table public.custom_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  message text check (char_length(message) <= 500),
  schedule text not null check (schedule in ('once', 'daily', 'weekdays', 'weekly', 'interval')),
  -- once
  run_at timestamptz,
  -- daily, weekdays, weekly (user's local time)
  time_of_day time,
  -- weekly: 0 = Sunday ... 6 = Saturday
  weekdays smallint[],
  -- interval
  interval_minutes integer check (interval_minutes between 15 and 1440),
  -- interval: optional active hours (local time)
  window_start time,
  window_end time,
  sound text not null default 'notify'
    check (sound in ('notify', 'chime', 'success', 'complete', 'tick', 'none')),
  active boolean not null default true,
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_notifications_schedule_fields check (
    (schedule = 'once' and run_at is not null)
    or (schedule in ('daily', 'weekdays') and time_of_day is not null)
    or (schedule = 'weekly' and time_of_day is not null
        and cardinality(weekdays) between 1 and 7
        and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
    or (schedule = 'interval' and interval_minutes is not null)
  ),
  constraint custom_notifications_window check (
    (window_start is null) = (window_end is null)
    and (window_start is null or window_start < window_end)
  )
);

create index custom_notifications_owner_idx on public.custom_notifications (owner_id)
  where active;

create trigger custom_notifications_set_updated_at
  before update on public.custom_notifications
  for each row execute function public.set_updated_at();

-- At most 100 rules per user keeps the scheduler pass cheap.
create function public.limit_custom_notifications()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.custom_notifications where owner_id = new.owner_id) >= 100 then
    raise exception 'Limite de 100 notificações personalizadas atingido.'
      using errcode = '23514', hint = 'custom_notification_limit';
  end if;
  return new;
end;
$$;

create trigger custom_notifications_limit
  before insert on public.custom_notifications
  for each row execute function public.limit_custom_notifications();

alter table public.custom_notifications enable row level security;

create policy "custom_notifications: owner can read" on public.custom_notifications
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "custom_notifications: owner can insert" on public.custom_notifications
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "custom_notifications: owner can update" on public.custom_notifications
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "custom_notifications: owner can delete" on public.custom_notifications
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.custom_notifications from anon;
revoke truncate, references, trigger on public.custom_notifications from authenticated;
revoke execute on function public.limit_custom_notifications() from public, anon;
