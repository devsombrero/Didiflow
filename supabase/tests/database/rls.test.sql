-- Row Level Security and integrity tests. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures: two users (Alice, Bob) created as the auth service would.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated',
   '{"display_name": "Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated',
   '{}');

create function pg_temp.login_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
$$;

create function pg_temp.logout() returns void language sql as $$
  reset role;
  select set_config('request.jwt.claims', null, true);
$$;

-- Bob's data, created as Bob.
select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
insert into public.projects (id, name) values ('b0000000-0000-0000-0000-000000000001', 'Bob project');
insert into public.tags (id, name) values ('b0000000-0000-0000-0000-000000000002', 'bob-tag');
insert into public.tasks (id, title) values ('b0000000-0000-0000-0000-000000000003', 'Bob task');
select pg_temp.logout();

-- ---------------------------------------------------------------------------
-- Sign-up trigger
-- ---------------------------------------------------------------------------
select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice', 'sign-up creates a profile with the display name from metadata');
select is(
  (select count(*)::int from public.user_preferences
    where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2, 'sign-up creates default preferences');

-- ---------------------------------------------------------------------------
-- Isolation as Alice
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-1111-1111-1111-111111111111');

insert into public.tasks (id, title) values ('a0000000-0000-0000-0000-000000000001', 'Alice task');

select is((select owner_id from public.tasks where id = 'a0000000-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'owner_id defaults to auth.uid()');
select is((select count(*)::int from public.tasks), 1, 'Alice sees only her tasks');
select is((select count(*)::int from public.projects), 0, 'Alice does not see Bob projects');
select is((select count(*)::int from public.tags), 0, 'Alice does not see Bob tags');
select is((select count(*)::int from public.profiles), 1, 'Alice sees only her profile');
select is((select count(*)::int from public.user_preferences), 1, 'Alice sees only her preferences');

select throws_ok(
  $$insert into public.tasks (title, owner_id) values ('x', '22222222-2222-2222-2222-222222222222')$$,
  '42501', null, 'Alice cannot create a task owned by Bob');

update public.tasks set title = 'hacked' where id = 'b0000000-0000-0000-0000-000000000003';
delete from public.tasks where id = 'b0000000-0000-0000-0000-000000000003';

select throws_ok(
  $$update public.tasks set owner_id = '22222222-2222-2222-2222-222222222222'
    where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'Alice cannot hand a task over to Bob');

select throws_ok(
  $$update public.tasks set project_id = 'b0000000-0000-0000-0000-000000000001'
    where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'Alice cannot attach Bob project to her task');

select throws_ok(
  $$insert into public.task_tags (task_id, tag_id)
    values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')$$,
  '23503', null, 'Alice cannot attach Bob tag to her task');

select throws_ok(
  $$insert into public.task_status_history (task_id, owner_id, to_status, to_progress)
    values ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'done', 100)$$,
  '42501', null, 'users cannot write status history');

select throws_ok(
  $$insert into public.task_activity_logs (owner_id, task_id, action)
    values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'created')$$,
  '42501', null, 'users cannot write activity logs');

select throws_ok($$truncate public.tasks$$, '42501', null, 'users cannot truncate tables');

select throws_ok(
  $$update public.profiles set id = '33333333-3333-3333-3333-333333333333'$$,
  '42501', null, 'profile id is not updatable');

update public.profiles set display_name = 'Alice Updated';
select is((select display_name from public.profiles), 'Alice Updated', 'Alice can update her display name');

update public.user_preferences set theme = 'dark', timezone = 'Europe/Lisbon';
select is((select theme::text from public.user_preferences), 'dark', 'Alice can update her preferences');

select throws_ok($$update public.user_preferences set timezone = 'Mars/Olympus'$$,
  '22023', null, 'invalid timezones are rejected');

select pg_temp.logout();

select is((select title from public.tasks where id = 'b0000000-0000-0000-0000-000000000003'),
  'Bob task', 'Alice could not update or delete Bob task');
select is((select owner_id from public.tasks where id = 'a0000000-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'Alice task still belongs to Alice');

-- ---------------------------------------------------------------------------
-- Anonymous access
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.tasks$$, '42501', null, 'anon cannot read tasks');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
reset role;

-- ---------------------------------------------------------------------------
-- Task integrity constraints
-- ---------------------------------------------------------------------------
select pg_temp.login_as('11111111-1111-1111-1111-111111111111');

select throws_ok(
  $$insert into public.tasks (title, start_date, due_date) values ('x', '2026-10-10', '2026-10-09')$$,
  '23514', null, 'due date cannot precede start date');
select lives_ok(
  $$insert into public.tasks (title, start_date, due_date) values ('x', '2026-10-10', '2026-10-10')$$,
  'due date may equal start date');
select throws_ok(
  $$insert into public.tasks (title, status, progress_percentage) values ('x', 'not_started', 10)$$,
  '23514', null, 'not started tasks must be at 0%');
select throws_ok(
  $$insert into public.tasks (title, status, progress_percentage) values ('x', 'in_progress', 100)$$,
  '23514', null, 'in progress tasks must be between 1% and 99%');
select throws_ok(
  $$insert into public.tasks (title, status, progress_percentage) values ('x', 'done', 100)$$,
  '23514', null, 'done tasks require completed_at');
select throws_ok(
  $$insert into public.tasks (title, has_jira_card, jira_url) values ('x', true, 'http://jira.local/1')$$,
  '23514', null, 'Jira URL must be https');
select throws_ok(
  $$insert into public.tasks (title, has_jira_card) values ('x', true)$$,
  '23514', null, 'Jira URL is required when a card exists');
select throws_ok(
  $$insert into public.tasks (title, has_slack_thread) values ('x', true)$$,
  '23514', null, 'Slack URL is required when a thread exists');
select throws_ok(
  $$insert into public.tasks (title) values ('   ')$$,
  '23514', null, 'blank titles are rejected');

select pg_temp.logout();

select * from finish();
rollback;
