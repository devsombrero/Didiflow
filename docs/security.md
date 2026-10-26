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
- O preload expõe apenas `window.didiflow` (`platform`, `secureStore`, `openExternal`, `notify`, `onNavigate`, `saveFile`, `openBackupFile`, `backups`, `attachments`); não expõe `ipcRenderer` nem módulos do Node.
- Todo payload IPC é validado no processo principal (`electron/ipc/validation.ts`):
  - chaves do secure store: `[A-Za-z0-9._:-]{1,128}`; valores: string de até 64 KiB;
  - `openExternal`: apenas `https://`, sem credenciais na URL, até 2048 caracteres;
  - `notify`: título de 1 a 120 caracteres, corpo de até 500, `silent` booleano opcional e rota interna opcional (`/caminho` com caracteres seguros, sem `//`). O clique na notificação só envia ao renderer essa rota já validada;
  - `saveFile`: nome-base seguro (`[A-Za-z0-9._-]`, sem caminho) com a extensão do tipo (`csv`/`json`), até 50 MB. O destino é escolhido pelo usuário no diálogo nativo e a gravação acontece no processo principal;
  - `backups.*`: nomes de arquivo restritos a `didiflow-backup-<data>-<auto|manual|prerestore>.json` dentro da pasta de backups; conteúdo precisa ser JSON com `format: didiflow-backup` e até 50 MB; retenção entre 1 e 100;
  - `openBackupFile`: diálogo nativo, apenas `.json` de até 50 MB com formato DidiFlow;
  - `attachments.*`: ids de usuário, tarefa e anexo precisam ser UUIDs, e só com eles o caminho é montado (`attachments/<usuário>/<tarefa>/<anexo>/<arquivo>`). Assim não há path traversal. Os arquivos a anexar vêm do diálogo nativo, nunca de caminhos enviados pelo renderer. O renderer não recebe caminhos nem conteúdo. O main recusa arquivos que ultrapassem a cota restante da tarefa (até 50 MB) ou que deixariam menos de 200 MB livres no disco. Executáveis (`.exe`, `.bat`, `.ps1`, `.lnk`...) não são abertos: o app mostra o arquivo na pasta. A limpeza de órfãos só roda quando a lista completa de ids foi lida.
- Handlers IPC rejeitam chamadas de frames fora das origens confiáveis (`app://didiflow` e, só em builds não empacotados, o dev server).
- `DIDIFLOW_DEV_SERVER_URL` é ignorada em builds empacotados.
- Navegação para origens externas, `window.open` e `<webview>` são bloqueados. Links `https://` abertos via `window.open` vão para o navegador padrão.
- Markdown de descrições e observações (ngx-markdown + marked) passa pelo sanitizador de HTML do Angular: scripts, handlers `on*`, `<input>` e URLs `javascript:` são removidos. Cliques em links são interceptados; só `http(s)://` segue para `window.open` (e daí para o navegador padrão, só `https://`).
- Links de recursos das tarefas (`task_links`) só aceitam `https://` sem credenciais, validados no app e por CHECK no banco, e abrem pelo `openExternal`.
- Todas as requisições de permissão (câmera, geolocalização, notificações...) são negadas até que uma feature precise delas.
- O protocolo `app://` impede path traversal e serve as respostas com Content Security Policy:
  - `script-src 'self'` (sem scripts inline). Por isso o inlining de CSS crítico do Angular está desativado (`optimization.styles.inlineCritical: false`), já que ele usa handlers `onload` inline.
  - `style-src 'self' 'unsafe-inline'`: o Angular injeta estilos de componentes em runtime.
  - `connect-src`: somente a origem do Supabase configurada no build (`DIDIFLOW_SUPABASE_URL`, mais o `wss://` correspondente) e, só em builds não empacotados, o Supabase local (`127.0.0.1:54321`).

### Binário empacotado

O instalador aplica Electron Fuses: sem `RunAsNode`, sem `NODE_OPTIONS`, sem argumentos de inspect, com validação de integridade do `app.asar` e carregamento só a partir dele (detalhes em `release.md`). As variáveis `DIDIFLOW_DEV_SERVER_URL` e `DIDIFLOW_USER_DATA_DIR` são ignoradas em builds empacotados.

### Secure store

`electron/ipc/secure-store.ts` grava os valores criptografados com `safeStorage` em `%APPDATA%/didiflow/secure-store.json` (base64), com escrita atômica e serializada. Se a criptografia do SO não estiver disponível, os valores ficam só em memória e a sessão não sobrevive a reinicializações. Tokens nunca são gravados em texto puro.

### E-mail (Gmail)

O envio opcional de notificações por e-mail (`electron/ipc/email.ts`) roda só no processo principal:

- **Conexão:** SMTP do Gmail (`smtp.gmail.com:465`, TLS), autenticado com uma **senha de app** do Google. A senha normal da conta não é aceita pelo Gmail nem pelo app, que valida o formato de 16 letras.
- **Onde fica a senha:** num secure store separado, `%APPDATA%/didiflow/email-secrets.json`, criptografado com `safeStorage`. O renderer pode gravar ou remover a senha pelo IPC `email:save`, mas nunca lê o valor de volta: `email:status` informa só se há senha salva. A chave também não é acessível pelo `secureStore` exposto ao renderer. Sem criptografia do SO, a senha fica só em memória até o app fechar.
- **Configuração:** conta, destinatário e tipos de notificação ficam em `%APPDATA%/didiflow/email-settings.json`. Nada disso vai para o Supabase.
- **Validação:** o IPC `email:send` aceita apenas tipos conhecidos, título de até 120 caracteres e corpo de até 2.000. O texto é escapado no HTML do e-mail.
- **Limite:** no máximo 20 e-mails de notificação por hora, para proteger a conta de regras com intervalo curto.
- **Destinatário:** o configurado em "Enviar para"; em branco, o e-mail da conta DidiFlow conectada (enviado pelo renderer e validado); por último, a própria conta remetente. Domínios reservados de teste (`.local`, `.test`, `example.com` etc.) nunca recebem e-mail.

#### Conta padrão embutida no instalador

Por decisão do dono do projeto, o instalador pode trazer uma conta Gmail padrão, para o envio funcionar sem configuração:

- **Origem:** `DIDIFLOW_GMAIL_ADDRESS` e `DIDIFLOW_GMAIL_APP_PASSWORD` no `.env` (ignorado pelo git). Nada vai para o repositório.
- **Criptografia:** `electron/build.mjs` cifra a conta com AES-256-GCM, com chave e IV aleatórios a cada build, e injeta o resultado só no `main.cjs` do processo principal (`electron/ipc/builtin-email.ts`). O preload, o renderer e o APK Android não recebem nada.
- **Uso:** só em builds empacotados; desenvolvimento e testes E2E nunca enviam. Uma conta salva pelo usuário em Configurações tem prioridade.
- **Limite real:** a chave precisa viajar no próprio app (mascarada), então isto é **ofuscação forte, não segredo**. Quem tiver o instalador e fizer engenharia reversa do `app.asar` recupera a senha de app, que dá acesso aos e-mails da conta. Por isso: não distribua o instalador fora de quem deve ter esse acesso; prefira uma conta Gmail dedicada ao DidiFlow; e, se o instalador vazar, revogue a senha em myaccount.google.com/apppasswords e gere um build novo.

## Dados e banco

- Migrations são revisadas e aplicadas manualmente em produção; nenhum SQL de schema roda automaticamente.
- Exportações CSV/JSON não substituem backups do PostgreSQL.
