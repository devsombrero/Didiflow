-- Global search. Run with: npm run db:test
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

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
insert into public.tasks (title) values ('Relatório secreto do Bob');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
insert into public.projects (id, name) values ('a0000000-0000-0000-0000-0000000000b1', 'Portal Cliente');
insert into public.tags (id, name) values ('a0000000-0000-0000-0000-0000000000f1', 'financeiro');
insert into public.tasks (id, title, description, requester_name, notes, project_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Relatório mensal de vendas', 'Consolidar números', 'Mariana', null,
   'a0000000-0000-0000-0000-0000000000b1'),
  ('a0000000-0000-0000-0000-000000000002', 'Ajustar ETL', 'Corrigir relatório de erros', null, 'Ver logs da integração', null),
  ('a0000000-0000-0000-0000-000000000003', 'Revisão de contrato', null, null, null, null);
insert into public.task_tags (task_id, tag_id)
  values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000f1');
insert into public.tasks (title, deleted_at) values ('Relatório excluído', now());
insert into public.tasks (title, archived_at) values ('Relatório arquivado', now());

select results_eq(
  $$select title from public.search_tasks('relatorio')$$,
  $$values ('Relatório mensal de vendas'::text), ('Ajustar ETL'::text)$$,
  'accent-insensitive match, title ranked above description');
select is((select count(*)::int from public.search_tasks('relat')), 2, 'prefix matching while typing');
select is((select title from public.search_tasks('mariana')), 'Relatório mensal de vendas', 'searches the requester');
select is((select title from public.search_tasks('portal')), 'Relatório mensal de vendas', 'searches the project name');
select is((select title from public.search_tasks('financeiro')), 'Revisão de contrato', 'searches tags');
select is((select title from public.search_tasks('integração')), 'Ajustar ETL', 'searches notes');
select is((select count(*)::int from public.search_tasks('relatorio vendas')), 1, 'all terms must match');
select is((select count(*)::int from public.search_tasks('relatorio', 30, true)), 3,
  'archived tasks only when requested; deleted never');
select is((select count(*)::int from public.search_tasks('bob')), 0, 'other users'' tasks are never returned');
select is((select count(*)::int from public.search_tasks(''':*&|!()  ')), 0, 'operator characters are ignored safely');

reset role;
set local role anon;
select throws_ok($$select * from public.search_tasks('x')$$, '42501', null, 'anon cannot search');

select * from finish();
rollback;
