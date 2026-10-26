# Empacotamento e release

## Gerar o instalador (Windows)

```bash
# .env (ou variáveis de ambiente) apontando para o projeto Supabase de produção:
# DIDIFLOW_SUPABASE_URL=https://<projeto>.supabase.co
# DIDIFLOW_SUPABASE_ANON_KEY=<anon ou publishable key>
npm ci
npm run dist
```

Saída em `release/`: `DidiFlow-Setup-<versão>.exe` (NSIS, x64, instalação por usuário com escolha de pasta) e o `.blockmap`.

O que entra no pacote (`electron-builder.yml`):

- Só `dist/didiflow/browser` (Angular) e `dist-electron` (main e preload), dentro de `app.asar`. Nenhum `node_modules` e nenhum source map, porque tudo já vem empacotado pelo build.
- A CSP do app empacotado libera em `connect-src` **apenas a origem do Supabase configurada no build** (`https://<projeto>.supabase.co` e `wss://`). O Supabase local não é permitido.

### Electron Fuses (hardening)

| Fuse                                    | Valor     | Efeito                                                         |
| --------------------------------------- | --------- | -------------------------------------------------------------- |
| `RunAsNode`                             | desligado | `ELECTRON_RUN_AS_NODE` não transforma o app em um runtime Node |
| `EnableNodeOptionsEnvironmentVariable`  | desligado | `NODE_OPTIONS` é ignorado                                      |
| `EnableNodeCliInspectArguments`         | desligado | `--inspect` e similares são ignorados                          |
| `EnableEmbeddedAsarIntegrityValidation` | ligado    | O `app.asar` alterado não carrega                              |
| `OnlyLoadAppFromAsar`                   | ligado    | Só carrega o código do `app.asar`                              |
| `EnableCookieEncryption`                | ligado    | Cookies criptografados em disco                                |

Por causa disso, os testes E2E rodam contra o build não empacotado (`npm run test:e2e`).

## Variáveis e segredos

| Variável                                                | Onde             | Observação                                                                                             |
| ------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `DIDIFLOW_SUPABASE_URL`                                 | build            | `https://` obrigatório (exceto Supabase local)                                                         |
| `DIDIFLOW_SUPABASE_ANON_KEY`                            | build            | Chave pública; `write-env` recusa `service_role`/`sb_secret_`                                          |
| `CSC_LINK`, `CSC_KEY_PASSWORD`                          | build (opcional) | Certificado Authenticode (.pfx em base64) e senha                                                      |
| `DIDIFLOW_GMAIL_ADDRESS`, `DIDIFLOW_GMAIL_APP_PASSWORD` | build (opcional) | Conta Gmail padrão das notificações por e-mail, embutida criptografada no instalador (ver security.md) |

No GitHub, ficam em _Repository secrets_:

- `DIDIFLOW_SUPABASE_URL` e `DIDIFLOW_SUPABASE_ANON_KEY`;
- `WIN_CSC_LINK` e `WIN_CSC_KEY_PASSWORD`, quando houver certificado.

Arquivos `.env` nunca são versionados.

## Assinatura de código

- Sem certificado, o instalador funciona, mas o Windows SmartScreen exibe "Editor desconhecido" até a reputação ser construída.
- Com um certificado de assinatura de código (OV ou EV), defina `CSC_LINK`/`CSC_KEY_PASSWORD` e o electron-builder assina o executável, o desinstalador e o instalador. Certificados EV em token de hardware exigem assinatura em máquina própria ou serviço de assinatura remota (ex.: Azure Trusted Signing).

## Versões

- Versionamento semântico em `package.json` (`version`), com as mudanças registradas em `CHANGELOG.md`.
- Para publicar:
  1. Atualize `version` e o `CHANGELOG.md` em `develop`.
  2. Faça o merge em `main`.
  3. Crie a tag `vX.Y.Z`.
- O workflow `.github/workflows/release.yml` (em tags `v*.*.*`) confere se a tag corresponde à versão, roda os testes, gera o instalador e cria um **rascunho** de release no GitHub com os artefatos.

## Atualizações automáticas

Ainda não estão habilitadas (`publish: null`). O caminho previsto:

1. Assinar os builds; o Windows exige isso para atualizações confiáveis.
2. Configurar `publish` (GitHub Releases ou um servidor genérico HTTPS) no `electron-builder.yml`.
3. Adicionar `electron-updater` no processo principal, com verificação ao iniciar, download em segundo plano e instalação ao reiniciar, sempre perguntando ao usuário.
4. Mudanças de schema continuam sendo aplicadas pelas migrations antes da distribuição da nova versão. O app precisa tolerar o schema da versão anterior durante a janela de atualização.

## Migrations em produção

Nunca automáticas a partir do app: `npx supabase link --project-ref <ref>`, revisar `npx supabase db diff` e aplicar com `npx supabase db push`, depois de um backup (veja `backup-restore.md`).
