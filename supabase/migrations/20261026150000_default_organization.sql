-- Default categories and tags for every account (no tasks): new accounts get
-- them on sign-up and existing accounts receive the ones they do not have yet.
-- Names already used by the account (case-insensitive) are kept untouched.

create function public.seed_default_organization(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.categories (owner_id, name, color)
  select p_owner, name, color
  from (values
    ('Desenvolvimento', '#0284c7'),
    ('Análise', '#0ea5e9'),
    ('Design', '#a855f7'),
    ('Reunião', '#8b5cf6'),
    ('Suporte', '#ef4444'),
    ('Documentação', '#64748b'),
    ('Testes e QA', '#14b8a6'),
    ('Infraestrutura', '#f97316'),
    ('Planejamento', '#22c55e'),
    ('Pesquisa', '#eab308')
  ) as defaults (name, color)
  on conflict (owner_id, lower(name)) do nothing;

  insert into public.tags (owner_id, name, color)
  select p_owner, name, color
  from (values
    ('urgente', '#dc2626'),
    ('bug', '#ef4444'),
    ('melhoria', '#22c55e'),
    ('nova-funcionalidade', '#0284c7'),
    ('frontend', '#3b82f6'),
    ('backend', '#16a34a'),
    ('mobile', '#06b6d4'),
    ('banco-de-dados', '#f59e0b'),
    ('segurança', '#b91c1c'),
    ('desempenho', '#f97316'),
    ('cliente', '#eab308'),
    ('interno', '#64748b'),
    ('bloqueio-externo', '#9333ea'),
    ('aguardando-retorno', '#a855f7'),
    ('documentação', '#475569'),
    ('dívida-técnica', '#78716c')
  ) as defaults (name, color)
  on conflict (owner_id, lower(name)) do nothing;
end;
$$;

-- Only the sign-up trigger and this migration call it.
revoke execute on function public.seed_default_organization(uuid) from public, anon, authenticated;

create function public.handle_new_user_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_default_organization(new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user_organization() from public, anon, authenticated;

create trigger on_auth_user_created_organization
  after insert on auth.users
  for each row execute function public.handle_new_user_organization();

-- Existing accounts.
select public.seed_default_organization(id) from auth.users;
