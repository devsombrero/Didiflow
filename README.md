# DidiFlow

Aplicação desktop para gestão pessoal de demandas: tarefas, prazos, progresso e indicadores individuais de produtividade.

Stack: Electron · Angular 22 · Supabase (Auth, PostgreSQL, RLS).

> Em desenvolvimento. Status atual: fundação, shell Electron, schema com RLS e autenticação concluídos; próxima etapa: CRUD de tarefas.

## Início rápido

Requer Node.js `^24.15` e Docker.

```bash
npm ci
npm run db:start      # Supabase local
cp .env.example .env  # preencha com os valores de `npx supabase status`
npm run electron:dev  # Angular + Electron
```

Testes: `npm run test:ci`, `npm run test:electron`, `npm run db:test` e `npm run test:integration`.

Detalhes em [Fluxo de desenvolvimento](docs/development-workflow.md).

## Documentação

- [Arquitetura](docs/architecture.md)
- [Modelo de dados](docs/database.md)
- [Segurança](docs/security.md)
- [Fluxo de desenvolvimento](docs/development-workflow.md)
- [Definições de KPIs](docs/kpi-definitions.md)
- [Backup, exportação e restauração](docs/backup-restore.md)
- [Integrações](docs/integrations.md)

Requisitos originais: [prompt.md](prompt.md).
