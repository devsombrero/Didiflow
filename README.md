# DidiFlow

Aplicação desktop para gestão pessoal de demandas: tarefas, prazos, progresso, tempo e indicadores individuais de produtividade.

Stack: Electron 44 · Angular 22 · Supabase (Auth, PostgreSQL com RLS).

**Versão 0.3.0.** Inclui o MVP completo, planejamento, tempo, foco, busca, exportação, quadro Kanban, backups locais, gráficos com ngx-charts, descrições em Markdown, anexos locais (até 50 MB por tarefa) e links de recursos, épicos e subtarefas com progresso e horas automáticos, formulários em modais, animações e sons, e notificações personalizadas. Veja o [CHANGELOG](CHANGELOG.md). Para o Android, veja [docs/mobile.md](docs/mobile.md).

## Funcionalidades

- Autenticação com confirmação por código e sessão criptografada pelo sistema operacional.
- CRUD completo de demandas: solicitante, links do Jira e do Slack, datas, estimativa, projeto, categoria, contexto e tags.
- Status e progresso consistentes, garantidos no banco, com histórico e auditoria.
- Dashboard, 10 KPIs com fórmulas documentadas e metas SMART.
- Calendário, prioridades do dia, modo foco e registro de tempo.
- Notificações nativas (com o app aberto), busca global (`Ctrl+K`) e exportação CSV/JSON.

## Início rápido (desenvolvimento)

Requer Node.js `^24.15` e Docker.

```bash
npm ci
npm run db:start      # Supabase local
cp .env.example .env  # preencha com os valores de `npx supabase status`
npm run electron:dev  # Angular + Electron
```

| Testes                         | Comando                                     |
| ------------------------------ | ------------------------------------------- |
| Unitários (Angular / Electron) | `npm run test:ci` / `npm run test:electron` |
| Banco (pgTAP)                  | `npm run db:test`                           |
| Integração (API real)          | `npm run test:integration`                  |
| E2E (Playwright + Electron)    | `npm run test:e2e`                          |

Instalador Windows: `npm run dist` (veja [release](docs/release.md)).

## Documentação

- [Guia de uso](docs/user-guide.md)
- [Arquitetura](docs/architecture.md)
- [Modelo de dados](docs/database.md)
- [Segurança](docs/security.md)
- [Fluxo de desenvolvimento e CI](docs/development-workflow.md)
- [Definições de KPIs](docs/kpi-definitions.md)
- [Backup, exportação e restauração](docs/backup-restore.md)
- [Integrações](docs/integrations.md)
- [Empacotamento e release](docs/release.md)

Requisitos originais: [prompt.md](prompt.md).
