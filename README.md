<p align="center"><img src="assets/brand/didiflow-logo-light.svg" alt="DidiFlow" width="420" /></p>

<p align="center">
  <strong>Gestão pessoal de demandas, prazos e indicadores — no computador e no celular.</strong>
</p>

<p align="center">
  <img alt="Versão" src="https://img.shields.io/badge/vers%C3%A3o-0.8.0-0284c7" />
  <img alt="Plataformas" src="https://img.shields.io/badge/plataformas-Windows%20%7C%20Android-0369a1" />
  <img alt="Electron" src="https://img.shields.io/badge/Electron-44-47848f" />
  <img alt="Angular" src="https://img.shields.io/badge/Angular-22-dd0031" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20RLS-3ecf8e" />
  <img alt="Capacitor" src="https://img.shields.io/badge/Capacitor-8-119eff" />
</p>

<p align="center">
  <img src="docs/manual/img/desktop-02-dashboard.png" alt="Dashboard do DidiFlow no computador" width="74%" />
  &nbsp;
  <img src="docs/manual/img/android-02-dashboard.png" alt="Dashboard do DidiFlow no Android" width="22%" />
</p>

O **DidiFlow** organiza o que você precisa entregar: tarefas com prazo, prioridade e solicitante,
épicos e subtarefas com progresso calculado sozinho, registro de tempo, KPIs pessoais e
notificações — inclusive por e-mail, em formato de relatório. É o mesmo app Angular no Windows
(Electron) e no Android (Capacitor), com os dados no Supabase protegidos por RLS.

📘 **[Manual do usuário em PDF](docs/manual/DidiFlow-Manual-0.8.0.pdf)** · 📝 [CHANGELOG](CHANGELOG.md) · 🔐 [Segurança](docs/security.md)

---

## Sumário

