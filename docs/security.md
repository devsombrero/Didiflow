# Segurança

## Credenciais do Supabase

- O aplicativo usa somente a URL do projeto e a **anon/publishable key**. Ambas são públicas por natureza; a proteção dos dados vem das políticas RLS.
- A **service_role/secret key nunca** entra no código Angular, no processo Electron nem no pacote distribuído. Ela só é usada em ferramentas administrativas fora do app, se necessário.
- Os valores vêm de `DIDIFLOW_SUPABASE_URL` e `DIDIFLOW_SUPABASE_ANON_KEY`, lidas do ambiente ou de um `.env` (não versionado). O repositório contém apenas `.env.example`.
- `scripts/write-env.mjs` gera `src/environments/environment.ts` (não versionado) antes de `start` e `build`. O script recusa:
  - chaves `sb_secret_*` ou JWTs com `role: service_role`;
  - URLs que não sejam `https`, exceto o Supabase local em `http://127.0.0.1` ou `localhost`.
- Em dev, os valores vêm de `npx supabase status`. As chaves locais são as chaves demo padrão do Supabase CLI, públicas e válidas só no stack local. Em produção, a CI injeta as variáveis no build.

## Autorização

- RLS habilitado em todas as tabelas com dados privados, com políticas `select/insert/update/delete` restritas a `owner_id = (select auth.uid())`, sempre `to authenticated`.
- `anon` não tem nenhum privilégio nas tabelas, sequências ou funções de `public`.
- `TRUNCATE`, `REFERENCES` e `TRIGGER` são revogados de `authenticated`. O Supabase concede esses privilégios por padrão, e `TRUNCATE` ignora RLS.
- `profiles` e `user_preferences` aceitam `UPDATE` só nas colunas editáveis (grants por coluna); linhas são criadas por trigger.
- Chaves estrangeiras compostas com `owner_id` impedem referências entre usuários diferentes (ver `database.md`).
- Tabelas de histórico são somente leitura para o usuário; inserções acontecem por triggers.
- Filtros no Angular servem para UX, nunca como barreira de segurança.
- O isolamento é testado contra um Postgres real:
  - `supabase/tests/database/rls.test.sql` (pgTAP, `npm run db:test`);
  - `tests/integration/` (API real com a chave pública, `npm run test:integration`).

## Autenticação e sessão

- Senhas são gerenciadas exclusivamente pelo Supabase Auth: mínimo de 8 caracteres, com maiúsculas, minúsculas e dígitos (`supabase/config.toml`, espelhado no formulário).
- O cadastro exige confirmação de e-mail. Confirmação e recuperação de senha usam **códigos OTP de 6 dígitos** (templates em `supabase/templates/`), sem links de redirecionamento ou deep links.
- A recuperação responde da mesma forma exista ou não a conta, para não permitir enumeração.
- A sessão (access e refresh token) é persistida pelo `secureStore` do Electron, que criptografa os dados com `safeStorage` (DPAPI no Windows) no processo principal. O renderer não grava tokens em `localStorage`; esse fallback existe só quando o Angular roda no navegador, durante o desenvolvimento.
- O logout remove a sessão do secure store.

## Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- O preload expõe apenas `window.didiflow` (`platform`, `secureStore`, `openExternal`, `notify`, `onNavigate`, `saveFile`); não expõe `ipcRenderer` nem módulos do Node.
- Todo payload IPC é validado no processo principal (`electron/ipc/validation.ts`):
  - chaves do secure store: `[A-Za-z0-9._:-]{1,128}`; valores: string de até 64 KiB;
  - `openExternal`: apenas `https://`, sem credenciais na URL, até 2048 caracteres;
  - `notify`: título de 1 a 120 caracteres, corpo de até 500 e rota interna opcional (`/caminho` com caracteres seguros, sem `//`). O clique na notificação só envia ao renderer essa rota já validada;
  - `saveFile`: nome-base seguro (`[A-Za-z0-9._-]`, sem caminho) com a extensão do tipo (`csv`/`json`), até 50 MB. O destino é escolhido pelo usuário no diálogo nativo e a gravação acontece no processo principal.
- Handlers IPC rejeitam chamadas de frames fora das origens confiáveis (`app://didiflow` e, só em builds não empacotados, o dev server).
- `DIDIFLOW_DEV_SERVER_URL` é ignorada em builds empacotados.
- Navegação para origens externas, `window.open` e `<webview>` são bloqueados. Links `https://` abertos via `window.open` vão para o navegador padrão.
- Todas as requisições de permissão (câmera, geolocalização, notificações...) são negadas até que uma feature precise delas.
- O protocolo `app://` impede path traversal e serve as respostas com Content Security Policy:
  - `script-src 'self'` (sem scripts inline). Por isso o inlining de CSS crítico do Angular está desativado (`optimization.styles.inlineCritical: false`), já que ele usa handlers `onload` inline.
  - `style-src 'self' 'unsafe-inline'`: o Angular injeta estilos de componentes em runtime.
  - `connect-src`: somente a origem do Supabase configurada no build (`DIDIFLOW_SUPABASE_URL`, mais o `wss://` correspondente) e, só em builds não empacotados, o Supabase local (`127.0.0.1:54321`).

### Binário empacotado

O instalador aplica Electron Fuses: sem `RunAsNode`, sem `NODE_OPTIONS`, sem argumentos de inspect, com validação de integridade do `app.asar` e carregamento só a partir dele (detalhes em `release.md`). As variáveis `DIDIFLOW_DEV_SERVER_URL` e `DIDIFLOW_USER_DATA_DIR` são ignoradas em builds empacotados.

### Secure store

`electron/ipc/secure-store.ts` grava os valores criptografados com `safeStorage` em `%APPDATA%/didiflow/secure-store.json` (base64), com escrita atômica e serializada. Se a criptografia do SO não estiver disponível, os valores ficam só em memória e a sessão não sobrevive a reinicializações. Tokens nunca são gravados em texto puro.

## Dados e banco

- Migrations são revisadas e aplicadas manualmente em produção; nenhum SQL de schema roda automaticamente.
- Exportações CSV/JSON não substituem backups do PostgreSQL.
