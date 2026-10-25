-- Same restore_backup behavior, written so the schema linter (plpgsql_check)
-- can analyze it: no temp table (ids are remapped through a jsonb map) and
-- no constant folding of the organization-kind loop.

create or replace function public.restore_backup(p_backup jsonb, p_mode text default 'merge')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t jsonb := p_backup -> 'tables';
  kind text;
  rec jsonb;
  existing_id uuid;
  existing_updated timestamptz;
  new_id uuid;
  inserted int;
  updated int;
  skipped int;
  summary jsonb := '{}'::jsonb;
  -- "<kind>:<old id>" -> new id
  id_map jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_backup ->> 'format' is distinct from 'didiflow-backup' or (p_backup ->> 'version')::int is distinct from 1 then
    raise exception 'unsupported backup format' using errcode = '22023', hint = 'invalid_backup';
  end if;
  if p_mode not in ('merge', 'replace') then
    raise exception 'invalid restore mode' using errcode = '22023';
  end if;
  if jsonb_typeof(t) is distinct from 'object' then
    raise exception 'backup has no tables' using errcode = '22023', hint = 'invalid_backup';
  end if;

  if p_mode = 'replace' then
    delete from public.focus_sessions where owner_id = uid;
    delete from public.daily_priorities where owner_id = uid;
    delete from public.task_reminders where owner_id = uid;
    delete from public.time_entries where owner_id = uid;
    delete from public.tasks where owner_id = uid;
    delete from public.projects where owner_id = uid;
    delete from public.categories where owner_id = uid;
    delete from public.tags where owner_id = uid;
    delete from public.work_contexts where owner_id = uid;
    delete from public.personal_goals where owner_id = uid;
    delete from public.skill_achievements where owner_id = uid;
  end if;

  -- Organization items (same shape), reused by name when the id is new.
  -- for/unnest instead of foreach keeps plpgsql_check from folding the array
  -- into the dynamic statements below.
  for kind in select unnest(array['projects', 'categories', 'tags', 'work_contexts']) loop
    inserted := 0; updated := 0; skipped := 0;
    for rec in select value from jsonb_array_elements(coalesce(t -> kind, '[]'::jsonb)) loop
      execute format('select id, updated_at from public.%I where owner_id = $1 and id = $2', kind)
        into existing_id, existing_updated using uid, (rec ->> 'id')::uuid;
      if existing_id is not null then
        if (rec ->> 'updated_at')::timestamptz > existing_updated then
          execute format(
            'update public.%I set name = $1, color = $2, updated_at = now() where id = $3', kind)
            using rec ->> 'name', rec ->> 'color', existing_id;
          if kind = 'projects' then
            update public.projects
               set description = rec ->> 'description',
                   archived_at = (rec ->> 'archived_at')::timestamptz
             where id = existing_id;
          end if;
          updated := updated + 1;
        else
          skipped := skipped + 1;
        end if;
        id_map := id_map || jsonb_build_object(kind || ':' || existing_id, existing_id);
        continue;
      end if;

      execute format('select id from public.%I where owner_id = $1 and lower(name) = lower($2)', kind)
        into existing_id using uid, rec ->> 'name';
      if existing_id is not null then
        id_map := id_map || jsonb_build_object(kind || ':' || (rec ->> 'id'), existing_id);
        skipped := skipped + 1;
        continue;
      end if;

      new_id := (rec ->> 'id')::uuid;
      begin
        execute format('insert into public.%I (id, name, color) values ($1, $2, $3)', kind)
          using new_id, rec ->> 'name', rec ->> 'color';
      exception when unique_violation then
        new_id := gen_random_uuid();
        execute format('insert into public.%I (id, name, color) values ($1, $2, $3)', kind)
          using new_id, rec ->> 'name', rec ->> 'color';
      end;
      if kind = 'projects' then
        update public.projects
           set description = rec ->> 'description',
               archived_at = (rec ->> 'archived_at')::timestamptz
         where id = new_id;
      end if;
      id_map := id_map || jsonb_build_object(kind || ':' || (rec ->> 'id'), new_id);
      inserted := inserted + 1;
    end loop;
    summary := summary || jsonb_build_object(kind,
      jsonb_build_object('inserted', inserted, 'updated', updated, 'skipped', skipped));
  end loop;

  -- Tasks
  inserted := 0; updated := 0; skipped := 0;
  for rec in select value from jsonb_array_elements(coalesce(t -> 'tasks', '[]'::jsonb)) loop
    select id, updated_at into existing_id, existing_updated
      from public.tasks where owner_id = uid and id = (rec ->> 'id')::uuid;

    if existing_id is not null and (rec ->> 'updated_at')::timestamptz <= existing_updated then
      id_map := id_map || jsonb_build_object('tasks:' || existing_id, existing_id);
      skipped := skipped + 1;
      continue;
    end if;

    if existing_id is null then
      new_id := (rec ->> 'id')::uuid;
      begin
        insert into public.tasks (id, title) values (new_id, rec ->> 'title');
      exception when unique_violation then
        new_id := gen_random_uuid();
        insert into public.tasks (id, title) values (new_id, rec ->> 'title');
      end;
      inserted := inserted + 1;
    else
      new_id := existing_id;
      updated := updated + 1;
    end if;

    update public.tasks set
      title = rec ->> 'title',
      description = rec ->> 'description',
      requested_at = (rec ->> 'requested_at')::date,
      requester_name = rec ->> 'requester_name',
      has_jira_card = coalesce((rec ->> 'has_jira_card')::boolean, false),
      jira_url = rec ->> 'jira_url',
      has_slack_thread = coalesce((rec ->> 'has_slack_thread')::boolean, false),
      slack_thread_url = rec ->> 'slack_thread_url',
      notes = rec ->> 'notes',
      start_date = (rec ->> 'start_date')::date,
      due_date = (rec ->> 'due_date')::date,
      status = (rec ->> 'status')::public.task_status,
      progress_percentage = coalesce((rec ->> 'progress_percentage')::smallint, 0),
      completed_at = (rec ->> 'completed_at')::timestamptz,
      priority = coalesce((rec ->> 'priority')::public.task_priority, 'medium'),
      estimated_minutes = (rec ->> 'estimated_minutes')::int,
      project_id = (id_map ->> ('projects:' || (rec ->> 'project_id')))::uuid,
      category_id = (id_map ->> ('categories:' || (rec ->> 'category_id')))::uuid,
      context_id = (id_map ->> ('work_contexts:' || (rec ->> 'context_id')))::uuid,
      archived_at = (rec ->> 'archived_at')::timestamptz,
      deleted_at = (rec ->> 'deleted_at')::timestamptz
    where id = new_id;

    id_map := id_map || jsonb_build_object('tasks:' || (rec ->> 'id'), new_id);
  end loop;
  summary := summary || jsonb_build_object('tasks',
    jsonb_build_object('inserted', inserted, 'updated', updated, 'skipped', skipped));

  -- Task tags
  insert into public.task_tags (task_id, tag_id)
  select m.task_id, m.tag_id
    from jsonb_array_elements(coalesce(t -> 'task_tags', '[]'::jsonb)) j
    cross join lateral (
      select (id_map ->> ('tasks:' || (j.value ->> 'task_id')))::uuid as task_id,
             (id_map ->> ('tags:' || (j.value ->> 'tag_id')))::uuid as tag_id
    ) m
   where m.task_id is not null and m.tag_id is not null
  on conflict do nothing;
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('task_tags', jsonb_build_object('inserted', inserted));

  -- Time entries (finished only), goals, achievements, reminders, priorities, focus sessions:
  -- insert rows whose id is not present yet for this user.
  insert into public.time_entries (task_id, description, source, started_at, ended_at, paused_seconds)
  select (id_map ->> ('tasks:' || (j.value ->> 'task_id')))::uuid,
         j.value ->> 'description', coalesce(j.value ->> 'source', 'manual'),
         (j.value ->> 'started_at')::timestamptz, (j.value ->> 'ended_at')::timestamptz,
         coalesce((j.value ->> 'paused_seconds')::int, 0)
    from jsonb_array_elements(coalesce(t -> 'time_entries', '[]'::jsonb)) j
   where j.value ->> 'ended_at' is not null
     and not exists (
       select 1 from public.time_entries e
        where e.owner_id = uid
          and e.started_at = (j.value ->> 'started_at')::timestamptz
          and e.ended_at = (j.value ->> 'ended_at')::timestamptz);
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('time_entries', jsonb_build_object('inserted', inserted));

  insert into public.personal_goals (title, metric, comparison, target_value, achievability, relevance, start_date, end_date)
  select j.value ->> 'title', (j.value ->> 'metric')::public.kpi_metric, j.value ->> 'comparison',
         (j.value ->> 'target_value')::numeric, j.value ->> 'achievability', j.value ->> 'relevance',
         (j.value ->> 'start_date')::date, (j.value ->> 'end_date')::date
    from jsonb_array_elements(coalesce(t -> 'personal_goals', '[]'::jsonb)) j
   where not exists (
     select 1 from public.personal_goals g
      where g.owner_id = uid and g.title = j.value ->> 'title'
        and g.start_date = (j.value ->> 'start_date')::date);
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('personal_goals', jsonb_build_object('inserted', inserted));

  insert into public.skill_achievements (title, kind, provider, achieved_on, hours, url, notes)
  select j.value ->> 'title', j.value ->> 'kind', j.value ->> 'provider',
         (j.value ->> 'achieved_on')::date, (j.value ->> 'hours')::numeric, j.value ->> 'url', j.value ->> 'notes'
    from jsonb_array_elements(coalesce(t -> 'skill_achievements', '[]'::jsonb)) j
   where not exists (
     select 1 from public.skill_achievements a
      where a.owner_id = uid and a.title = j.value ->> 'title'
        and a.achieved_on = (j.value ->> 'achieved_on')::date);
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('skill_achievements', jsonb_build_object('inserted', inserted));

  insert into public.task_reminders (task_id, remind_at, note, sent_at)
  select m.new_id, (j.value ->> 'remind_at')::timestamptz, j.value ->> 'note', (j.value ->> 'sent_at')::timestamptz
    from jsonb_array_elements(coalesce(t -> 'task_reminders', '[]'::jsonb)) j
    cross join lateral (select (id_map ->> ('tasks:' || (j.value ->> 'task_id')))::uuid as new_id) m
   where m.new_id is not null and not exists (
     select 1 from public.task_reminders r
      where r.task_id = m.new_id and r.remind_at = (j.value ->> 'remind_at')::timestamptz);
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('task_reminders', jsonb_build_object('inserted', inserted));

  insert into public.daily_priorities (priority_date, task_id, position)
  select (j.value ->> 'priority_date')::date, m.new_id, coalesce((j.value ->> 'position')::smallint, 0)
    from jsonb_array_elements(coalesce(t -> 'daily_priorities', '[]'::jsonb)) j
    cross join lateral (select (id_map ->> ('tasks:' || (j.value ->> 'task_id')))::uuid as new_id) m
   where m.new_id is not null
  on conflict do nothing;
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('daily_priorities', jsonb_build_object('inserted', inserted));

  insert into public.focus_sessions (task_id, started_at, ended_at, planned_minutes, completed, notes)
  select (id_map ->> ('tasks:' || (j.value ->> 'task_id')))::uuid,
         (j.value ->> 'started_at')::timestamptz, (j.value ->> 'ended_at')::timestamptz,
         (j.value ->> 'planned_minutes')::smallint, coalesce((j.value ->> 'completed')::boolean, false),
         j.value ->> 'notes'
    from jsonb_array_elements(coalesce(t -> 'focus_sessions', '[]'::jsonb)) j
   where j.value ->> 'ended_at' is not null
     and not exists (
       select 1 from public.focus_sessions f
        where f.owner_id = uid and f.started_at = (j.value ->> 'started_at')::timestamptz);
  get diagnostics inserted = row_count;
  summary := summary || jsonb_build_object('focus_sessions', jsonb_build_object('inserted', inserted));

  -- Profile and preferences: the backup wins only when it is more recent.
  update public.profiles p
     set display_name = coalesce(t -> 'profiles' -> 0 ->> 'display_name', p.display_name)
   where p.id = uid
     and (p_mode = 'replace' or (t -> 'profiles' -> 0 ->> 'updated_at')::timestamptz > p.updated_at);

  update public.user_preferences p set
    theme = coalesce((j ->> 'theme')::public.theme_preference, p.theme),
    timezone = coalesce(j ->> 'timezone', p.timezone),
    date_format = coalesce(j ->> 'date_format', p.date_format),
    notifications_enabled = coalesce((j ->> 'notifications_enabled')::boolean, p.notifications_enabled),
    notify_due_soon = coalesce((j ->> 'notify_due_soon')::boolean, p.notify_due_soon),
    notify_overdue = coalesce((j ->> 'notify_overdue')::boolean, p.notify_overdue),
    due_soon_days = coalesce((j ->> 'due_soon_days')::smallint, p.due_soon_days)
  from (select t -> 'user_preferences' -> 0 as j) src
  where p.user_id = uid
    and src.j is not null
    and (p_mode = 'replace' or (src.j ->> 'updated_at')::timestamptz > p.updated_at);

  return jsonb_build_object('mode', p_mode, 'tables', summary);
end;
$$;
