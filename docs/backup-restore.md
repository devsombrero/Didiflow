# Backup, exportação e restauração

## Exportações do aplicativo

Em **Configurações → Exportar dados**, o usuário gera:

| Conjunto               | Formatos  | Conteúdo                                                               |
| ---------------------- | --------- | ---------------------------------------------------------------------- |
| Tarefas                | CSV, JSON | Tarefas não excluídas com projeto, categoria, contexto e tags          |
| Projetos e organização | CSV, JSON | Projetos, categorias, tags e contextos                                 |
| Registros de tempo     | CSV, JSON | Apontamentos, no fuso horário do usuário                               |
| Indicadores            | CSV, JSON | KPIs do período escolhido, com fórmula e estado de dados insuficientes |
| Cópia completa         | JSON      | Todas as tabelas do usuário (`format: didiflow-backup`, `version: 1`)  |

Detalhes:

- Os arquivos são salvos pelo diálogo nativo do sistema (IPC `file:save`, validado no processo principal) e contêm apenas dados do próprio usuário, porque todas as consultas passam por RLS.
- Os CSVs usam UTF-8 com BOM, separador `;` (padrão do Excel em pt-BR) e quebras CRLF.
- Células que começam com `=`, `+`, `-`, `@`, tab ou CR recebem `'` no início, para impedir a execução de fórmulas (injeção de CSV).

## Exportação não é backup

As exportações servem para portabilidade e análise. Elas **não substituem** backups do PostgreSQL:

- Não incluem dados de autenticação (senhas e sessões ficam no Supabase Auth).
- São instantâneos manuais, sem garantia de consistência entre execuções e sem histórico de versões.

Backups reais:

- **Supabase em nuvem:** backups diários automáticos do plano e, se contratado, Point-in-Time Recovery (PITR).
- **Dump lógico:** `npx supabase db dump --data-only -f backup.sql` (e `--role-only` / schema conforme a necessidade), guardado fora da máquina.
- **Ambiente local:** `npx supabase stop` mantém os dados em volume Docker; `npx supabase db reset` **apaga** todos os dados locais.

## Restauração

### A partir de um dump do PostgreSQL (recomendado)

1. Restaure em um projeto/banco com as mesmas migrations aplicadas (`supabase db push` ou `db reset`).
2. Importe o dump com `psql` usando um papel administrativo, **fora do aplicativo**. A `service_role` nunca entra no app.

### A partir da cópia completa (JSON)

Ainda não existe importação pelo aplicativo. O procedimento manual é:

1. Crie (ou use) a conta de destino e anote o `id` do usuário em `auth.users`.
2. Substitua `owner_id` (e `user_id`/`id` em `profiles` e `user_preferences`) pelo id de destino.
3. Insira as tabelas respeitando as dependências:
   1. `projects`, `categories`, `tags`, `work_contexts`;
   2. `tasks`;
   3. `task_tags`, `time_entries`, `task_reminders`, `daily_priorities`, `focus_sessions`, `personal_goals`, `skill_achievements`.
4. `task_status_history` e `task_activity_logs` são gerados por triggers. Para preservar o histórico original, insira-os com um papel administrativo e com os triggers de auditoria desabilitados durante a carga.

### Conflitos

A política recomendada para uma futura importação, e para cargas manuais, é:

- **Identidade:** os registros mantêm seus UUIDs. Um registro com o mesmo `id` já existente é um conflito, e um `id` novo é sempre inserido.
- **Regra de resolução:** `insert … on conflict (id) do update` só quando o `updated_at` importado for **mais recente** que o existente (last-writer-wins). Caso contrário, o registro existente é mantido.
- **Nomes únicos:** projetos, categorias, tags e contextos têm nome único por usuário, sem diferenciar maiúsculas de minúsculas. Em conflito de nome com `id` diferente, reaproveite o registro existente e remapeie as referências das tarefas para ele.
- **Integridade:** as FKs compostas com `owner_id` rejeitam referências a registros de outro usuário. Linhas órfãs (por exemplo, `task_tags` de uma tarefa ausente) devem ser descartadas.
- **Cronômetros e sessões ativas:** só pode existir um registro em andamento por usuário (`ended_at is null`). Na importação, finalize-os ou descarte-os.
- **Histórico:** a trilha de auditoria é somente de inserção. Nunca a sobrescreva; registros duplicados são ignorados.
