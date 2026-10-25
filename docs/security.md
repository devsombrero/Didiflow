# Segurança

## Credenciais do Supabase

- O aplicativo usa somente a **anon key** e a URL do projeto. Ambas são públicas por natureza; a proteção dos dados vem das políticas RLS.
- A **service_role key nunca** entra no código Angular, no processo Electron nem no pacote distribuído. Ela só é usada em ferramentas administrativas fora do app, se necessário.
- Configuração por variáveis de ambiente (`.env`, não versionado). O repositório contém apenas `.env.example`, com valores fictícios.
- Em dev, os valores vêm do Supabase local (`supabase status`). Em produção, são injetados no build.

## Autorização

- RLS habilitado em todas as tabelas com dados privados, com políticas `select/insert/update/delete` restritas a `owner_id = auth.uid()`.
- Filtros no Angular servem para UX, nunca como barreira de segurança.
- Tabelas de auditoria não aceitam `update` nem `delete` pelo usuário; inserções acontecem por triggers.
- O isolamento é testado contra um Postgres real (Supabase local), não apenas por testes de frontend.

## Autenticação e sessão

- Senhas são gerenciadas exclusivamente pelo Supabase Auth.
- A sessão (access e refresh token) é persistida pelo `secureStore` do Electron, que criptografa os dados com `safeStorage` (DPAPI no Windows) no processo principal. O renderer não grava tokens em `localStorage`.
- A recuperação de senha usa código OTP enviado por e-mail, dispensando deep links no MVP.

## Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- O preload expõe apenas funções explícitas; não expõe `ipcRenderer` nem módulos do Node.
- Todo payload IPC é validado no processo principal.
- Navegação para origens externas e `window.open` são bloqueados. `openExternal` aceita apenas URLs `https://`.
- Content Security Policy restringe `connect-src` à URL do Supabase configurada.

## Dados e banco

- Migrations são revisadas e aplicadas manualmente em produção; nenhum SQL de schema roda automaticamente.
- Exportações CSV/JSON não substituem backups do PostgreSQL.
