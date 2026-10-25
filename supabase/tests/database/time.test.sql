-- Time entries and timer actions. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

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
select public.start_timer(null, 'Bob working');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.tasks (id, title) values ('a0000000-0000-0000-0000-000000000001', 'Alice task');

-- Manual entries
insert into public.time_entries (id, task_id, started_at, ended_at, description)
values ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        '2026-10-20 09:00+00', '2026-10-20 10:30+00', 'Análise');
select is((select duration_seconds from public.time_entries where id = 'e0000000-0000-0000-0000-000000000001'),
  5400, 'manual entry duration is computed');
select is((select source from public.time_entries where id = 'e0000000-0000-0000-0000-000000000001'),
  'manual', 'manual is the default source');

update public.time_entries set ended_at = '2026-10-20 11:00+00'
  where id = 'e0000000-0000-0000-0000-000000000001';
select is((select duration_seconds from public.time_entries where id = 'e0000000-0000-0000-0000-000000000001'),
  7200, 'duration follows edits');

select throws_ok(
  $$insert into public.time_entries (started_at, ended_at) values ('2026-10-20 10:00+00', '2026-10-20 09:00+00')$$,
  '23514', null, 'end cannot precede start');
select throws_ok(
  $$insert into public.time_entries (started_at, ended_at) values ('2026-10-20 00:00+00', '2026-10-21 01:00+00')$$,
  '23514', null, 'entries are limited to 24 hours');
select throws_ok(
  $$insert into public.time_entries (task_id, started_at, ended_at)
    values ('b0000000-0000-0000-0000-000000000001', '2026-10-20 09:00+00', '2026-10-20 10:00+00')$$,
  '23503', null, 'entries cannot reference another user task');

-- Timer flow
select isnt((select id from public.start_timer('a0000000-0000-0000-0000-000000000001', '  Codando  ')), null,
  'start_timer creates a running entry');
select results_eq(
  $$select source, description, ended_at is null from public.time_entries where ended_at is null$$,
  $$values ('timer'::text, 'Codando'::text, true)$$, 'running entry is visible and trimmed');
select throws_ok($$select public.start_timer()$$, 'P0001', null, 'only one timer can run at a time');

select isnt((select paused_at from public.pause_timer()), null, 'pause records paused_at');
select is((select paused_at from public.pause_timer()), null, 'pausing twice is a no-op');

-- Simulate 2 minutes of pause and 10 minutes of total elapsed time.
reset role;
update public.time_entries
   set started_at = now() - interval '10 minutes', paused_at = now() - interval '2 minutes'
 where owner_id = '11111111-1111-1111-1111-111111111111' and ended_at is null;
set local role authenticated;

select ok((select paused_seconds between 119 and 121 from public.resume_timer()),
  'resume accumulates the paused time');
select ok((select duration_seconds between 479 and 481 from public.stop_timer()),
  'stop computes duration excluding pauses');
select is((select count(*)::int from public.time_entries where ended_at is null), 0,
  'no timer running after stop');

select is((select count(*)::int from public.time_entries), 2, 'users see only their entries');

reset role;
set local role anon;
select throws_ok($$select public.start_timer()$$, '42501', null, 'anon cannot start timers');

select * from finish();
rollback;
