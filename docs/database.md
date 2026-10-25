# Modelo de dados

Implementado por migrations em `supabase/migrations/`. Este documento é atualizado junto com cada migration.

| Migration                                 | Conteúdo                                                |
| ----------------------------------------- | ------------------------------------------------------- |
| `20261025150000_initial_schema.sql`       | Enums, tabelas do MVP, constraints, índices e triggers  |
| `20261025150100_rls_policies.sql`         | RLS, políticas por dono, grants por coluna e revogações |
| `20261025160000_task_status_progress.sql` | Normalização status × progresso e histórico de status   |
| `20261025170000_task_activity_log.sql`    | Trilha de auditoria de tarefas (`task_activity_logs`)   |

Testes de banco (pgTAP) ficam em `supabase/tests/database/` e rodam com `npm run db:test`. Os tipos TypeScript são gerados com `npm run db:types`.

## Integridade entre donos

`projects`, `categories`, `tags` e `tasks` têm `unique (id, owner_id)`. As referências (`tasks.project_id`, `tasks.category_id`, `task_tags`, `task_status_history`) usam chaves estrangeiras compostas com `owner_id`. Assim, o próprio banco impede que uma tarefa aponte para um projeto, categoria ou tag de outro usuário, mesmo que RLS falhe. Ao excluir um projeto ou categoria, só a coluna correspondente da tarefa vira `null` (`on delete set null (project_id)`).

## Perfil e preferências

O trigger `on_auth_user_created` (`handle_new_user`, `security definer`) cria `profiles` e `user_preferences` no cadastro. O nome de exibição vem de `raw_user_meta_data.display_name`. O fuso horário é validado por trigger contra `pg_timezone_names`, porque essa view não é imutável e não pode entrar em um CHECK.

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

## Entidades do MVP

| Tabela                | Finalidade                                                                       |
| --------------------- | -------------------------------------------------------------------------------- |
| `profiles`            | 1:1 com `auth.users`; nome de exibição. Criado por trigger no cadastro.          |
| `user_preferences`    | Tema, fuso horário, formato de data, preferências de notificação.                |
| `projects`            | Agrupamento de tarefas.                                                          |
| `categories`          | Tipo de demanda.                                                                 |
| `tags` / `task_tags`  | Tags N:N com tarefas. Inclusão e remoção entram na auditoria.                    |
| `work_contexts`       | Contextos de trabalho (ex.: Remoto, Reunião).                                    |
| `task_requesters`     | View (`security_invoker`) com solicitantes distintos e quantidade de tarefas.    |
| `tasks`               | Demanda (campos abaixo).                                                         |
| `task_status_history` | Transições de status e progresso. Append-only.                                   |
| `task_activity_logs`  | Auditoria de criação, alteração de campos, arquivamento e exclusão. Append-only. |

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
| `in_progress` | 1–99                           |
| `blocked`     | preserva o valor atual         |
| `done`        | 100; `completed_at` preenchido |
| `cancelled`   | preserva o valor atingido      |

Ao reabrir, `completed_at` é limpo na tarefa, mas o histórico mantém o registro anterior.

O trigger `tasks_normalize_status` (BEFORE INSERT/UPDATE) aplica as regras:

- Uma mudança explícita de status prevalece e ajusta o progresso: `in_progress` vindo de 0% vai para 1%, e vindo de 100% vai para 99%.
- Uma mudança só de progresso em tarefa não iniciada, em andamento ou concluída deriva o status: 0% → não iniciada, 1–99% → em andamento, 100% → concluída. Em tarefa bloqueada ou cancelada, o status não muda.
- `completed_at` é preenchido ao concluir e limpo em qualquer outro status. Em uma tarefa já concluída, o usuário pode corrigir a data efetiva.

O trigger `tasks_record_status_history` (AFTER, `security definer`) grava cada transição de status ou progresso em `task_status_history`, com valores anteriores, novos e o usuário responsável.

### Índices

`(owner_id, status)`, `(owner_id, due_date)`, `(owner_id, priority)`, `(owner_id, updated_at desc)`, além de índices nas FKs (`project_id`, `category_id`, `task_tags.tag_id`).

## Fases posteriores

`time_entries`, `personal_goals`, `skill_achievements`, `focus_sessions` e, se necessário, `notifications`.
