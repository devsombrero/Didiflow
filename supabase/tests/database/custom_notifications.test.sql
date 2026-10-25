-- custom_notifications: RLS, schedule validation and per-user limit.
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

select ok((select relrowsecurity from pg_class where oid = 'public.custom_notifications'::regclass),
  'RLS is enabled');

set local role authenticated;
select pg_temp.login_as('11111111-1111-1111-1111-111111111111');

select lives_ok($$
  insert into public.custom_notifications (title, schedule, time_of_day)
  values ('Planejar o dia', 'weekdays', '09:00')
$$, 'a weekday notification can be created');

select lives_ok($$
  insert into public.custom_notifications (title, message, schedule, interval_minutes, window_start, window_end, sound)
  values ('Beber água', 'Pausa rápida', 'interval', 60, '09:00', '18:00', 'chime')
$$, 'an interval notification with active hours can be created');

select throws_ok($$
  insert into public.custom_notifications (title, schedule) values ('Sem horário', 'daily')
$$, '23514', null, 'recurring notifications need a time');

select throws_ok($$
  insert into public.custom_notifications (title, schedule, time_of_day, weekdays)
  values ('Dia inválido', 'weekly', '10:00', array[7]::smallint[])
$$, '23514', null, 'weekdays must be between 0 and 6');

select throws_ok($$
  insert into public.custom_notifications (title, schedule, interval_minutes)
  values ('Rápido demais', 'interval', 5)
$$, '23514', null, 'intervals are at least 15 minutes');

select throws_ok($$
  insert into public.custom_notifications (title, schedule, interval_minutes, window_start, window_end)
  values ('Janela invertida', 'interval', 30, '18:00', '09:00')
$$, '23514', null, 'the active window must start before it ends');

select pg_temp.login_as('22222222-2222-2222-2222-222222222222');
select is((select count(*)::int from public.custom_notifications), 0,
  'another account cannot see the notifications');
update public.custom_notifications set active = false;
select pg_temp.login_as('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.custom_notifications where active), 2,
  'another account cannot change the notifications');

insert into public.custom_notifications (title, schedule, time_of_day)
  select 'Extra ' || n, 'daily', '08:00' from generate_series(1, 98) n;
select throws_ok($$
  insert into public.custom_notifications (title, schedule, time_of_day)
  values ('Excesso', 'daily', '08:00')
$$, '23514', 'Limite de 100 notificações personalizadas atingido.', 'each user has at most 100 rules');

select * from finish();
rollback;