- [Destaques](#destaques)
- [Telas](#telas)
- [Jornadas de uso](#jornadas-de-uso)
- [Arquitetura](#arquitetura)
- [Instalação](#instalação)
- [Desenvolvimento](#desenvolvimento)
- [Documentação](#documentação)

## Destaques

|                                   |                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ **Tarefas completas**          | Solicitante, links do Jira e do Slack, datas, estimativa, projeto, categoria, contexto, tags, descrição em Markdown, anexos e links de recursos.          |
| 📊 **Status sempre coerente**     | 0% ao iniciar, 100% ao concluir; mover o progresso ajusta o status. Regras garantidas no banco, com histórico e auditoria.                                |
| ⚡ **Épicos e subtarefas**        | Até três níveis (épico › tarefa › subtarefa); progresso e horas do item pai calculados automaticamente.                                                   |
| 🗂️ **Lista, quadro e calendário** | Filtros combinados, Kanban com arrastar e soltar e calendário por dia, semana ou mês.                                                                     |
| ⏱️ **Tempo e foco**               | Cronômetro, apontamentos manuais, horas por dia contra a meta e sessões de foco de 25/50/90 minutos.                                                      |
| 📈 **KPIs e metas**               | Dashboard, 10 indicadores com fórmula e histórico, metas SMART com acompanhamento automático.                                                             |
| 🤖 **DidiBot (IA)**               | Assistente opcional com a API Gemini gratuita: resume o dia, sugere prioridades e quebra tarefas em subtarefas. "Entrar com Google" cria a chave sozinho. |
| 🔔 **Notificações**               | Lembretes, resumo de prazos e avisos personalizados recorrentes — no app, no Windows, no Android (mesmo fechado) e por **e-mail via Gmail**.              |
| 💾 **Seus dados, seguros**        | RLS por usuário, sessão criptografada pelo sistema, backups locais automáticos e exportação CSV/JSON.                                                     |

## Telas

### Computador (Windows)

<table>
  <tr>
    <td width="50%"><img src="docs/manual/img/desktop-04-tasks.png" alt="Lista de tarefas" /><br /><sub><b>Tarefas</b> — busca, filtros combinados e ações por linha</sub></td>
    <td width="50%"><img src="docs/manual/img/desktop-05-board.png" alt="Quadro Kanban" /><br /><sub><b>Quadro</b> — Kanban por status com arrastar e soltar</sub></td>
  </tr>
  <tr>
    <td><img src="docs/manual/img/desktop-07-task-detail.png" alt="Detalhe da tarefa" /><br /><sub><b>Detalhe</b> — status, progresso, solicitação e horas automáticas</sub></td>
    <td><img src="docs/manual/img/desktop-10-epic.png" alt="Épico com tarefas" /><br /><sub><b>Épico</b> — tarefas filhas com progresso consolidado</sub></td>
  </tr>
  <tr>
    <td><img src="docs/manual/img/desktop-06-task-form.png" alt="Formulário de tarefa" /><br /><sub><b>Nova tarefa</b> — formulário em janela com editor de Markdown</sub></td>
    <td><img src="docs/manual/img/desktop-12-calendar.png" alt="Calendário" /><br /><sub><b>Calendário</b> — início e entrega por dia, semana ou mês</sub></td>
  </tr>
  <tr>
    <td><img src="docs/manual/img/desktop-15-kpis.png" alt="KPIs" /><br /><sub><b>KPIs</b> — indicadores com fórmula e comparação com o período anterior</sub></td>
    <td><img src="docs/manual/img/desktop-17-time.png" alt="Registro de tempo" /><br /><sub><b>Tempo</b> — cronômetro, apontamentos e horas por dia</sub></td>
  </tr>
  <tr>
    <td><img src="docs/manual/img/desktop-19-notifications.png" alt="Notificações personalizadas" /><br /><sub><b>Notificações</b> — avisos recorrentes com próxima ocorrência</sub></td>
    <td><img src="docs/manual/img/desktop-26-email.png" alt="Configuração de e-mail" /><br /><sub><b>E-mail (Gmail)</b> — notificações também na sua caixa de entrada</sub></td>
  </tr>
  <tr>
    <td><img src="docs/manual/img/desktop-27-didibot.png" alt="DidiBot" /><br /><sub><b>DidiBot</b> — assistente com Gemini que usa as suas tarefas reais</sub></td>
    <td><img src="docs/manual/img/desktop-28-didibot-settings.png" alt="DidiBot nas Configurações" /><br /><sub><b>Entrar com Google</b> — a chave do Gemini é criada automaticamente</sub></td>
  </tr>
  <tr>
    <td><img src="docs/manual/img/desktop-14-focus.png" alt="Modo foco" /><br /><sub><b>Modo foco</b> — sessões cronometradas lançadas como tempo</sub></td>
    <td><img src="docs/manual/img/desktop-25-dashboard-dark.png" alt="Tema escuro" /><br /><sub><b>Tema escuro</b> — claro, escuro ou seguindo o sistema</sub></td>
  </tr>
</table>

### Celular (Android)

<table>
  <tr>
    <td width="25%"><img src="docs/manual/img/android-06-task-cards.png" alt="Tarefas em cartões" /><br /><sub>Tarefas em cartões</sub></td>
    <td width="25%"><img src="docs/manual/img/android-07-board.png" alt="Quadro" /><br /><sub>Quadro deslizante</sub></td>
    <td width="25%"><img src="docs/manual/img/android-08-task-detail.png" alt="Detalhe" /><br /><sub>Detalhe da tarefa</sub></td>
    <td width="25%"><img src="docs/manual/img/android-04-menu.png" alt="Menu" /><br /><sub>Menu em gaveta</sub></td>
  </tr>
  <tr>
    <td><img src="docs/manual/img/android-11-epic.png" alt="Épico" /><br /><sub>Tarefas do épico</sub></td>
    <td><img src="docs/manual/img/android-13-calendar.png" alt="Calendário" /><br /><sub>Calendário</sub></td>
    <td><img src="docs/manual/img/android-14-today.png" alt="Hoje" /><br /><sub>Prioridades de hoje</sub></td>
    <td><img src="docs/manual/img/android-17-bell.png" alt="Notificações" /><br /><sub>Notificações</sub></td>
  </tr>
</table>

### Notificação por e-mail

<p align="center">
  <img src="docs/manual/img/email-digest.png" alt="E-mail de resumo de prazos em formato de relatório" width="420" />
</p>

Cada tarefa chega com **urgência**, status, barra de progresso, prazo (“vence amanhã”, “atrasada há
2 dias”), **épico e tarefa-mãe**, projeto, solicitante, horas contra a estimativa, subtarefas, tags,
trecho da descrição e botão para o card do Jira. O resumo de prazos traz totais e ordena das
tarefas mais urgentes para as menos urgentes.

## Jornadas de uso

### 1. Primeiro acesso

```mermaid
flowchart LR
    A([Instalar o app<br/>Windows ou Android]) --> B[Criar conta]
    B --> C[Confirmar código<br/>de 6 dígitos]
    C --> D[Configurações<br/>fuso, tema, meta diária]
    D --> E[Organização<br/>projetos, categorias, tags]
    E --> F[Nova tarefa]
    F --> G([Dashboard com<br/>visão do trabalho])
```

### 2. Ciclo de vida de uma tarefa

O status e o percentual de conclusão andam juntos — a regra vale na interface e no banco.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> NaoIniciado: criar
    NaoIniciado: Não iniciado · 0%
    EmAndamento: Em andamento · 0–99%
    Bloqueado: Bloqueado · mantém %
    Concluido: Concluído · 100%
    Cancelado: Cancelado · mantém %

    NaoIniciado --> EmAndamento: iniciar (0%)
    EmAndamento --> Bloqueado: impedimento
    Bloqueado --> EmAndamento: desbloquear
    EmAndamento --> Concluido: progresso 100% ou concluir
    NaoIniciado --> Concluido: concluir
    EmAndamento --> Cancelado: cancelar
    Concluido --> EmAndamento: reabrir
    Cancelado --> NaoIniciado: reabrir
    Concluido --> [*]
```

### 3. Um dia de trabalho

```mermaid
flowchart TD
    A([Abrir o DidiFlow]) --> B[Resumo de prazos<br/>atrasadas e vencendo]
    B --> C[Hoje: montar a lista<br/>a partir das sugestões]
    C --> D[Modo foco ou cronômetro<br/>na tarefa escolhida]
    D --> E[Tempo lançado na tarefa<br/>e nas horas do dia]
    E --> F{Terminou?}
    F -- Não --> G[Atualizar progresso<br/>e observações]
    G --> C
    F -- Sim --> H[Marcar como concluída<br/>100% e data de conclusão]
    H --> I([Dashboard e KPIs<br/>atualizados])
```

### 4. Épicos e subtarefas

```mermaid
flowchart TD
    E["⚡ Épico: Lançamento do Portal 2.0<br/>progresso = média ponderada das tarefas"]
    E --> T1["Tarefa: Novo login com SSO<br/>Concluída · 100%"]
    E --> T2["Tarefa: Painel do cliente<br/>calculado pelas subtarefas"]
    E --> T3["Tarefa: Guia de migração<br/>Não iniciada · 0%"]
    T2 --> S1["↳ Cards de resumo · 100%"]
    T2 --> S2["↳ Gráfico de consumo · 50%"]
    T2 --> S3["↳ Testes de usabilidade · 0%"]
```

As horas registradas e as estimativas também sobem na hierarquia: o card **Tempo** do item pai soma
as subtarefas e mostra o ritmo necessário até a entrega.

### 5. Conectar o DidiBot com a conta Google

```mermaid
sequenceDiagram
    autonumber
    participant U as Você
    participant A as DidiFlow (processo principal)
    participant G as Google
    U->>A: Entrar com Google
    A->>G: login no navegador (OAuth, PKCE, retorno em 127.0.0.1)
    G-->>A: autorização (acesso temporário ao Google Cloud)
    A->>G: projeto "DidiFlow DidiBot" + API Gemini ativada
    A->>G: cria API key restrita ao Gemini
    G-->>A: chave
    A->>A: guarda a chave criptografada e descarta o acesso
    U->>A: pergunta ao DidiBot
    A->>G: Gemini (resumo das tarefas, se permitido)
    G-->>U: resposta
```

### 6. Como uma notificação chega até você

```mermaid
sequenceDiagram
    autonumber
    participant S as Agendador (a cada 30 s)
    participant N as Notificador
    participant U as Você
    participant G as Gmail (processo principal)
    S->>N: lembrete vencido, resumo de prazos ou aviso personalizado
    N->>U: cartão no app (janela em foco)
    N->>U: notificação do Windows ou do Android (em segundo plano)
    N->>G: relatório da tarefa (se o e-mail estiver ativo para o tipo)
    G->>U: e-mail com urgência, épico, prazo e horas
```

No Android, lembretes e avisos da próxima semana ficam agendados no sistema e aparecem **mesmo com o
app fechado**.

## Arquitetura

```mermaid
flowchart TB
    subgraph Desktop["Windows · Electron 44"]
        R["Renderer Angular 22<br/>sandbox, sem Node"] -- "IPC validado<br/>(preload)" --> M["Processo principal<br/>secure store, backups,<br/>anexos, SMTP Gmail"]
    end
    subgraph Mobile["Android · Capacitor 8"]
        W["Mesmo app Angular<br/>na WebView"] --> P["Plugins nativos<br/>notificações, preferências"]
    end
    R -- "HTTPS + JWT" --> SB[("Supabase<br/>Auth + PostgreSQL<br/>com RLS")]
    W -- "HTTPS + JWT" --> SB
    M -- "TLS 465" --> GM[["smtp.gmail.com"]]
```

- **Uma base de código:** as mesmas telas e regras rodam no desktop e no celular; o layout é
  mobile-first e ganha barra lateral, tabelas e grades a partir de 769 px.
- **Segurança:** RLS em todas as tabelas, sessão criptografada com `safeStorage`, CSP restrita,
  Electron Fuses e IPC com validação de todos os parâmetros. Detalhes em
  [docs/security.md](docs/security.md).

## Instalação

| Plataforma | Arquivo                       | Observação                                                                                     |
| ---------- | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Windows    | `DidiFlow-Setup-<versão>.exe` | Sem assinatura digital: no SmartScreen, clique em **Mais informações → Executar assim mesmo**. |
| Android    | `DidiFlow-<versão>-debug.apk` | Permita “instalar apps desconhecidos”; na primeira abertura, autorize notificações e alarmes.  |

O passo a passo ilustrado está no [manual do usuário](docs/manual/DidiFlow-Manual-0.8.0.pdf).

## Desenvolvimento

Requer Node.js `^24.15` e Docker.

```bash
npm ci
npm run db:start      # Supabase local
cp .env.example .env  # preencha com os valores de `npx supabase status`
npm run electron:dev  # Angular + Electron
```

| Tarefa                         | Comando                                                 |
| ------------------------------ | ------------------------------------------------------- |
| Unitários (Angular / Electron) | `npm run test:ci` / `npm run test:electron`             |
| Banco (pgTAP)                  | `npm run db:test`                                       |
| Integração (API real)          | `npm run test:integration`                              |
| E2E (Playwright + Electron)    | `npm run test:e2e`                                      |
| Instalador Windows             | `npm run dist` (veja [release](docs/release.md))        |
| APK Android                    | `npm run android:build` (veja [mobile](docs/mobile.md)) |
| Manual em PDF                  | `npm run manual`                                        |
| Ícones a partir dos SVGs       | `npm run icons`                                         |

## Documentação

- [Guia de uso](docs/user-guide.md) e [manual em PDF](docs/manual/DidiFlow-Manual-0.8.0.pdf)
- [Arquitetura](docs/architecture.md)
- [Modelo de dados](docs/database.md)
- [Segurança](docs/security.md)
- [Aplicativo Android](docs/mobile.md)
- [Identidade visual](docs/brand.md)
- [Fluxo de desenvolvimento e CI](docs/development-workflow.md)
- [Definições de KPIs](docs/kpi-definitions.md)
- [Backup, exportação e restauração](docs/backup-restore.md)
- [Integrações](docs/integrations.md)
- [Empacotamento e release](docs/release.md)

Requisitos originais: [prompt.md](prompt.md).
