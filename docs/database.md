# Modelo de dados

Implementado por migrations em `supabase/migrations/`. Este documento é atualizado junto com cada migration.

| Migration                                           | Conteúdo                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `20261025150000_initial_schema.sql`                 | Enums, tabelas do MVP, constraints, índices e triggers                              |
| `20261025150100_rls_policies.sql`                   | RLS, políticas por dono, grants por coluna e revogações                             |
| `20261025160000_task_status_progress.sql`           | Normalização status × progresso e histórico de status                               |
| `20261025170000_task_activity_log.sql`              | Trilha de auditoria de tarefas (`task_activity_logs`)                               |
| `20261025175900_activity_skip_account_deletion.sql` | Exclusão de conta com tarefas (guarda no trigger de auditoria)                      |
| `20261025180000_organization.sql`                   | Contextos de trabalho, view de solicitantes e auditoria de tags                     |
| `20261025190000_time_entries.sql`                   | Registros de tempo e ações de cronômetro no servidor                                |
| `20261025200000_goals_achievements.sql`             | Metas SMART (`personal_goals`) e desenvolvimento (`skill_achievements`)             |
| `20261025210000_task_reminders.sql`                 | Lembretes por tarefa                                                                |
| `20261025220000_focus.sql`                          | Prioridades do dia e sessões de foco (no máximo uma ativa)                          |
| `20261025230000_search_tasks.sql`                   | Busca textual (`search_tasks`: português, unaccent e prefixo)                       |
| `20261026090000_backup_restore.sql`                 | Preferências de backup e `restore_backup`                                           |
| `20261026090100_restore_backup_lint.sql`            | `restore_backup` compatível com o `plpgsql_check`                                   |
| `20261026100000_task_attachments.sql`               | Metadados de anexos, cota de 50 MB por tarefa e auditoria                           |
| `20261026110000_feedback_preferences.sql`           | Preferências de animações, sons e volume                                            |
| `20261026120000_custom_notifications.sql`           | Notificações personalizadas (agenda, som, limite de 100 por usuário)                |
| `20261026130000_task_hierarchy_progress.sql`        | Épicos/subtarefas, progresso e horas automáticos, novo fluxo de status, meta diária |
| `20261026130100_restore_task_hierarchy.sql`         | Restauração com hierarquia e meta diária                                            |
| `20261026140000_task_links.sql`                     | Links externos das tarefas (https, até 50 por tarefa) e auditoria                   |
| `20261026140100_restore_task_links.sql`             | Restauração com os links das tarefas                                                |

Testes de banco (pgTAP) ficam em `supabase/tests/database/` e rodam com `npm run db:test`. Os tipos TypeScript são gerados com `npm run db:types`.

## Integridade entre donos

`projects`, `categories`, `tags` e `tasks` têm `unique (id, owner_id)`. As referências (`tasks.project_id`, `tasks.category_id`, `task_tags`, `task_status_history`) usam chaves estrangeiras compostas com `owner_id`. Assim, o próprio banco impede que uma tarefa aponte para um projeto, categoria ou tag de outro usuário, mesmo que RLS falhe. Ao excluir um projeto ou categoria, só a coluna correspondente da tarefa vira `null` (`on delete set null (project_id)`).

## Perfil e preferências

O trigger `on_auth_user_created` (`handle_new_user`, `security definer`) cria `profiles` e `user_preferences` no cadastro. O nome de exibição vem de `raw_user_meta_data.display_name`. O fuso horário é validado por trigger contra `pg_timezone_names`, porque essa view não é imutável e não pode entrar em um CHECK.

## Organização padrão

O trigger `on_auth_user_created_organization` chama `seed_default_organization(owner)` (`security definer`, sem permissão de execução para usuários) e cria 10 categorias e 16 tags com cores para cada nova conta, sem tarefas. A função usa `on conflict (owner_id, lower(name)) do nothing`: nunca duplica nem altera itens que a conta já tem. A migration `20261026150000_default_organization` também preencheu as contas existentes.

## Política de retenção do histórico

- O padrão é exclusão lógica (`deleted_at`) e arquivamento (`archived_at`): o histórico fica intacto.
- `task_status_history` é removido junto com a tarefa em exclusão definitiva (`on delete cascade`).
- `task_activity_logs` **não** tem FK para `tasks`, então o evento de exclusão sobrevive à exclusão definitiva. Ele só é removido quando a conta do usuário é excluída.
- Nenhum usuário consegue inserir, alterar ou apagar histórico: não há políticas nem grants de escrita. A escrita acontece só por triggers `security definer`:
  - `tasks_record_status_history` grava em `task_status_history`;
  - `tasks_record_activity` grava em `task_activity_logs` os eventos `created`, `updated` (com valores anteriores e novos por campo), `status_changed`, `progress_changed`, `completed`, `reopened`, `cancelled`, `archived`, `unarchived`, `deleted` e `restored`.

