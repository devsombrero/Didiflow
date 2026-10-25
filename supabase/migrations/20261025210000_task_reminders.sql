-- Per-task reminders. Delivered by the desktop app while it is open; sent_at
-- records delivery so a reminder is shown once.

create table public.task_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  remind_at timestamptz not null,
  note text check (char_length(note) <= 200),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (task_id, owner_id) references public.tasks (id, owner_id) on delete cascade
);

create index task_reminders_pending_idx on public.task_reminders (owner_id, remind_at)
  where sent_at is null;
create index task_reminders_task_idx on public.task_reminders (task_id);

alter table public.task_reminders enable row level security;

create policy "task_reminders: owner can read" on public.task_reminders
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "task_reminders: owner can insert" on public.task_reminders
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "task_reminders: owner can update" on public.task_reminders
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "task_reminders: owner can delete" on public.task_reminders
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.task_reminders from anon;
revoke truncate, references, trigger on public.task_reminders from authenticated;
