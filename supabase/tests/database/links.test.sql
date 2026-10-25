-- task_links: RLS, URL validation, duplicates, limit and audit.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

create function pg_temp.login_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.task_links'::regclass),
  'RLS is enabled');

set local role authenticated;
select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.tasks (id, title) values ('a0000000-0000-0000-0000-000000000001', 'Com links');

select lives_ok($$
  insert into public.task_links (task_id, url, title)
  values ('a0000000-0000-0000-0000-000000000001', 'https://www.figma.com/file/abc', 'Protótipo')
$$, 'an https link can be added');

select throws_ok($$
  insert into public.task_links (task_id, url)
  values ('a0000000-0000-0000-0000-000000000001', 'http://inseguro.local/x')
$$, '23514', null, 'only https links are accepted');

select throws_ok($$
  insert into public.task_links (task_id, url)
  values ('a0000000-0000-0000-0000-000000000001', 'javascript:alert(1)')
$$, '23514', null, 'script URLs are rejected');

select throws_ok($$
  insert into public.task_links (task_id, url)
  values ('a0000000-0000-0000-0000-000000000001', 'https://www.figma.com/file/abc')
$$, '23505', null, 'the same link cannot be added twice to a task');

select is(
  (select changes ->> 'title' from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001' and action = 'link_added'),
  'Protótipo', 'adding a link is recorded in the activity log');

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.task_links), 0, 'another account cannot see the links');
select throws_ok($$
  insert into public.task_links (task_id, owner_id, url)
  values ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'https://x.example')
$$, '42501', null, 'another account cannot add links to the task');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.task_links (task_id, url)
  select 'a0000000-0000-0000-0000-000000000001', 'https://docs.example/' || n
    from generate_series(1, 49) n;
select throws_ok($$
  insert into public.task_links (task_id, url)
  values ('a0000000-0000-0000-0000-000000000001', 'https://docs.example/extra')
$$, '23514', 'Limite de 50 links por tarefa atingido.', 'at most 50 links per task');

delete from public.task_links where title = 'Protótipo';
select is(
  (select count(*)::int from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001' and action = 'link_removed'),
  1, 'removing a link is recorded');

select * from finish();
rollback;
