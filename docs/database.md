# Modelo de dados

Proposta inicial. A implementação acontece por migrations em `supabase/migrations/`, a partir da branch `feature/supabase-auth`. Este documento é atualizado junto com cada migration.

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
| `tags` / `task_tags`  | Tags N:N com tarefas.                                                            |
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

### Índices

`(owner_id, status)`, `(owner_id, due_date)`, `(owner_id, priority)`, `(owner_id, updated_at desc)`, além de índices nas FKs (`project_id`, `category_id`, `task_tags.tag_id`).

## Fases posteriores

`time_entries`, `personal_goals`, `skill_achievements`, `focus_sessions` e, se necessário, `notifications`.
