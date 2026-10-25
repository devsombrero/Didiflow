-- Keeps status, progress and completed_at consistent and records every
-- status/progress transition in task_status_history.
--
-- Rules (docs/database.md):
--   not_started → 0%            in_progress → 1..99%      done → 100% + completed_at
--   blocked / cancelled → progress preserved
-- An explicit status change wins and normalizes the progress. A progress-only
-- change on a not-started/in-progress/done task derives the status from it.

create function public.normalize_task_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status_changed boolean := tg_op = 'INSERT' or new.status is distinct from old.status;
  progress_changed boolean := tg_op = 'UPDATE' and new.progress_percentage is distinct from old.progress_percentage;
begin
  if not status_changed and progress_changed
     and new.status in ('not_started', 'in_progress', 'done') then
    new.status := case
      when new.progress_percentage = 0 then 'not_started'
      when new.progress_percentage = 100 then 'done'
      else 'in_progress'
    end::public.task_status;
  end if;

  case new.status
    when 'not_started' then
      new.progress_percentage := 0;
    when 'in_progress' then
      new.progress_percentage := least(greatest(new.progress_percentage, 1), 99);
    when 'done' then
      new.progress_percentage := 100;
    else
      null; -- blocked / cancelled keep the progress reached
  end case;

  if new.status = 'done' then
    if tg_op = 'UPDATE' and old.status = 'done' then
      -- Already done: the user may correct the effective completion time.
      new.completed_at := coalesce(new.completed_at, old.completed_at);
    else
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create trigger tasks_normalize_status
  before insert or update of status, progress_percentage, completed_at on public.tasks
  for each row execute function public.normalize_task_status();

create function public.record_task_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.status is distinct from old.status
     or new.progress_percentage is distinct from old.progress_percentage then
    insert into public.task_status_history
      (task_id, owner_id, from_status, to_status, from_progress, to_progress, changed_by)
    values (
      new.id,
      new.owner_id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      case when tg_op = 'UPDATE' then old.progress_percentage end,
      new.progress_percentage,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

create trigger tasks_record_status_history
  after insert or update of status, progress_percentage on public.tasks
  for each row execute function public.record_task_status_history();

revoke execute on function public.normalize_task_status() from public, anon;
revoke execute on function public.record_task_status_history() from public, anon;
