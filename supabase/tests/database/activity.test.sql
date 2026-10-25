-- Task audit trail. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
set local role authenticated;

create temp view log as
  select action, changes, actor_id from public.task_activity_logs
  where task_id = 'a0000000-0000-0000-0000-000000000001' order by id;

insert into public.tasks (id, title) values ('a0000000-0000-0000-0000-000000000001', 'Contrato');
select results_eq('select action from log', $$values ('created')$$, 'creation is logged');

update public.tasks set title = 'Contrato revisado', priority = 'high'
  where id = 'a0000000-0000-0000-0000-000000000001';
select is(
  (select changes from log where action = 'updated'),
  '{"title": {"old": "Contrato", "new": "Contrato revisado"},
    "priority": {"old": "medium", "new": "high"}}'::jsonb,
  'field edits record previous and new values');

update public.tasks set progress_percentage = 40 where id = 'a0000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from log where action = 'status_changed'), 1,
  'progress that starts the task is logged as a status change');

update public.tasks set progress_percentage = 60 where id = 'a0000000-0000-0000-0000-000000000001';
select is(
  (select changes -> 'progress_percentage' from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001' and action = 'progress_changed'),
  '{"old": 40, "new": 60}'::jsonb, 'progress changes are logged');

update public.tasks set status = 'done' where id = 'a0000000-0000-0000-0000-000000000001';
update public.tasks set status = 'in_progress', progress_percentage = 80
  where id = 'a0000000-0000-0000-0000-000000000001';
update public.tasks set status = 'cancelled' where id = 'a0000000-0000-0000-0000-000000000001';
update public.tasks set status = 'not_started' where id = 'a0000000-0000-0000-0000-000000000001';

select results_eq(
  $$select action from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001'
      and action in ('completed', 'reopened', 'cancelled') order by id$$,
  $$values ('completed'), ('reopened'), ('cancelled'), ('reopened')$$,
  'completion, cancellation and reopening are logged');
select is(
  (select count(*)::int from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001' and action = 'updated'),
  1, 'status changes do not produce spurious field-edit entries');

update public.tasks set archived_at = now() where id = 'a0000000-0000-0000-0000-000000000001';
update public.tasks set archived_at = null where id = 'a0000000-0000-0000-0000-000000000001';
update public.tasks set deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000001';

select results_eq(
  $$select action from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001'
      and action in ('archived', 'unarchived', 'deleted') order by id$$,
  $$values ('archived'), ('unarchived'), ('deleted')$$,
  'archive, unarchive and logical delete are logged');
select is(
  (select count(*)::int from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001'
      and actor_id <> '11111111-1111-1111-1111-111111111111'),
  0, 'every entry records the acting user');

select throws_ok($$update public.task_activity_logs set action = 'created'$$, '42501', null,
  'users cannot edit the audit log');
select throws_ok($$delete from public.task_activity_logs$$, '42501', null,
  'users cannot delete the audit log');

-- Bob cannot see Alice's log.
select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*)::int from public.task_activity_logs), 0, 'logs are private to the owner');

-- Hard delete keeps the audit trail.
reset role;
delete from public.tasks where id = 'a0000000-0000-0000-0000-000000000001';
select is(
  (select changes ->> 'hard_delete' from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001' and action = 'deleted'
    order by id desc limit 1),
  'true', 'hard delete is logged');
select cmp_ok(
  (select count(*)::int from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001'),
  '>', 10, 'audit trail survives the hard delete');

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from public.task_activity_logs
    where owner_id = '11111111-1111-1111-1111-111111111111'),
  0, 'audit trail is removed with the user account');

select * from finish();
rollback;
