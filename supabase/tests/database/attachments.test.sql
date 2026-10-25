-- task_attachments: RLS, 50 MB quota per task, immutability and audit.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

create function pg_temp.login_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.task_attachments'::regclass),
  'RLS is enabled on task_attachments');

set local role authenticated;
select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.tasks (id, title) values
  ('a0000000-0000-0000-0000-000000000001', 'Com anexos'),
  ('a0000000-0000-0000-0000-000000000002', 'Outra tarefa');

select lives_ok($$
  insert into public.task_attachments (id, task_id, file_name, mime_type, size_bytes, sha256)
  values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
    'contrato.pdf', 'application/pdf', 10485760, repeat('a', 64))
$$, 'an attachment can be added to an own task');

select throws_ok($$
  insert into public.task_attachments (task_id, file_name, size_bytes, sha256)
  values ('a0000000-0000-0000-0000-000000000001', 'grande.zip', 45000000, repeat('b', 64))
$$, '23514', 'Os anexos desta tarefa ultrapassariam o limite de 50 MB.',
  'the 50 MB total per task is enforced');

select lives_ok($$
  insert into public.task_attachments (task_id, file_name, size_bytes, sha256)
  values ('a0000000-0000-0000-0000-000000000001', 'exato.bin', 41943040, repeat('c', 64))
$$, 'attachments may fill the quota exactly');

select lives_ok($$
  insert into public.task_attachments (task_id, file_name, size_bytes, sha256)
  values ('a0000000-0000-0000-0000-000000000002', 'outra.txt', 1000, repeat('d', 64))
$$, 'the quota is per task');

select throws_ok($$
  insert into public.task_attachments (task_id, file_name, size_bytes, sha256)
  values ('a0000000-0000-0000-0000-000000000002', 'enorme.iso', 60000000, repeat('e', 64))
$$, '23514', null, 'a single file above 50 MB is rejected');

select throws_ok($$
  insert into public.task_attachments (task_id, file_name, size_bytes, sha256)
  values ('a0000000-0000-0000-0000-000000000002', 'x.txt', 10, 'not-a-hash')
$$, '23514', null, 'the checksum must be a sha256 hex digest');

select throws_ok($$
  update public.task_attachments set file_name = 'renomeado.pdf'
  where id = 'b0000000-0000-0000-0000-000000000001'
$$, '42501', null, 'attachment metadata cannot be updated');

select is(
  (select count(*)::int from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001' and action = 'attachment_added'),
  2, 'adding attachments is recorded in the activity log');

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.task_attachments), 0,
  'another account cannot see the attachments');
select throws_ok($$
  insert into public.task_attachments (task_id, owner_id, file_name, size_bytes, sha256)
  values ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
    'intruso.txt', 10, repeat('f', 64))
$$, '42501', null, 'another account cannot attach files to the task');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
delete from public.task_attachments where id = 'b0000000-0000-0000-0000-000000000001';
select is(
  (select changes->>'file_name' from public.task_activity_logs
    where task_id = 'a0000000-0000-0000-0000-000000000001' and action = 'attachment_removed'),
  'contrato.pdf', 'removing an attachment is recorded with its file name');

delete from public.tasks where id = 'a0000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.task_attachments
  where task_id = 'a0000000-0000-0000-0000-000000000002'), 0,
  'deleting a task removes its attachment metadata');
select is((select count(*)::int from public.task_activity_logs
  where task_id = 'a0000000-0000-0000-0000-000000000002' and action = 'attachment_removed'), 0,
  'cascaded removals are not logged as attachment events');

select * from finish();
rollback;
