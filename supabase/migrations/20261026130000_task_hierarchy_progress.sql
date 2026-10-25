-- Epics and subtasks, automatic progress roll-up and the revised status flow.
--
-- Status / progress rules (replace 20261025160000):
--   not_started → 0%
--   in_progress → 0..99% (starting a task keeps 0%; 100% means done)
--   done        → 100% + completed_at
--   blocked / cancelled → progress preserved
-- A progress-only change derives the status: on a not-started task any value
-- above 0% starts it; 100% completes it; below 100% reopens a done task.
-- An in-progress task stays in progress at 0% (it was already started).
--
-- Hierarchy: epic > task > subtask (at most three levels). A task with active
-- children (not deleted, not cancelled) gets its progress from them: the
-- average weighted by estimate when every child has one, otherwise the plain
-- average. Manual progress edits on such a task are replaced by the roll-up;
-- explicit status changes (e.g. completing the epic) still apply.

alter table public.tasks
  add column kind text not null default 'task' check (kind in ('epic', 'task')),
  add column parent_id uuid,
  add constraint tasks_parent_fkey foreign key (parent_id, owner_id)
    references public.tasks (id, owner_id) on delete set null (parent_id),
  add constraint tasks_parent_not_self check (parent_id is distinct from id);

-- Starting a task keeps 0%: in progress now spans 0..99%.
alter table public.tasks drop constraint tasks_status_progress_check;
alter table public.tasks add constraint tasks_status_progress_check check (
  (status = 'not_started' and progress_percentage = 0)
  or (status = 'in_progress' and progress_percentage between 0 and 99)
  or (status = 'done' and progress_percentage = 100)
  or status in ('blocked', 'cancelled')
);

create index tasks_parent_idx on public.tasks (parent_id) where parent_id is not null;

-- Progress of the active children, or null when there are none.
create function public.task_children_progress(p_task_id uuid)
returns smallint
language sql
stable
set search_path = ''
as $$
  select case
    when count(*) = 0 then null
    when bool_and(coalesce(estimated_minutes, 0) > 0) then
      round(sum(progress_percentage::numeric * estimated_minutes) / sum(estimated_minutes))::smallint
    else round(avg(progress_percentage))::smallint
  end
  from public.tasks
  where parent_id = p_task_id
    and deleted_at is null
    and status <> 'cancelled';
$$;

create or replace function public.normalize_task_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status_changed boolean := tg_op = 'INSERT' or new.status is distinct from old.status;
  progress_changed boolean := tg_op = 'UPDATE' and new.progress_percentage is distinct from old.progress_percentage;
  rolled smallint;
begin
  -- Tasks with active children: progress comes from them.
  if tg_op = 'UPDATE' and not status_changed then
    rolled := public.task_children_progress(new.id);
    if rolled is not null then
      new.progress_percentage := rolled;
      progress_changed := new.progress_percentage is distinct from old.progress_percentage;
    end if;
  end if;

  if not status_changed and progress_changed then
    if new.status = 'not_started' and new.progress_percentage > 0 then
      new.status := 'in_progress';
    end if;
    if new.status in ('not_started', 'in_progress') and new.progress_percentage = 100 then
      new.status := 'done';
    elsif new.status = 'done' and new.progress_percentage < 100 then
      new.status := 'in_progress';
    end if;
  end if;

  case new.status
    when 'not_started' then
      new.progress_percentage := 0;
    when 'in_progress' then
      new.progress_percentage := least(greatest(new.progress_percentage, 0), 99);
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

-- Hierarchy rules: epics are top level; at most epic > task > subtask; no cycles.
create function public.validate_task_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_parent uuid;
  grandparent_parent uuid;
  parent_depth int;
  subtree_height int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.kind = 'epic' then
    raise exception 'Um épico não pode pertencer a outra tarefa.'
      using errcode = '23514', hint = 'task_hierarchy';
  end if;

  select t.parent_id into parent_parent from public.tasks t where t.id = new.parent_id;
  parent_depth := 0;
  if parent_parent is not null then
    if parent_parent = new.id then
      raise exception 'A tarefa não pode pertencer a uma subtarefa dela mesma.'
        using errcode = '23514', hint = 'task_hierarchy';
    end if;
    parent_depth := 1;
    select t.parent_id into grandparent_parent from public.tasks t where t.id = parent_parent;
    if grandparent_parent is not null then
      parent_depth := 2;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      select 1 from public.tasks c join public.tasks g on g.parent_id = c.id
       where c.parent_id = new.id
    ) then
      subtree_height := 2;
    elsif exists (select 1 from public.tasks c where c.parent_id = new.id) then
      subtree_height := 1;
    end if;
  end if;

  if parent_depth + 1 + subtree_height > 2 then
    raise exception 'Use no máximo três níveis: épico, tarefa e subtarefa.'
      using errcode = '23514', hint = 'task_hierarchy';
  end if;
  return new;
end;
$$;

create trigger tasks_validate_parent
  before insert or update of parent_id, kind on public.tasks
  for each row execute function public.validate_task_parent();

-- An epic that still has children cannot become a plain task under another.
-- (covered by validate_task_parent through the depth rule)

