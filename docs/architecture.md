# Arquitetura

O DidiFlow é uma aplicação desktop composta por três partes com responsabilidades separadas.

```
┌──────────────────────────── Electron ────────────────────────────┐
│  main process (electron/main.ts)                                 │
│   - ciclo de vida, janela, protocolo app://                      │
│   - IPC: secureStore (safeStorage), openExternal                 │
│                         ▲  contextBridge (preload.ts)            │
│  renderer (sandbox, contextIsolation, sem Node)                  │
│   └─ Angular 22 ─────────────── HTTPS ───────────────► Supabase  │
└──────────────────────────────────────────────────────────────────┘
                                                Auth · PostgreSQL + RLS
```

## Decisões técnicas

| Tema                   | Decisão                                                         | Motivo                                                                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gerenciador de pacotes | npm 12                                                          | Único instalado no ambiente; um só lockfile.                                                                                                                                                                                                                      |
| Interface              | Angular 22, componentes standalone, zoneless, signals           | Versão estável atual; sem NgModules nem zone.js.                                                                                                                                                                                                                  |
| TypeScript             | 6.0.x                                                           | Faixa exigida por `@angular/build` 22 (`>=6.0 <6.1`).                                                                                                                                                                                                             |
| Desktop                | Electron 44.x                                                   | Linha estável com patches; a 45.0.0 era recente demais no início do projeto.                                                                                                                                                                                      |
| Empacotamento          | electron-builder, alvo Windows (NSIS)                           | SO definido para o projeto.                                                                                                                                                                                                                                       |
| Backend                | Supabase (Auth, PostgreSQL, RLS)                                | Backend gerenciado; autorização no banco.                                                                                                                                                                                                                         |
| Gráficos               | `@swimlane/ngx-charts` 25 com wrapper próprio (`shared/charts`) | SVG com tooltips, animação de entrada (desligada com `prefers-reduced-motion`) e cores lidas dos tokens do tema. Exige `provideAnimationsAsync()` (API de animações legada que a biblioteca ainda usa). Ticks inteiros, barras finas e tabela de dados acessível. |
| Markdown               | `ngx-markdown` 22 + `marked` 18 (`shared/markdown`)             | GFM com quebras de linha; sanitização padrão do Angular; checklists renderizados como glifos (o sanitizador remove `<input>`). Editor próprio com barra de formatação e pré-visualização.                                                                         |
| Estado                 | Serviços com signals                                            | Escopo pessoal não justifica NgRx.                                                                                                                                                                                                                                |
| Testes unitários       | Vitest (runner do `@angular/build`)                             | Padrão do Angular 22.                                                                                                                                                                                                                                             |
| Testes e2e             | Playwright                                                      | Suporta Electron.                                                                                                                                                                                                                                                 |
| Orçamento de bundle    | Inicial: aviso em 1,2 MB, erro em 2 MB                          | O app desktop carrega os arquivos do disco (`app://`), sem custo de rede; o ngx-charts fica no chunk lazy do dashboard e dos KPIs.                                                                                                                                |
| Interface              | Angular Material 22 (M3), tema azure/violet, densidade -1       | Componentes acessíveis e consistentes. O tema segue o `color-scheme` (sistema ou escolha do usuário). Ícones Material Symbols vêm do pacote local, sem fontes remotas, compatível com a CSP.                                                                      |
| Supabase em dev        | Local via Docker (`supabase start`)                             | Migrations e testes de RLS reproduzíveis e offline.                                                                                                                                                                                                               |

## Electron

- `electron/main.ts`: cria a janela, registra o protocolo `app://` para servir o build Angular (evita `file://`, que quebra o roteamento e a CSP) e encerra com segurança.
- `electron/preload.ts`: expõe somente `window.didiflow`, uma API explícita e tipada. Nenhum objeto do Node é exposto.
- `electron/ipc/`: handlers do processo principal. Todo payload recebido é validado (tipo, tamanho, formato).
- `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Navegação e `window.open` para fora do app são bloqueados; links externos passam por `openExternal`, que aceita apenas `https://`.

## Angular

```
src/app/
  core/       auth, guards, services (supabase client, platform bridge), interceptors
  shared/     components, directives, pipes, models
  features/   dashboard, tasks, projects, calendar, time-tracking, kpis, goals, reports, settings
  layouts/    shell autenticado (sidebar), layout de autenticação
  app.routes.ts
```

- Rotas lazy por feature, protegidas por guard de autenticação.
- Serviços de feature concentram acesso a dados e regras de negócio; componentes cuidam de apresentação.
- Toda tela trata os estados carregando, erro, vazio e sucesso.
- O cliente Supabase é um singleton em `core/`. A sessão é persistida pelo `secureStore` do Electron (ver `security.md`).

## Notificações

- Lembretes (`task_reminders`) e o resumo diário de prazos são verificados a cada minuto pelo `NotificationScheduler`, **somente enquanto o aplicativo está aberto** (inclusive minimizado). Não há serviço em segundo plano com o app fechado.
- Cada lembrete é exibido uma vez (`sent_at`). O resumo de atrasadas e o de vencimentos próximos aparecem no máximo uma vez por dia por dispositivo, e respeitam as preferências de notificação.

## Supabase

- Schema versionado em `supabase/migrations/`; nada é aplicado automaticamente em produção.
- Toda tabela com dados privados tem RLS habilitado com políticas por `owner_id = auth.uid()`.
- Regras de consistência críticas (status × progresso, histórico de auditoria) são impostas no banco por constraints e triggers, não apenas no frontend.

Detalhes em [database.md](database.md) e [security.md](security.md).
