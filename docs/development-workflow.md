# Fluxo de desenvolvimento

## Pré-requisitos

- Node.js `^24.15` (testado com 24.21) e npm 12.
- Docker (Rancher Desktop com dockerd) para o Supabase local.

## Comandos

| Comando                                   | Ação                                                |
| ----------------------------------------- | --------------------------------------------------- |
| `npm start`                               | Servidor de desenvolvimento Angular                 |
| `npm run build`                           | Build de produção do Angular                        |
| `npm run lint`                            | ESLint                                              |
| `npm run format` / `npm run format:check` | Prettier                                            |
| `npm test` / `npm run test:ci`            | Testes unitários (Vitest) em watch / execução única |

Comandos de Electron e Supabase são documentados à medida que as features correspondentes forem integradas.

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
