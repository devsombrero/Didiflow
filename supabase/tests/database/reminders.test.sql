-- Task reminders. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

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
insert into public.task_reminders (task_id, remind_at)
  values ('b0000000-0000-0000-0000-000000000001', now());

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.tasks (id, title) values ('a0000000-0000-0000-0000-000000000001', 'Alice task');

select lives_ok(
  $$insert into public.task_reminders (task_id, remind_at, note)
    values ('a0000000-0000-0000-0000-000000000001', now() + interval '1 hour', 'Ligar para o cliente')$$,
  'reminders can be created for own tasks');
select throws_ok(
  $$insert into public.task_reminders (task_id, remind_at)
    values ('b0000000-0000-0000-0000-000000000001', now())$$,
  '23503', null, 'reminders cannot target another user task');
select is((select count(*)::int from public.task_reminders), 1, 'reminders are private');

update public.task_reminders set sent_at = now();
select is((select count(*)::int from public.task_reminders where sent_at is null), 0, 'delivery can be recorded');

reset role;
delete from public.tasks where id = 'a0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_reminders
  where task_id = 'a0000000-0000-0000-0000-000000000001'), 0, 'reminders are removed with the task');

select * from finish();
rollback;
