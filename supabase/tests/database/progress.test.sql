-- Status/progress normalization and status history. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated');

select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
set local role authenticated;

create temp view t as
  select status::text, progress_percentage as progress, completed_at
  from public.tasks where id = 'a0000000-0000-0000-0000-000000000001';

insert into public.tasks (id, title) values ('a0000000-0000-0000-0000-000000000001', 'Tarefa');
select results_eq('select status, progress from t', $$values ('not_started', 0::smallint)$$,
  'new tasks start not started at 0%');

update public.tasks set progress_percentage = 30 where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('in_progress', 30::smallint)$$,
  'setting progress starts the task');

update public.tasks set progress_percentage = 100 where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('done', 100::smallint)$$,
  'reaching 100% completes the task');
select isnt((select completed_at from t), null, 'completion records completed_at');

update public.tasks set completed_at = '2026-10-01 12:00+00' where id = 'a0000000-0000-0000-0000-000000000001';
select is((select completed_at from t), '2026-10-01 12:00+00'::timestamptz,
  'the effective completion time can be corrected on a done task');

update public.tasks set title = 'Tarefa renomeada' where id = 'a0000000-0000-0000-0000-000000000001';
select is((select completed_at from t), '2026-10-01 12:00+00'::timestamptz,
  'unrelated updates keep completed_at');

update public.tasks set progress_percentage = 60 where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('in_progress', 60::smallint)$$,
  'lowering progress of a done task reopens it');
select is((select completed_at from t), null, 'reopening clears completed_at');

update public.tasks set status = 'blocked' where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('blocked', 60::smallint)$$,
  'blocking preserves progress');

update public.tasks set progress_percentage = 70 where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('blocked', 70::smallint)$$,
  'progress changes keep a blocked task blocked');

update public.tasks set status = 'done' where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('done', 100::smallint)$$,
  'completing explicitly sets 100%');

update public.tasks set status = 'cancelled' where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('cancelled', 100::smallint)$$,
  'cancelling keeps the progress reached');
select is((select completed_at from t), null, 'cancelled tasks are not completed');

update public.tasks set status = 'not_started' where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('not_started', 0::smallint)$$,
  'not started resets progress to 0%');

update public.tasks set status = 'in_progress' where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('in_progress', 0::smallint)$$,
  'starting a task keeps 0%');

update public.tasks set progress_percentage = 40 where id = 'a0000000-0000-0000-0000-000000000001';
update public.tasks set progress_percentage = 0 where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('in_progress', 0::smallint)$$,
  'an in-progress task stays in progress at 0%');

update public.tasks set progress_percentage = 100 where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('done', 100::smallint)$$,
  'reaching 100% from in progress completes the task');

update public.tasks set status = 'blocked' where id = 'a0000000-0000-0000-0000-000000000001';
update public.tasks set status = 'in_progress', progress_percentage = 100
  where id = 'a0000000-0000-0000-0000-000000000001';
select results_eq('select status, progress from t', $$values ('in_progress', 99::smallint)$$,
  'an explicit in-progress status caps progress at 99%');

insert into public.tasks (id, title, status, progress_percentage)
  values ('a0000000-0000-0000-0000-000000000002', 'Já concluída', 'done', 0);
select results_eq(
  $$select status::text, progress_percentage, completed_at is not null
    from public.tasks where id = 'a0000000-0000-0000-0000-000000000002'$$,
  $$values ('done', 100::smallint, true)$$,
  'inserting a done task normalizes progress and completion');

-- History
select is(
  (select count(*)::int from public.task_status_history
    where task_id = 'a0000000-0000-0000-0000-000000000001'),
  15, 'every status/progress change is recorded (title/completed_at edits are not)');
select results_eq(
  $$select from_status::text, to_status::text, from_progress, to_progress
    from public.task_status_history where task_id = 'a0000000-0000-0000-0000-000000000001'
    order by id limit 2$$,
  $$values (null, 'not_started', null::smallint, 0::smallint),
           ('not_started', 'in_progress', 0::smallint, 30::smallint)$$,
  'history keeps previous and new values');
select is(
  (select count(*)::int from public.task_status_history
    where changed_by <> '11111111-1111-1111-1111-111111111111'),
  0, 'history records the acting user');
select throws_ok(
  $$update public.task_status_history set to_status = 'done'$$,
  '42501', null, 'history cannot be edited');
select throws_ok(
  $$delete from public.task_status_history$$,
  '42501', null, 'history cannot be deleted');

reset role;
select is(
  (select count(*)::int from public.task_status_history
    where task_id = 'a0000000-0000-0000-0000-000000000002'),
  1, 'inserted tasks get an initial history row');
delete from public.tasks where id = 'a0000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.task_status_history
    where task_id = 'a0000000-0000-0000-0000-000000000002'),
  0, 'hard delete removes status history with the task');

select * from finish();
rollback;
