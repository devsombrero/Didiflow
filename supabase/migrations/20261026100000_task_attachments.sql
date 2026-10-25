-- Task attachments. The files live on the user's computer (desktop app data
-- folder); the database keeps only metadata, so it never stores file bytes.
-- Each task may hold at most 50 MB of attachments in total.

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text check (char_length(mime_type) <= 255),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (task_id, owner_id) references public.tasks (id, owner_id) on delete cascade
);

create index task_attachments_task_idx on public.task_attachments (task_id, created_at);
create index task_attachments_owner_idx on public.task_attachments (owner_id);

alter table public.task_attachments enable row level security;

create policy "task_attachments: owner can read" on public.task_attachments
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "task_attachments: owner can insert" on public.task_attachments
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "task_attachments: owner can delete" on public.task_attachments
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Metadata is immutable: replace a file by removing and adding it again.
revoke all on public.task_attachments from anon;
revoke update, truncate, references, trigger on public.task_attachments from authenticated;

-- Per-task quota, checked under a lock on the task row so concurrent inserts
-- cannot exceed it together.
create function public.enforce_task_attachment_quota()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  used bigint;
begin
  perform 1 from public.tasks where id = new.task_id for update;
  select coalesce(sum(size_bytes), 0) into used
    from public.task_attachments where task_id = new.task_id;
  if used + new.size_bytes > 52428800 then
    raise exception 'Os anexos desta tarefa ultrapassariam o limite de 50 MB.'
      using errcode = '23514', hint = 'attachment_quota';
  end if;
  return new;
end;
$$;

create trigger task_attachments_quota
  before insert on public.task_attachments
  for each row execute function public.enforce_task_attachment_quota();

-- Audit: attachment events appear in the task activity feed.
alter table public.task_activity_logs drop constraint task_activity_logs_action_check;
alter table public.task_activity_logs add constraint task_activity_logs_action_check
  check (action in (
    'created', 'updated', 'status_changed', 'progress_changed', 'completed',
    'reopened', 'cancelled', 'archived', 'unarchived', 'deleted', 'restored',
    'attachment_added', 'attachment_removed'
  ));

create function public.record_attachment_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data public.task_attachments;
begin
  if tg_op = 'INSERT' then
    row_data := new;
  else
    row_data := old;
  end if;

  -- Skip cascades from task or account deletion: the task is already gone.
  if not exists (select 1 from public.tasks where id = row_data.task_id) then
    return null;
  end if;

  insert into public.task_activity_logs (owner_id, task_id, action, changes, actor_id)
  values (
    row_data.owner_id,
    row_data.task_id,
    case when tg_op = 'INSERT' then 'attachment_added' else 'attachment_removed' end,
    jsonb_build_object('file_name', row_data.file_name, 'size_bytes', row_data.size_bytes),
    auth.uid()
  );
  return null;
end;
$$;

revoke execute on function public.record_attachment_activity() from public, anon, authenticated;
revoke execute on function public.enforce_task_attachment_quota() from public, anon;

create trigger task_attachments_activity
  after insert or delete on public.task_attachments
  for each row execute function public.record_attachment_activity();
