-- Row Level Security: every private row is visible and writable only by its
-- owner. History tables are read-only for users.

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.projects enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.task_tags enable row level security;
alter table public.task_status_history enable row level security;
alter table public.task_activity_logs enable row level security;

-- Anonymous clients never touch application data.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;

-- Supabase grants every table privilege to authenticated by default.
-- TRUNCATE bypasses RLS, and REFERENCES/TRIGGER are never needed by clients.
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- Profiles and preferences: rows are created by handle_new_user(); users can
-- read and update only their own row, and only the editable columns.
-- ---------------------------------------------------------------------------
create policy "profiles: owner can read"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "user_preferences: owner can read"
  on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_preferences: owner can update"
  on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke insert, update, delete on public.user_preferences from authenticated;
grant update (
  theme, timezone, date_format, notifications_enabled, notify_due_soon, notify_overdue, due_soon_days
) on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- Owned entities: full CRUD restricted to owner_id = auth.uid()
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['projects', 'categories', 'tags', 'tasks', 'task_tags'] loop
    execute format(
      'create policy "%1$s: owner can read" on public.%1$I for select to authenticated
         using (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated
         with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can update" on public.%1$I for update to authenticated
         using (owner_id = (select auth.uid()))
         with check (owner_id = (select auth.uid()))', t);
    execute format(
      'create policy "%1$s: owner can delete" on public.%1$I for delete to authenticated
         using (owner_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- History: read-only for the owner. No insert/update/delete policies or
-- grants, so only security-definer triggers can write.
-- ---------------------------------------------------------------------------
create policy "task_status_history: owner can read"
  on public.task_status_history for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "task_activity_logs: owner can read"
  on public.task_activity_logs for select to authenticated
  using (owner_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.task_status_history from authenticated;
revoke insert, update, delete, truncate on public.task_activity_logs from authenticated;
