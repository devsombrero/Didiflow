-- Daily priorities and focus sessions. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

create function pg_temp.login_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
insert into public.tasks (id, title) values ('b0000000-0000-0000-0000-000000000001', 'Bob task');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.tasks (id, title) values ('a0000000-0000-0000-0000-000000000001', 'Alice task');

select lives_ok(
  $$insert into public.daily_priorities (priority_date, task_id, position)
    values ('2026-10-25', 'a0000000-0000-0000-0000-000000000001', 0)$$,
  'tasks can be added to the daily priorities');
select throws_ok(
  $$insert into public.daily_priorities (priority_date, task_id)
    values ('2026-10-25', 'a0000000-0000-0000-0000-000000000001')$$,
  '23505', null, 'a task appears once per day');
select throws_ok(
  $$insert into public.daily_priorities (priority_date, task_id)
    values ('2026-10-25', 'b0000000-0000-0000-0000-000000000001')$$,
  '23503', null, 'priorities cannot reference another user task');

select lives_ok(
  $$insert into public.focus_sessions (task_id, planned_minutes)
    values ('a0000000-0000-0000-0000-000000000001', 25)$$,
  'a focus session can start');
select throws_ok(
  $$insert into public.focus_sessions (planned_minutes) values (25)$$,
  '23505', null, 'only one focus session can be active');
select throws_ok(
  $$update public.focus_sessions set completed = true$$,
  '23514', null, 'completed sessions must have ended');
select throws_ok(
  $$insert into public.focus_sessions (planned_minutes, started_at, ended_at) values (300, now(), now())$$,
  '23514', null, 'planned duration is limited to 4 hours');

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
select is(
  (select count(*)::int from public.daily_priorities) + (select count(*)::int from public.focus_sessions),
  0, 'priorities and sessions are private');

select * from finish();
rollback;
