-- Personal goals and achievements. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.local', 'authenticated', 'authenticated');

create function pg_temp.login_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
insert into public.personal_goals (title, metric, target_value, start_date, end_date)
  values ('Bob goal', 'deliveries', 10, '2026-10-01', '2026-10-31');
insert into public.skill_achievements (title, kind, achieved_on) values ('Bob cert', 'certification', '2026-10-01');

select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$insert into public.personal_goals (title, metric, comparison, target_value, start_date, end_date, relevance)
    values ('Entregar no prazo', 'on_time_rate', 'at_least', 90, '2026-10-01', '2026-12-31', 'Previsibilidade')$$,
  'SMART goals can be created');
select throws_ok(
  $$insert into public.personal_goals (title, metric, target_value, start_date, end_date)
    values ('x', 'deliveries', 5, '2026-10-10', '2026-10-01')$$,
  '23514', null, 'goal end must not precede start');
select throws_ok(
  $$insert into public.personal_goals (title, metric, target_value, start_date, end_date)
    values ('x', 'late_rate', 150, '2026-10-01', '2026-10-31')$$,
  '23514', null, 'percentage targets are capped at 100');
select throws_ok(
  $$insert into public.personal_goals (title, metric, target_value, start_date, end_date)
    values ('x', 'deliveries', -1, '2026-10-01', '2026-10-31')$$,
  '23514', null, 'targets cannot be negative');

select lives_ok(
  $$insert into public.skill_achievements (title, kind, achieved_on, hours, url)
    values ('Curso de SQL', 'course', '2026-10-20', 12, 'https://cursos.example/sql')$$,
  'achievements can be recorded');
select throws_ok(
  $$insert into public.skill_achievements (title, kind, achieved_on, url)
    values ('x', 'course', '2026-10-20', 'http://insecure')$$,
  '23514', null, 'achievement links must be https');
select throws_ok(
  $$insert into public.skill_achievements (title, kind, achieved_on) values ('x', 'party', '2026-10-20')$$,
  '23514', null, 'achievement kind is controlled');

select is((select count(*)::int from public.personal_goals), 1, 'goals are private');
select is((select count(*)::int from public.skill_achievements), 1, 'achievements are private');

select * from finish();
rollback;
