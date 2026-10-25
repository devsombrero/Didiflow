-- Audit trail for tasks: one task_activity_logs row per relevant event.
-- Users can read their logs but never write them (see the RLS migration).

create function public.record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  field_changes jsonb;
  status_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
    values (new.owner_id, new.id, 'created', jsonb_build_object('title', new.title), actor);
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- Hard delete (normally only via account removal or maintenance).
    insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
    values (old.owner_id, old.id, 'deleted',
            jsonb_build_object('title', old.title, 'hard_delete', true), actor);
    return null;
  end if;

  -- Logical delete / restore
  if old.deleted_at is null and new.deleted_at is not null then
    insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
    values (new.owner_id, new.id, 'deleted', jsonb_build_object('title', new.title), actor);
  elsif old.deleted_at is not null and new.deleted_at is null then
    insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
    values (new.owner_id, new.id, 'restored', jsonb_build_object('title', new.title), actor);
  end if;

  -- Archive / unarchive
  if old.archived_at is null and new.archived_at is not null then
    insert into public.task_activity_logs (owner_id, task_id, action, actor_id)
    values (new.owner_id, new.id, 'archived', actor);
  elsif old.archived_at is not null and new.archived_at is null then
    insert into public.task_activity_logs (owner_id, task_id, action, actor_id)
    values (new.owner_id, new.id, 'unarchived', actor);
  end if;

  -- Status transitions
  if new.status is distinct from old.status then
    status_action := case
      when new.status = 'done' then 'completed'
      when new.status = 'cancelled' then 'cancelled'
      when old.status in ('done', 'cancelled') then 'reopened'
      else 'status_changed'
    end;
    insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
    values (new.owner_id, new.id, status_action,
            jsonb_build_object(
              'status', jsonb_build_object('old', old.status, 'new', new.status),
              'progress_percentage',
                jsonb_build_object('old', old.progress_percentage, 'new', new.progress_percentage)),
            actor);
  elsif new.progress_percentage is distinct from old.progress_percentage then
    insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
    values (new.owner_id, new.id, 'progress_changed',
            jsonb_build_object('progress_percentage',
              jsonb_build_object('old', old.progress_percentage, 'new', new.progress_percentage)),
            actor);
  end if;

  -- Other field edits, with previous and new values.
  select jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value))
    into field_changes
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n using (key)
   where o.value is distinct from n.value
     and o.key not in ('id', 'owner_id', 'created_at', 'updated_at', 'status',
                       'progress_percentage', 'completed_at', 'archived_at', 'deleted_at');

  if field_changes is not null then
    insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
    values (new.owner_id, new.id, 'updated', field_changes, actor);
  end if;

  return null;
end;
$$;

create trigger tasks_record_activity
  after insert or update or delete on public.tasks
  for each row execute function public.record_task_activity();

revoke execute on function public.record_task_activity() from public, anon;
