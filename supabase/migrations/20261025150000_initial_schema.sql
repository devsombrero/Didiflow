-- DidiFlow initial schema: profiles, preferences, organization entities and tasks.
-- Row Level Security policies live in the next migration.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.task_status as enum ('not_started', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.theme_preference as enum ('system', 'light', 'dark');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and preferences (one row per auth user, created on sign-up)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme public.theme_preference not null default 'system',
  timezone text not null default 'America/Sao_Paulo',
  date_format text not null default 'dd/MM/yyyy'
    check (date_format in ('dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd')),
  notifications_enabled boolean not null default true,
  notify_due_soon boolean not null default true,
  notify_overdue boolean not null default true,
  due_soon_days smallint not null default 2 check (due_soon_days between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- pg_timezone_names is not immutable, so the timezone is validated by trigger.
create function public.validate_user_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger user_preferences_validate
  before insert or update of timezone on public.user_preferences
  for each row execute function public.validate_user_preferences();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 80));

  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Organization: projects, categories, tags
-- unique (id, owner_id) backs composite foreign keys, so a task can only
-- reference rows of its own owner.
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text check (char_length(description) <= 2000),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index projects_owner_name_key on public.projects (owner_id, lower(name));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index categories_owner_name_key on public.categories (owner_id, lower(name));

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index tags_owner_name_key on public.tags (owner_id, lower(name));

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger tags_set_updated_at
  before update on public.tags
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 10000),
  requested_at date,
  requester_name text check (char_length(requester_name) <= 120),
  has_jira_card boolean not null default false,
  jira_url text check (char_length(jira_url) <= 2048),
  has_slack_thread boolean not null default false,
  slack_thread_url text check (char_length(slack_thread_url) <= 2048),
  notes text check (char_length(notes) <= 10000),
  start_date date,
  due_date date,
  completed_at timestamptz,
  status public.task_status not null default 'not_started',
  progress_percentage smallint not null default 0 check (progress_percentage between 0 and 100),
  priority public.task_priority not null default 'medium',
  project_id uuid,
  category_id uuid,
  estimated_minutes integer check (estimated_minutes >= 0),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, owner_id),
  foreign key (project_id, owner_id)
    references public.projects (id, owner_id) on delete set null (project_id),
  foreign key (category_id, owner_id)
    references public.categories (id, owner_id) on delete set null (category_id),

  constraint tasks_jira_link_check check (
    (not has_jira_card and jira_url is null)
    or (has_jira_card and jira_url is not null and jira_url ~ '^https://[^\s]+$')
  ),
  constraint tasks_slack_link_check check (
    (not has_slack_thread and slack_thread_url is null)
    or (has_slack_thread and slack_thread_url is not null and slack_thread_url ~ '^https://[^\s]+$')
  ),
  constraint tasks_dates_check check (
    due_date is null or start_date is null or due_date >= start_date
  ),
  constraint tasks_status_progress_check check (
    (status = 'not_started' and progress_percentage = 0)
    or (status = 'in_progress' and progress_percentage between 1 and 99)
    or (status = 'done' and progress_percentage = 100)
    or status in ('blocked', 'cancelled')
  ),
  constraint tasks_completed_at_check check ((status = 'done') = (completed_at is not null))
);

create index tasks_owner_status_idx on public.tasks (owner_id, status);
create index tasks_owner_due_date_idx on public.tasks (owner_id, due_date);
create index tasks_owner_priority_idx on public.tasks (owner_id, priority);
create index tasks_owner_updated_at_idx on public.tasks (owner_id, updated_at desc);
create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_category_id_idx on public.tasks (category_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.task_tags (
  task_id uuid not null,
  tag_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, tag_id),
  foreign key (task_id, owner_id) references public.tasks (id, owner_id) on delete cascade,
  foreign key (tag_id, owner_id) references public.tags (id, owner_id) on delete cascade
);
create index task_tags_tag_id_idx on public.task_tags (tag_id);

-- ---------------------------------------------------------------------------
-- History (append-only; rows are written by triggers in later migrations)
-- ---------------------------------------------------------------------------

-- Status/progress transitions. Removed together with the task on hard delete.
create table public.task_status_history (
  id bigint generated always as identity primary key,
  task_id uuid not null,
  owner_id uuid not null,
  from_status public.task_status,
  to_status public.task_status not null,
  from_progress smallint,
  to_progress smallint not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  foreign key (task_id, owner_id) references public.tasks (id, owner_id) on delete cascade
);
create index task_status_history_task_idx on public.task_status_history (task_id, changed_at);

-- Audit log. Deliberately has no foreign key to tasks so that the deletion
-- event survives a hard delete; removed only when the user account is deleted.
create table public.task_activity_logs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  action text not null check (action in (
    'created', 'updated', 'status_changed', 'progress_changed', 'completed',
    'reopened', 'cancelled', 'archived', 'unarchived', 'deleted', 'restored'
  )),
  changes jsonb,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index task_activity_logs_task_idx on public.task_activity_logs (task_id, created_at);
create index task_activity_logs_owner_idx on public.task_activity_logs (owner_id, created_at desc);
