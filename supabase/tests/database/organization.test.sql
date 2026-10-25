-- Work contexts, requesters view and tag audit. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

create function pg_temp.login_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- Bob's context
select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
insert into public.work_contexts (id, name) values ('b0000000-0000-0000-0000-000000000001', 'Bob ctx');
insert into public.tasks (title, requester_name) values ('Bob task', 'Carlos');

-- Alice
select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.work_contexts (id, name) values ('a0000000-0000-0000-0000-0000000000c1', 'Remoto');
insert into public.tags (id, name) values ('a0000000-0000-0000-0000-0000000000a1', 'cliente-x');
insert into public.tasks (id, title, requester_name, context_id) values
  ('a0000000-0000-0000-0000-000000000001', 'T1', 'Ana', 'a0000000-0000-0000-0000-0000000000c1'),
  ('a0000000-0000-0000-0000-000000000002', 'T2', 'Ana', null),
  ('a0000000-0000-0000-0000-000000000003', 'T3', 'Bruno', null);

select is((select count(*)::int from public.work_contexts), 1, 'contexts are private');
select throws_ok(
  $$insert into public.work_contexts (name) values ('remoto')$$,
  '23505', null, 'context names are unique per user, case-insensitively');
select throws_ok(
  $$update public.tasks set context_id = 'b0000000-0000-0000-0000-000000000001'
    where id = 'a0000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'tasks cannot reference another user context');

select results_eq(
  'select name, task_count from public.task_requesters order by name',
  $$values ('Ana'::text, 2), ('Bruno'::text, 1)$$,
  'requesters list only the user''s own names with counts');

update public.tasks set deleted_at = now() where id = 'a0000000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.task_requesters where name = 'Bruno'), 0,
  'deleted tasks do not count as requesters');

delete from public.work_contexts where id = 'a0000000-0000-0000-0000-0000000000c1';
select is(
  (select context_id from public.tasks where id = 'a0000000-0000-0000-0000-000000000001'),
  null, 'deleting a context only clears it on tasks');

insert into public.task_tags (task_id, tag_id)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1');
select is(
  (select changes from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001' and changes ? 'tags'),
  '{"tags": {"old": null, "new": "cliente-x"}}'::jsonb, 'adding a tag is audited');

delete from public.task_tags where task_id = 'a0000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001'
      and changes -> 'tags' ->> 'old' = 'cliente-x'),
  1, 'removing a tag is audited');

select throws_ok($$truncate public.work_contexts$$, '42501', null, 'contexts cannot be truncated');

reset role;
set local role anon;
select throws_ok($$select * from public.task_requesters$$, '42501', null, 'anon cannot read requesters');
reset role;

insert into public.task_tags (task_id, tag_id, owner_id)
  values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1',
          '11111111-1111-1111-1111-111111111111');
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.task_activity_logs
  where owner_id = '11111111-1111-1111-1111-111111111111'), 0,
  'account deletion with tagged tasks succeeds and removes the trail');

select * from finish();
rollback;
