-- Global task search: accent-insensitive Portuguese full-text search with
-- prefix matching over title, requester, project, tags, description and notes.
-- security invoker: RLS limits results to the caller's tasks.

create extension if not exists unaccent with schema extensions;

create function public.search_tasks(
  p_query text,
  p_limit integer default 30,
  p_include_archived boolean default false
)
returns table (
  id uuid,
  title text,
  status public.task_status,
  priority public.task_priority,
  due_date date,
  requester_name text,
  project_name text,
  tag_names text[],
  description text,
  notes text,
  archived_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with terms as (
    select word
      from regexp_split_to_table(lower(extensions.unaccent(left(coalesce(p_query, ''), 200))), '[^[:alnum:]]+') as word
     where word <> ''
     limit 8
  ),
  q as (
    select to_tsquery('portuguese', string_agg(word || ':*', ' & ')) as query
      from terms
    having count(*) > 0
  ),
  docs as (
    select t.id, t.title, t.status, t.priority, t.due_date, t.requester_name,
           t.description, t.notes, t.archived_at, t.updated_at,
           p.name as project_name,
           coalesce(
             (select array_agg(tg.name order by tg.name)
                from public.task_tags tt
                join public.tags tg on tg.id = tt.tag_id
               where tt.task_id = t.id),
             '{}'
           ) as tag_names
      from public.tasks t
      left join public.projects p on p.id = t.project_id
     where t.deleted_at is null
       and (p_include_archived or t.archived_at is null)
  ),
  vectors as (
    select d.*,
           setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(d.title, ''))), 'A')
           || setweight(to_tsvector('portuguese', extensions.unaccent(
                concat_ws(' ', d.requester_name, d.project_name, array_to_string(d.tag_names, ' ')))), 'B')
           || setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(d.description, ''))), 'C')
           || setweight(to_tsvector('portuguese', extensions.unaccent(coalesce(d.notes, ''))), 'D')
           as document
      from docs d
  )
  select v.id, v.title, v.status, v.priority, v.due_date, v.requester_name, v.project_name,
         v.tag_names, left(v.description, 2000), left(v.notes, 2000), v.archived_at,
         ts_rank(v.document, q.query) as rank
    from vectors v
    cross join q
   where v.document @@ q.query
   order by rank desc, v.updated_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke execute on function public.search_tasks(text, integer, boolean) from public, anon;
grant execute on function public.search_tasks(text, integer, boolean) to authenticated;
