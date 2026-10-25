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
- O preload expõe apenas `window.didiflow` (`platform`, `secureStore`, `openExternal`); não expõe `ipcRenderer` nem módulos do Node.
- Todo payload IPC é validado no processo principal (`electron/ipc/validation.ts`):
  - chaves do secure store: `[A-Za-z0-9._:-]{1,128}`; valores: string de até 64 KiB;
  - `openExternal`: apenas `https://`, sem credenciais na URL, até 2048 caracteres.
- Handlers IPC rejeitam chamadas de frames fora das origens confiáveis (`app://didiflow` e, só em builds não empacotados, o dev server).
- `DIDIFLOW_DEV_SERVER_URL` é ignorada em builds empacotados.
- Navegação para origens externas, `window.open` e `<webview>` são bloqueados. Links `https://` abertos via `window.open` vão para o navegador padrão.
- Todas as requisições de permissão (câmera, geolocalização, notificações...) são negadas até que uma feature precise delas.
- O protocolo `app://` impede path traversal e serve as respostas com Content Security Policy:
  - `script-src 'self'` (sem scripts inline). Por isso o inlining de CSS crítico do Angular está desativado (`optimization.styles.inlineCritical: false`), já que ele usa handlers `onload` inline.
  - `style-src 'self' 'unsafe-inline'`: o Angular injeta estilos de componentes em runtime.
  - `connect-src`: `*.supabase.co` e, só em builds não empacotados, o Supabase local (`127.0.0.1:54321`).

### Secure store

`electron/ipc/secure-store.ts` grava os valores criptografados com `safeStorage` em `%APPDATA%/didiflow/secure-store.json` (base64), com escrita atômica e serializada. Se a criptografia do SO não estiver disponível, os valores ficam só em memória e a sessão não sobrevive a reinicializações. Tokens nunca são gravados em texto puro.

## Dados e banco

- Migrations são revisadas e aplicadas manualmente em produção; nenhum SQL de schema roda automaticamente.
- Exportações CSV/JSON não substituem backups do PostgreSQL.
