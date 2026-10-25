-- Epics/subtasks: hierarchy rules, progress roll-up, hours roll-up and daily hours.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

create function pg_temp.login_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.progress(task uuid) returns text language sql as $$
  select status::text || ' ' || progress_percentage from public.tasks where id = task;
$$;

set local role authenticated;
select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
insert into public.tasks (id, title) values ('b0000000-0000-0000-0000-000000000001', 'Do Bob');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
update public.user_preferences set timezone = 'America/Sao_Paulo';
insert into public.tasks (id, title, kind) values ('e0000000-0000-0000-0000-000000000001', 'Lançamento', 'epic');
insert into public.tasks (id, title, parent_id, estimated_minutes) values
  ('a0000000-0000-0000-0000-000000000001', 'Landing page', 'e0000000-0000-0000-0000-000000000001', 120),
  ('a0000000-0000-0000-0000-000000000002', 'E-mail', 'e0000000-0000-0000-0000-000000000001', 60);
insert into public.tasks (id, title, parent_id) values
  ('a0000000-0000-0000-0000-000000000011', 'Texto', 'a0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000012', 'Imagens', 'a0000000-0000-0000-0000-000000000001');

select is(pg_temp.progress('e0000000-0000-0000-0000-000000000001'), 'not_started 0',
  'an epic with untouched tasks stays not started at 0%');

update public.tasks set status = 'done' where id = 'a0000000-0000-0000-0000-000000000011';
select is(pg_temp.progress('a0000000-0000-0000-0000-000000000001'), 'in_progress 50',
  'a task follows the average of its subtasks');
select is(pg_temp.progress('e0000000-0000-0000-0000-000000000001'), 'in_progress 33',
  'the epic follows its tasks weighted by estimate (120 min at 50%, 60 min at 0%)');

update public.tasks set progress_percentage = 90 where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.progress('a0000000-0000-0000-0000-000000000001'), 'in_progress 50',
  'manual progress on a task with subtasks is replaced by the roll-up');

update public.tasks set status = 'cancelled' where id = 'a0000000-0000-0000-0000-000000000012';
select is(pg_temp.progress('a0000000-0000-0000-0000-000000000001'), 'done 100',
  'cancelled subtasks are ignored, so the remaining done subtask completes the task');

update public.tasks set status = 'done' where id = 'a0000000-0000-0000-0000-000000000002';
select is(pg_temp.progress('e0000000-0000-0000-0000-000000000001'), 'done 100',
  'the epic is completed when all its tasks are done');
select isnt((select completed_at from public.tasks where id = 'e0000000-0000-0000-0000-000000000001'), null,
  'a rolled-up completion records completed_at');

update public.tasks set progress_percentage = 20 where id = 'a0000000-0000-0000-0000-000000000002';
select is(pg_temp.progress('e0000000-0000-0000-0000-000000000001'), 'in_progress 73',
  'reopening a task reopens the epic with the recomputed progress');

update public.tasks set deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000002';
select is(pg_temp.progress('e0000000-0000-0000-0000-000000000001'), 'done 100',
  'deleted tasks leave the roll-up');

update public.tasks set parent_id = null where id = 'a0000000-0000-0000-0000-000000000001';
select is(pg_temp.progress('e0000000-0000-0000-0000-000000000001'), 'done 100',
  'an epic without active children keeps its last progress');
update public.tasks set parent_id = 'e0000000-0000-0000-0000-000000000001'
 where id = 'a0000000-0000-0000-0000-000000000001';

-- Hierarchy rules
select throws_ok($$
  insert into public.tasks (title, kind, parent_id)
  values ('Épico filho', 'epic', 'e0000000-0000-0000-0000-000000000001')
$$, '23514', 'Um épico não pode pertencer a outra tarefa.', 'epics are top level');
select throws_ok($$
  insert into public.tasks (title, parent_id) values ('Nível 4', 'a0000000-0000-0000-0000-000000000011')
$$, '23514', 'Use no máximo três níveis: épico, tarefa e subtarefa.', 'at most three levels');
insert into public.tasks (id, title, parent_id) values
  ('a0000000-0000-0000-0000-000000000003', 'Outra do épico', 'e0000000-0000-0000-0000-000000000001');
select throws_ok($$
  update public.tasks set kind = 'task', parent_id = 'a0000000-0000-0000-0000-000000000011'
   where id = 'e0000000-0000-0000-0000-000000000001'
$$, '23514', null, 'an epic cannot move under its own subtask');
select throws_ok($$
  update public.tasks set parent_id = 'a0000000-0000-0000-0000-000000000003'
   where id = 'a0000000-0000-0000-0000-000000000001'
$$, '23514', 'Use no máximo três níveis: épico, tarefa e subtarefa.',
  'moving a task with subtasks under a task of the epic would create four levels');
select throws_ok($$
  update public.tasks set parent_id = 'a0000000-0000-0000-0000-000000000001'
   where id = 'a0000000-0000-0000-0000-000000000001'
$$, '23514', null, 'a task cannot be its own parent');
select throws_ok($$
  insert into public.tasks (title, parent_id) values ('Intrusa', 'b0000000-0000-0000-0000-000000000001')
$$, '23503', null, 'the parent must belong to the same account');

-- Hours
insert into public.time_entries (task_id, source, started_at, ended_at) values
  ('a0000000-0000-0000-0000-000000000001', 'manual', '2026-10-20 13:00+00', '2026-10-20 14:00+00'),
  ('a0000000-0000-0000-0000-000000000011', 'manual', '2026-10-20 15:00+00', '2026-10-20 15:30+00'),
  -- 23:00 to 01:00 in São Paulo: one hour on each day
  ('a0000000-0000-0000-0000-000000000011', 'manual', '2026-10-21 02:00+00', '2026-10-21 04:00+00');

update public.tasks set deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000003';
select results_eq(
  $$select own_seconds, tree_seconds, own_estimate_minutes, children_total, children_done
      from public.task_time_rollup('a0000000-0000-0000-0000-000000000001')$$,
  $$values (3600::bigint, 12600::bigint, 120, 1, 1)$$,
  'task_time_rollup sums the task and its subtasks');
select is(
  (select tree_seconds from public.task_time_rollup('e0000000-0000-0000-0000-000000000001')),
  12600::bigint, 'the epic includes subtask hours two levels down');

select results_eq(
  $$select day, seconds from public.daily_hours('2026-10-20', '2026-10-21')$$,
  $$values ('2026-10-20'::date, 9000::bigint), ('2026-10-21'::date, 3600::bigint)$$,
  'daily_hours splits entries at midnight in the user time zone');
select results_eq(
  $$select day, seconds from public.daily_hours('2026-10-20', '2026-10-20', 'a0000000-0000-0000-0000-000000000011')$$,
  $$values ('2026-10-20'::date, 5400::bigint)$$,
  'daily_hours can be limited to one task (and its subtasks)');

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
select is((select sum(seconds)::bigint from public.daily_hours('2026-10-20', '2026-10-21')), 0::bigint,
  'other accounts do not see these hours');

select * from finish();
rollback;
