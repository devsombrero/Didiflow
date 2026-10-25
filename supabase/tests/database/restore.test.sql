-- restore_backup(). Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

create function pg_temp.login_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

-- Bob owns a task whose id also appears in Alice's backup (cross-account id).
select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
insert into public.tasks (id, title) values ('c0000000-0000-0000-0000-000000000009', 'Tarefa do Bob');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.projects (id, name) values ('a0000000-0000-0000-0000-0000000000b1', 'Portal');
insert into public.tasks (id, title, updated_at) values
  ('a0000000-0000-0000-0000-000000000001', 'Atual mais nova', now());

create temp table backup as select jsonb_build_object(
  'format', 'didiflow-backup',
  'version', 1,
  'tables', jsonb_build_object(
    'projects', jsonb_build_array(
      jsonb_build_object('id', 'b0000000-0000-0000-0000-0000000000b2', 'name', 'portal', 'color', null,
        'updated_at', '2026-01-01T00:00:00Z'),
      jsonb_build_object('id', 'b0000000-0000-0000-0000-0000000000b3', 'name', 'Novo projeto', 'color', '#123456',
        'updated_at', '2026-01-01T00:00:00Z')),
    'tags', jsonb_build_array(
      jsonb_build_object('id', 'b0000000-0000-0000-0000-0000000000f1', 'name', 'urgente', 'color', null,
        'updated_at', '2026-01-01T00:00:00Z')),
    'tasks', jsonb_build_array(
      jsonb_build_object('id', 'a0000000-0000-0000-0000-000000000001', 'title', 'Versão antiga do backup',
        'status', 'not_started', 'priority', 'low', 'updated_at', '2020-01-01T00:00:00Z'),
      jsonb_build_object('id', 'b0000000-0000-0000-0000-000000000002', 'title', 'Do projeto reaproveitado',
        'status', 'done', 'progress_percentage', 100, 'completed_at', '2026-02-01T10:00:00Z',
        'priority', 'high', 'project_id', 'b0000000-0000-0000-0000-0000000000b2',
        'updated_at', '2026-02-01T10:00:00Z'),
      jsonb_build_object('id', 'c0000000-0000-0000-0000-000000000009', 'title', 'Id usado por outra conta',
        'status', 'in_progress', 'progress_percentage', 40, 'priority', 'medium',
        'project_id', 'b0000000-0000-0000-0000-0000000000b3', 'updated_at', '2026-02-01T10:00:00Z')),
    'task_tags', jsonb_build_array(
      jsonb_build_object('task_id', 'c0000000-0000-0000-0000-000000000009', 'tag_id', 'b0000000-0000-0000-0000-0000000000f1')),
    'time_entries', jsonb_build_array(
      jsonb_build_object('task_id', 'b0000000-0000-0000-0000-000000000002', 'started_at', '2026-02-01T08:00:00Z',
        'ended_at', '2026-02-01T09:30:00Z', 'description', 'Trabalho'),
      jsonb_build_object('task_id', null, 'started_at', '2026-02-02T08:00:00Z', 'ended_at', null))
  )) as data;

select lives_ok($$select public.restore_backup((select data from backup), 'merge')$$, 'merge restore runs');

select is((select title from public.tasks where id = 'a0000000-0000-0000-0000-000000000001'),
  'Atual mais nova', 'the more recent existing row wins over an older backup row');
select is((select project_id from public.tasks where title = 'Do projeto reaproveitado'),
  'a0000000-0000-0000-0000-0000000000b1'::uuid, 'a project with the same name is reused and referenced');
select results_eq(
  $$select status::text, progress_percentage, completed_at from public.tasks where title = 'Do projeto reaproveitado'$$,
  $$values ('done'::text, 100::smallint, '2026-02-01T10:00:00Z'::timestamptz)$$,
  'status, progress and effective completion date are restored');
select isnt((select id from public.tasks where title = 'Id usado por outra conta'),
  'c0000000-0000-0000-0000-000000000009'::uuid, 'an id owned by another account gets a new id');
select is(
  (select p.name from public.tasks t join public.projects p on p.id = t.project_id
    where t.title = 'Id usado por outra conta'),
  'Novo projeto', 'new projects are created and remapped');
select is(
  (select count(*)::int from public.task_tags tt join public.tasks t on t.id = tt.task_id
    where t.title = 'Id usado por outra conta'),
  1, 'tags follow remapped task ids');
select is((select count(*)::int from public.time_entries), 1, 'finished time entries are restored, running ones skipped');
select is((select duration_seconds from public.time_entries), 5400, 'time entry duration is recomputed');
select is((select owner_id from public.tasks where title = 'Do projeto reaproveitado'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'restored rows belong to the caller');

select lives_ok($$select public.restore_backup((select data from backup), 'merge')$$, 'restoring twice is safe');
select is((select count(*)::int from public.tasks where title = 'Do projeto reaproveitado'), 1,
  'a second merge does not duplicate tasks');
select is((select count(*)::int from public.time_entries), 1, 'a second merge does not duplicate time entries');

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
select is((select title from public.tasks where id = 'c0000000-0000-0000-0000-000000000009'),
  'Tarefa do Bob', 'the other account''s task is untouched');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$select public.restore_backup((select data from backup), 'replace')$$, 'replace restore runs');
select is(
  (select count(*)::int from public.tasks where title in ('Atual mais nova')), 0,
  'replace mode removes data that is not in the backup');

select throws_ok($$select public.restore_backup('{"format":"other"}'::jsonb, 'merge')$$,
  '22023', null, 'invalid backups are rejected');

select * from finish();
rollback;
