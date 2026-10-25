# Fluxo de desenvolvimento

## Pré-requisitos

- Node.js `^24.15` (testado com 24.21) e npm 12.
- Docker (Rancher Desktop com dockerd) para o Supabase local.

## Comandos

| Comando                                   | Ação                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `npm start`                               | Servidor de desenvolvimento Angular                                      |
| `npm run build`                           | Build de produção do Angular                                             |
| `npm run lint`                            | ESLint                                                                   |
| `npm run format` / `npm run format:check` | Prettier                                                                 |
| `npm test` / `npm run test:ci`            | Testes unitários (Vitest) em watch / execução única                      |
| `npm run electron:dev`                    | `ng serve` + Electron apontando para `http://localhost:4200`             |
| `npm run electron:start`                  | Build de produção do Angular + Electron servindo `app://`                |
| `npm run electron:build`                  | Empacota `electron/main.ts` e `preload.ts` em `dist-electron/` (esbuild) |
| `npm run typecheck:electron`              | Verificação de tipos do código Electron                                  |
| `npm run test:electron`                   | Testes do processo principal (Vitest, ambiente Node)                     |

Comandos do Supabase são documentados quando a feature correspondente for integrada.

### Observações sobre o npm 12

O npm 12 bloqueia install scripts que não estejam em `allowScripts`. Nenhum é necessário hoje:

- O Electron baixa o binário na primeira execução, e não no `postinstall`.
- `esbuild`, `lmdb`, `msgpackr-extract` e `@parcel/watcher` usam binários pré-compilados de dependências opcionais.

Revise com `npm install-scripts ls` antes de aprovar qualquer pacote.

## Branches

Git Flow simplificado:

- `main`: versões estáveis.
- `develop`: integração.
- `feature/<nome>`, `fix/<nome>`, `chore/<nome>`: sempre a partir de `develop`.

Branches são criadas quando o trabalho começa, não antecipadamente. Uma feature dependente só começa depois que sua base estiver integrada em `develop`.

### Sequência planejada

MVP:

1. `feature/project-setup`
2. `feature/electron-shell`
3. `feature/supabase-auth`
4. `feature/task-crud`
5. `feature/task-progress`
6. `feature/task-history`
7. `feature/dashboard`

Depois do MVP: `feature/personal-kpis`, `feature/projects-tags`, `feature/global-search`, `feature/calendar`, `feature/time-tracking`, `feature/notifications`, `feature/data-export`, `feature/testing-ci`, `feature/packaging-release`.

## Checklist antes de integrar

1. `npm run lint`
2. `npm run format:check`
3. Testes relevantes (`npm run test:ci` e, quando aplicável, testes de banco)
4. `npm run build`
5. Revisão do diff
6. Documentação atualizada
7. Merge em `develop` com `--no-ff`, verificando o resultado

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `tipo(escopo): descrição`.

Tipos: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`. Escopos: `app`, `electron`, `auth`, `db`, `tasks`, `dashboard`, `kpis`, `calendar`, `time`, `settings`.

Cada commit é pequeno, coerente e revisável. Não misture áreas sem necessidade.
