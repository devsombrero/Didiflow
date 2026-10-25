-- External resources (links) attached to a task: documents, designs, tickets...
-- Only https:// URLs are accepted (the desktop app opens nothing else).

create table public.task_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  url text not null check (
    char_length(url) <= 2048
    and url ~ '^https://[^\s/@]+\.[^\s/@]+'
    and url !~ '\s'
  ),
  title text check (char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  foreign key (task_id, owner_id) references public.tasks (id, owner_id) on delete cascade,
  unique (task_id, url)
);

create index task_links_task_idx on public.task_links (task_id, created_at);

alter table public.task_links enable row level security;

create policy "task_links: owner can read" on public.task_links
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "task_links: owner can insert" on public.task_links
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "task_links: owner can update" on public.task_links
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "task_links: owner can delete" on public.task_links
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.task_links from anon;
revoke truncate, references, trigger on public.task_links from authenticated;

-- At most 50 links per task.
create function public.limit_task_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.task_links where task_id = new.task_id) >= 50 then
    raise exception 'Limite de 50 links por tarefa atingido.'
      using errcode = '23514', hint = 'task_link_limit';
  end if;
  return new;
end;
$$;

create trigger task_links_limit
  before insert on public.task_links
  for each row execute function public.limit_task_links();

-- Audit: link events in the task activity feed.
alter table public.task_activity_logs drop constraint task_activity_logs_action_check;
alter table public.task_activity_logs add constraint task_activity_logs_action_check
  check (action in (
    'created', 'updated', 'status_changed', 'progress_changed', 'completed',
    'reopened', 'cancelled', 'archived', 'unarchived', 'deleted', 'restored',
    'attachment_added', 'attachment_removed', 'link_added', 'link_removed'
  ));

create function public.record_link_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.task_links;
begin
  if tg_op = 'INSERT' then
    row_data := new;
  else
    row_data := old;
  end if;
  -- Skip cascades from task or account deletion.
  if not exists (select 1 from public.tasks where id = row_data.task_id) then
    return null;
  end if;
  insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
  values (
    row_data.owner_id,
    row_data.task_id,
    case when tg_op = 'INSERT' then 'link_added' else 'link_removed' end,
    jsonb_build_object('title', coalesce(row_data.title, row_data.url), 'url', row_data.url),
    auth.uid()
  );
  return null;
end;
$$;

create trigger task_links_activity
  after insert or delete on public.task_links
  for each row execute function public.record_link_activity();

revoke execute on function public.limit_task_links() from public, anon;
revoke execute on function public.record_link_activity() from public, anon, authenticated;
