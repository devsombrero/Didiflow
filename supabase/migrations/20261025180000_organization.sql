-- Work contexts, requester listing and tag audit entries.

-- ---------------------------------------------------------------------------
-- Work contexts (e.g. "Remoto", "Reunião", "Foco profundo")
-- ---------------------------------------------------------------------------
create table public.work_contexts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index work_contexts_owner_name_key on public.work_contexts (owner_id, lower(name));

create trigger work_contexts_set_updated_at
  before update on public.work_contexts
  for each row execute function public.set_updated_at();

alter table public.tasks
  add column context_id uuid,
  add foreign key (context_id, owner_id)
    references public.work_contexts (id, owner_id) on delete set null (context_id);
create index tasks_context_id_idx on public.tasks (context_id);

alter table public.work_contexts enable row level security;

create policy "work_contexts: owner can read" on public.work_contexts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "work_contexts: owner can insert" on public.work_contexts
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "work_contexts: owner can update" on public.work_contexts
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "work_contexts: owner can delete" on public.work_contexts
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.work_contexts from anon;
revoke truncate, references, trigger on public.work_contexts from authenticated;

-- ---------------------------------------------------------------------------
-- Requesters: distinct requester names with usage, scoped by RLS on tasks.
-- ---------------------------------------------------------------------------
create view public.task_requesters
with (security_invoker = true) as
  select owner_id,
         requester_name as name,
         count(*)::int as task_count,
         max(updated_at) as last_used_at
    from public.tasks
   where requester_name is not null and deleted_at is null
   group by owner_id, requester_name;

revoke all on public.task_requesters from anon;
grant select on public.task_requesters to authenticated;

-- ---------------------------------------------------------------------------
-- Tag changes in the audit trail (task_tags is a separate table).
-- ---------------------------------------------------------------------------
create function public.record_task_tag_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.task_tags := coalesce(new, old);
  tag_name text;
begin
  -- Skip when the owner is being removed (account deletion cascade).
  if not exists (select 1 from auth.users where id = row_data.owner_id) then
    return null;
  end if;

  select name into tag_name from public.tags where id = row_data.tag_id;

  insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
  values (
    row_data.owner_id,
    row_data.task_id,
    'updated',
    jsonb_build_object('tags', jsonb_build_object(
      'old', case when tg_op = 'DELETE' then to_jsonb(tag_name) end,
      'new', case when tg_op = 'INSERT' then to_jsonb(tag_name) end)),
    auth.uid()
  );
  return null;
end;
$$;

create trigger task_tags_record_activity
  after insert or delete on public.task_tags
  for each row execute function public.record_task_tag_activity();

revoke execute on function public.record_task_tag_activity() from public, anon;
