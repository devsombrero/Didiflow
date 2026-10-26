-- Default categories and tags for new accounts. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local', 'authenticated', 'authenticated');

select is((select count(*)::int from public.categories
  where owner_id = '11111111-1111-1111-1111-111111111111'), 10, 'sign-up creates the default categories');
select is((select count(*)::int from public.tags
  where owner_id = '11111111-1111-1111-1111-111111111111'), 16, 'sign-up creates the default tags');
select is((select count(*)::int from public.tasks
  where owner_id = '11111111-1111-1111-1111-111111111111'), 0, 'no tasks are created');
select is((select color from public.categories
  where owner_id = '11111111-1111-1111-1111-111111111111' and name = 'Desenvolvimento'),
  '#0284c7', 'defaults come with colors');

-- Seeding again keeps renamed/existing items and never duplicates.
update public.tags set color = '#000000'
  where owner_id = '11111111-1111-1111-1111-111111111111' and name = 'bug';
select public.seed_default_organization('11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.tags
  where owner_id = '11111111-1111-1111-1111-111111111111'), 16, 'seeding is idempotent');
select is((select color from public.tags
  where owner_id = '11111111-1111-1111-1111-111111111111' and name = 'bug'),
  '#000000', 'existing items are not overwritten');

set local role authenticated;
select throws_ok(
  $$select public.seed_default_organization('11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'users cannot call the seed function directly');

select * from finish();
rollback;
