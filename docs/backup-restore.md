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

## Backups locais (aplicativo desktop)

Em **Backup e restauração** (menu da conta):

- **Automáticos:** criados enquanto o app está aberto (ao iniciar e a cada hora, quando o intervalo configurado venceu: de 6 horas a semanal). A retenção mantém os últimos N automáticos (padrão 10).
- **Manuais:** botão "Fazer backup agora". Nunca são apagados pela retenção.
- **De segurança:** criados automaticamente antes de qualquer restauração.

Os arquivos ficam em `%APPDATA%didiflowackups`, no formato `didiflow-backup-<AAAAMMDDTHHMMSSZ>-<auto|manual|prerestore>.json`, com o mesmo conteúdo da cópia completa. O processo principal só lista, lê ou apaga arquivos com esse padrão de nome (IPC validado), e o renderer nunca acessa o sistema de arquivos.

## Restauração pelo aplicativo

A partir de um backup local ou de um arquivo (`Restaurar de um arquivo…`):

1. O arquivo é validado (`format: didiflow-backup`, `version: 1`) e o app mostra uma prévia com a quantidade de registros por tipo.
2. O usuário escolhe o modo:
   - **Mesclar** (recomendado): mantém os dados atuais e adiciona o que falta.
   - **Substituir**: apaga tarefas, organização, tempo, metas, lembretes, prioridades e sessões de foco atuais, e restaura o conteúdo do backup.
3. No desktop, um backup de segurança é salvo antes. Em seguida, a RPC `restore_backup` roda no banco como o próprio usuário (`security invoker`, com RLS).

Regras da RPC:

- Os registros sempre pertencem a quem restaura; o `owner_id` do arquivo é ignorado.
- **Mesclar, para o mesmo id:** vence a versão com `updated_at` mais recente.
- **Mesclar, organização:** projetos, categorias, tags e contextos com o mesmo nome (sem diferenciar maiúsculas) são reaproveitados, e as referências são remapeadas.
- **Ids de outra conta:** um id que já pertence a outra conta no mesmo banco ganha um id novo, e as referências acompanham.
- **Sem duplicatas:** tempo, metas, desenvolvimento, lembretes e sessões não são duplicados ao restaurar o mesmo backup duas vezes.
- **Ignorados:** cronômetros em andamento e sessões de foco ativas.
- **Histórico:** `task_status_history` e `task_activity_logs` não são restaurados (são somente leitura para o usuário). Os triggers registram a própria restauração. No modo substituir, as exclusões ficam na trilha de auditoria.
- **Perfil e preferências:** são atualizados quando o backup é mais recente, ou sempre no modo substituir.

## Anexos

Os backups e exportações levam apenas os dados do banco. **Os arquivos anexados não entram no backup:** eles ficam em `%APPDATA%\didiflow\attachments`. Para preservá-los, copie essa pasta junto com os backups. Depois de uma restauração no modo substituir, o app apaga os arquivos cujos anexos deixaram de existir.

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

### A partir da cópia completa (JSON), manualmente

Prefira a restauração pelo aplicativo (acima). Sem o app, o procedimento manual é:

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