## Convenções

- Chaves primárias `uuid` com `gen_random_uuid()`.
- `owner_id uuid not null references auth.users(id) on delete cascade` em toda tabela privada.
- `created_at` e `updated_at` (`timestamptz`, `updated_at` mantido por trigger).
- Datas de calendário (início, vencimento, solicitação) como `date`; eventos (conclusão, logs) como `timestamptz`.
- Exclusão lógica (`deleted_at`) e arquivamento (`archived_at`) em `tasks`.

## Enums

- `task_status`: `not_started`, `in_progress`, `blocked`, `done`, `cancelled`.
- `task_priority`: `low`, `medium`, `high`, `urgent`.

## Entidades

| Tabela                 | Finalidade                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`             | 1:1 com `auth.users`; nome de exibição. Criado por trigger no cadastro.                                                                                         |
| `user_preferences`     | Tema, fuso horário, formato de data, preferências de notificação.                                                                                               |
| `projects`             | Agrupamento de tarefas.                                                                                                                                         |
| `categories`           | Tipo de demanda.                                                                                                                                                |
| `tags` / `task_tags`   | Tags N:N com tarefas. Inclusão e remoção entram na auditoria.                                                                                                   |
| `work_contexts`        | Contextos de trabalho (ex.: Remoto, Reunião).                                                                                                                   |
| `task_requesters`      | View (`security_invoker`) com solicitantes distintos e quantidade de tarefas.                                                                                   |
| `time_entries`         | Registros de tempo (manuais e cronômetro).                                                                                                                      |
| `personal_goals`       | Metas SMART.                                                                                                                                                    |
| `skill_achievements`   | Cursos, certificações e habilidades.                                                                                                                            |
| `task_reminders`       | Lembretes por tarefa.                                                                                                                                           |
| `custom_notifications` | Avisos criados pelo usuário: agenda (`once`, `daily`, `weekdays`, `weekly`, `interval` com janela opcional), som, ativo e `last_fired_at`. Até 100 por usuário. |
| `task_links`           | Recursos externos da tarefa: URL `https://` (CHECK), título opcional, único por tarefa, até 50. Inclusão e remoção entram na auditoria.                         |
| `task_attachments`     | Metadados dos anexos (nome, tipo, tamanho, SHA-256). Os arquivos ficam no computador do usuário.                                                                |
| `daily_priorities`     | Lista ordenada de prioridades por dia.                                                                                                                          |
| `focus_sessions`       | Sessões de foco registradas.                                                                                                                                    |
| `tasks`                | Demanda (campos abaixo).                                                                                                                                        |
| `task_status_history`  | Transições de status e progresso. Append-only.                                                                                                                  |
| `task_activity_logs`   | Auditoria de criação, alteração de campos, arquivamento e exclusão. Append-only.                                                                                |

### `tasks`

| Coluna                                  | Tipo           | Regra                                            |
| --------------------------------------- | -------------- | ------------------------------------------------ |
| `id`                                    | uuid           | PK                                               |
| `owner_id`                              | uuid           | FK `auth.users`                                  |
| `title`                                 | text           | obrigatório, 1–200 caracteres                    |
| `description`                           | text           | opcional                                         |
| `requested_at`                          | date           | data da solicitação; independe de `created_at`   |
| `requester_name`                        | text           | pessoa solicitante                               |
| `has_jira_card` / `jira_url`            | boolean / text | URL obrigatória e `https` quando `has_jira_card` |
| `has_slack_thread` / `slack_thread_url` | boolean / text | idem para Slack                                  |
| `notes`                                 | text           | observações                                      |
| `start_date`                            | date           |                                                  |
| `due_date`                              | date           | `due_date >= start_date` quando ambos existem    |
| `completed_at`                          | timestamptz    | preenchido ao concluir                           |
| `status`                                | task_status    | padrão `not_started`                             |
| `progress_percentage`                   | smallint       | 0–100, consistente com o status                  |
| `priority`                              | task_priority  | padrão `medium`                                  |
| `project_id`                            | uuid           | FK `projects`, `on delete set null`              |
| `category_id`                           | uuid           | FK `categories`, `on delete set null`            |
| `estimated_minutes`                     | integer        | ≥ 0, opcional                                    |
| `archived_at` / `deleted_at`            | timestamptz    | arquivamento / exclusão lógica                   |
| `created_at` / `updated_at`             | timestamptz    |                                                  |