-- Children changed: recompute the parents' progress (walks up one level per
-- update, so grandparents follow automatically).
create function public.rollup_task_parents()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent uuid;
begin
  foreach parent in array array_remove(array[
    case when tg_op <> 'INSERT' then old.parent_id end,
    case when tg_op <> 'DELETE' then new.parent_id end
  ], null) loop
    update public.tasks p
       set progress_percentage = coalesce(public.task_children_progress(parent), p.progress_percentage)
     where p.id = parent;
  end loop;
  return null;
end;
$$;

create trigger tasks_rollup_parents
  after insert or delete or update of progress_percentage, status, parent_id, estimated_minutes, deleted_at
  on public.tasks
  for each row execute function public.rollup_task_parents();

-- Hours: tracked time of a task, of its whole subtree and of today.
create function public.task_time_rollup(p_task_id uuid)
returns table (
  own_seconds bigint,
  tree_seconds bigint,
  today_seconds bigint,
  own_estimate_minutes integer,
  tree_estimate_minutes integer,
  children_total integer,
  children_done integer
)
language sql
stable
set search_path = ''
as $$
  with recursive tree as (
    select id, 0 as depth from public.tasks where id = p_task_id
    union all
    select c.id, tree.depth + 1
      from public.tasks c join tree on c.parent_id = tree.id
     where c.deleted_at is null and tree.depth < 3
  ),
  zone as (
    select coalesce((select timezone from public.user_preferences where user_id = (select auth.uid())), 'UTC') as tz
  )
  select
    coalesce((select sum(e.duration_seconds) from public.time_entries e where e.task_id = p_task_id), 0)::bigint,
    coalesce((select sum(e.duration_seconds) from public.time_entries e join tree on e.task_id = tree.id), 0)::bigint,
    coalesce((
      select sum(e.duration_seconds) from public.time_entries e join tree on e.task_id = tree.id, zone
       where (e.started_at at time zone zone.tz)::date = (now() at time zone zone.tz)::date
    ), 0)::bigint,
    (select estimated_minutes from public.tasks where id = p_task_id),
    (select sum(t.estimated_minutes)::int from public.tasks t join tree on t.id = tree.id
      where tree.depth > 0 and t.status <> 'cancelled'),
    (select count(*)::int from public.tasks c
      where c.parent_id = p_task_id and c.deleted_at is null and c.status <> 'cancelled'),
    (select count(*)::int from public.tasks c
      where c.parent_id = p_task_id and c.deleted_at is null and c.status = 'done');
$$;

-- Hours per day in the user's time zone. Entries crossing midnight are split
-- across the days they cover (pauses are spread proportionally). With a task,
-- its subtasks are included.
create function public.daily_hours(p_from date, p_to date, p_task_id uuid default null)
returns table (day date, seconds bigint)
language sql
stable
set search_path = ''
as $$
  with recursive tree as (
    select id, 0 as depth from public.tasks where id = p_task_id
    union all
    select c.id, tree.depth + 1
      from public.tasks c join tree on c.parent_id = tree.id
     where c.deleted_at is null and tree.depth < 3
  ),
  zone as (
    select coalesce((select timezone from public.user_preferences where user_id = (select auth.uid())), 'UTC') as tz
  ),
  entries as (
    select e.started_at, e.ended_at, e.duration_seconds,
           extract(epoch from e.ended_at - e.started_at) as span
      from public.time_entries e
     where e.ended_at is not null
       and e.duration_seconds > 0
       and (p_task_id is null or e.task_id in (select id from tree))
       and e.ended_at > (p_from::timestamp at time zone (select tz from zone))
       and e.started_at < ((p_to + 1)::timestamp at time zone (select tz from zone))
  ),
  days as (
    select d::date as day,
           (d::timestamp at time zone (select tz from zone)) as day_start,
           ((d + interval '1 day')::timestamp at time zone (select tz from zone)) as day_end
      from generate_series(p_from, p_to, interval '1 day') d
  )
  select days.day,
         coalesce(round(sum(
           extract(epoch from least(e.ended_at, days.day_end) - greatest(e.started_at, days.day_start))
           * e.duration_seconds / nullif(e.span, 0)
         )), 0)::bigint
    from days
    left join entries e on e.started_at < days.day_end and e.ended_at > days.day_start
   group by days.day
   order by days.day;
$$;

alter table public.user_preferences
  add column daily_hours_target numeric(4, 2) not null default 8
    check (daily_hours_target between 0.5 and 24);
grant update (daily_hours_target) on public.user_preferences to authenticated;

revoke execute on function public.validate_task_parent() from public, anon;
revoke execute on function public.rollup_task_parents() from public, anon;
revoke execute on function public.task_children_progress(uuid) from public, anon;
revoke execute on function public.task_time_rollup(uuid) from public, anon;
revoke execute on function public.daily_hours(date, date, uuid) from public, anon;
grant execute on function public.task_time_rollup(uuid) to authenticated;
grant execute on function public.daily_hours(date, date, uuid) to authenticated;
grant execute on function public.task_children_progress(uuid) to authenticated;
