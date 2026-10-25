-- Animation and sound preferences: defaults, own updates and bounds.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated');

select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  $$select animations_enabled, sounds_enabled, sound_volume from public.user_preferences$$,
  $$values (true, true, 60::smallint)$$,
  'animations and sounds are on by default at volume 60');

select lives_ok($$
  update public.user_preferences
  set animations_enabled = false, sounds_enabled = false, sound_volume = 25
$$, 'the user can change the feedback preferences');

select is((select sound_volume from public.user_preferences), 25::smallint, 'the volume is saved');

select throws_ok($$update public.user_preferences set sound_volume = 101$$, '23514', null,
  'the volume stays between 0 and 100');

select * from finish();
rollback;
