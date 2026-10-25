# Changelog

Todas as mudanças relevantes do DidiFlow. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa versionamento semântico.

## [Não lançado]

### Adicionado

- Descrição e observações das tarefas em Markdown, com barra de formatação, atalhos e pré-visualização.
- Anexos nas tarefas, guardados no próprio computador: até 50 MB por tarefa, conferência de espaço livre em disco, registro na atividade e ações de abrir, mostrar na pasta, salvar cópia e remover.

### Alterado

- Gráficos do dashboard e dos KPIs migrados para ngx-charts, com animação de entrada, tooltips e cores do tema.

## [0.2.0] - 2026-10-25

### Adicionado

- Interface com Angular Material (M3), com temas claro e escuro e ícones locais.
- Quadro Kanban com arrastar e soltar, alternativa por menu e atualização otimista.
- Backups locais automáticos e manuais, e restauração pelo aplicativo (mesclar ou substituir) com backup de segurança.

## [0.1.0] - 2026-10-25

Primeira versão funcional (MVP e recursos da fase 2).

### Adicionado

- Aplicativo desktop Electron + Angular 22 com isolamento de contexto, sandbox, CSP restrita, IPC validado e Electron Fuses.
- Autenticação Supabase com confirmação de e-mail e recuperação de senha por código, e sessão criptografada com `safeStorage`.
- Perfil e preferências: tema, fuso horário, formato de data e notificações.
- Tarefas: cadastro completo (solicitação, Jira, Slack, datas, estimativa e observações), busca, filtros combinados, ordenação, paginação, duplicação, cancelamento e reabertura, arquivamento e exclusão lógica.
- Status e progresso consistentes, garantidos no banco, com histórico de transições e trilha de auditoria completa.
- Dashboard pessoal com indicadores, gráficos acessíveis e filtros.
- Dez KPIs pessoais com fórmulas documentadas, metas SMART e registros de desenvolvimento.
- Projetos, categorias, tags, contextos de trabalho e solicitantes.
- Calendário (dia, semana e mês) com planejamento.
- Registro de tempo (cronômetro no servidor e apontamentos manuais).
- Prioridades do dia e modo foco.
- Notificações nativas: lembretes e resumo diário de prazos.
- Busca global de texto completo (português, sem diferenciar acentos).
- Exportação CSV/JSON e cópia completa.
- RLS em todas as tabelas, com testes pgTAP, testes de integração e E2E com Playwright.
- Pipeline de CI e workflow de release do instalador Windows (NSIS).