O tempo efetivamente dedicado vem de `time_entries` (fase posterior), não de uma coluna editável.

### Consistência status × progresso

Imposta por CHECK constraint e trigger:

| Status        | Progresso                      |
| ------------- | ------------------------------ |
| `not_started` | 0                              |
| `in_progress` | 0–99                           |
| `blocked`     | preserva o valor atual         |
| `done`        | 100; `completed_at` preenchido |
| `cancelled`   | preserva o valor atingido      |

Ao reabrir, `completed_at` é limpo na tarefa, mas o histórico mantém o registro anterior.

O trigger `tasks_normalize_status` (BEFORE INSERT/UPDATE) aplica as regras:

- Uma mudança explícita de status prevalece e ajusta o progresso: iniciar (`in_progress`) mantém 0%; vindo de 100%, vai para 99%.
- Uma mudança só de progresso deriva o status: em tarefa não iniciada, acima de 0% → em andamento; 100% → concluída; abaixo de 100% em tarefa concluída → em andamento. Uma tarefa em andamento continua em andamento em 0%. Em tarefa bloqueada ou cancelada, o status não muda.
- Em tarefa com filhos ativos (não excluídos nem cancelados), o progresso vem deles: edições manuais de progresso são substituídas pelo cálculo; mudanças explícitas de status continuam valendo.
- `completed_at` é preenchido ao concluir e limpo em qualquer outro status. Em uma tarefa já concluída, o usuário pode corrigir a data efetiva.

O trigger `tasks_record_status_history` (AFTER, `security definer`) grava cada transição de status ou progresso em `task_status_history`, com valores anteriores, novos e o usuário responsável.

### Épicos e subtarefas

- `kind` (`epic` | `task`) e `parent_id` (FK composta com o dono, `on delete set null (parent_id)`) formam a hierarquia épico › tarefa › subtarefa.
- O trigger `tasks_validate_parent` garante: épicos só no nível principal, no máximo três níveis e nenhum ciclo (erro `23514`, `hint = task_hierarchy`).
- `task_children_progress(id)` calcula o progresso dos filhos ativos: média ponderada pela estimativa quando todos têm estimativa; caso contrário, média simples.
- O trigger `tasks_rollup_parents` recalcula o pai a cada mudança de progresso, status, pai, estimativa ou exclusão de um filho. O avô acompanha, porque o pai também dispara o trigger.

### Horas

- `task_time_rollup(id)` (security invoker) devolve as horas da tarefa, da subárvore e de hoje, as estimativas e a contagem de filhos (total e concluídos).
- `daily_hours(de, até, tarefa?)` devolve os segundos por dia no fuso do usuário. Registros que passam da meia-noite são divididos entre os dias, e as pausas são distribuídas proporcionalmente.
- `user_preferences.daily_hours_target` (0,5–24, padrão 8) é a meta de horas por dia.

### Índices

`(owner_id, status)`, `(owner_id, due_date)`, `(owner_id, priority)`, `(owner_id, updated_at desc)`, além de índices nas FKs (`project_id`, `category_id`, `task_tags.tag_id`).

## Anexos

`task_attachments` guarda só metadados; o conteúdo dos arquivos nunca vai para o banco:

- Cada linha pertence à tarefa do mesmo dono (FK composta, `on delete cascade`).
- Os metadados são imutáveis: não há `update` (para trocar um arquivo, remova e anexe de novo).
- Cota de **50 MB por tarefa** (soma de `size_bytes`), aplicada pelo trigger `task_attachments_quota` com lock na linha da tarefa. Assim, inserções simultâneas não ultrapassam o limite. O erro usa o código `23514` com `hint = attachment_quota`.
- Inclusão e remoção geram `attachment_added` e `attachment_removed` em `task_activity_logs` (nome e tamanho). Remoções em cascata, por exclusão definitiva da tarefa ou da conta, não são registradas.

## Registro de tempo

`time_entries` guarda apontamentos manuais (`source = manual`) e de cronômetro (`timer`):

- `duration_seconds` é calculado por trigger: `ended_at − started_at − paused_seconds`. Fica nulo enquanto o registro está em andamento.
- Um índice único parcial (`owner_id where ended_at is null`) garante no máximo um cronômetro ativo por usuário.
- Cada registro tem no máximo 24 horas, `ended_at >= started_at`, e a tarefa associada precisa ser do mesmo dono (FK composta, `on delete set null`).
- As RPCs `start_timer`, `pause_timer`, `resume_timer` e `stop_timer` (security invoker) usam `now()` do servidor. Assim o cronômetro não depende de a janela continuar aberta, nem do relógio local.
