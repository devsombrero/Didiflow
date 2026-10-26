# Changelog

Todas as mudanças relevantes do DidiFlow. O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto usa versionamento semântico.

## [Não lançado]

### Adicionado

- Notificações por e-mail (Gmail, app desktop): em Configurações → E-mail (Gmail), lembretes de tarefas, resumo de prazos, notificações personalizadas e fim de foco também podem ser enviados por e-mail, pelo SMTP do Gmail com senha de app. A senha fica criptografada no processo principal e nunca volta ao renderer; há e-mail de teste e limite de 20 e-mails por hora.
- Conta Gmail padrão opcional para as notificações por e-mail: definida no .env no momento do build e embutida criptografada (AES-256-GCM) só no processo principal do instalador desktop. Com ela, o envio já vem ativado e cada usuário recebe no e-mail da própria conta DidiFlow.
- Manual do usuário ilustrado em PDF (desktop e Android), gerado por `npm run manual`.

## [0.5.0] - 2026-10-26

### Adicionado

- Identidade visual: símbolo DidiFlow (D aberto com check em fluxo), logotipo, ícones do app para Windows, macOS, Linux e Android (adaptativo e monocromático), notificação, abertura, favicon e tela de carregamento. Ícones gerados por `npm run icons` (ver docs/brand.md).

### Alterado

- Nova identidade visual: paleta azul DidiFlow (claro e escuro), fonte Inter empacotada, cartões arredondados com sombra suave, botões principais com gradiente, blocos do dashboard com ícones em destaque e tela de login com fundo em gradiente.
- Estilos refeitos em mobile-first: o layout de celular é a base e telas a partir de 769 px acrescentam a barra lateral, tabelas e grades com várias colunas.

## [0.4.1] - 2026-10-25

### Alterado

- Responsividade para telas de até 768 px: lista de tarefas em cartões, Kanban com uma coluna por tela (deslizar), calendário semanal em lista e mensal com marcadores, grades em uma coluna e formulários em tela cheia.

## [0.4.0] - 2026-10-25

### Adicionado

- Aplicativo Android (APK) com Capacitor: o mesmo app em layout responsivo, sessão no armazenamento privado do app e notificações agendadas no Android (funcionam com o app fechado).
- Subtarefas com descrição em Markdown, anexos de arquivo e links (abas Descrição, Arquivos e Recursos ao expandir o item), editáveis no próprio painel.

## [0.3.0] - 2026-10-25

### Adicionado

- Aba "Recursos" no card de anexos para links externos (https), com abrir, copiar, remover e registro na atividade.
- Épicos e subtarefas (até três níveis), com progresso calculado automaticamente a partir dos itens.
- Cálculo automático de horas: totais da tarefa com subtarefas, horas de hoje, ritmo necessário por dia útil até a entrega, gráfico diário e meta de horas por dia.
- Notificações personalizadas (uma vez, diária, dias úteis, semanal ou por intervalo com horário ativo), central de notificações com contador de não lidas e cartões de aviso com ação "Abrir".
- Animações (transição de páginas, entrada de listas, confete ao concluir) e efeitos sonoros sintetizados, com preferências de ativação e volume.
- Descrição e observações das tarefas em Markdown, com barra de formatação, atalhos e pré-visualização.
- Anexos nas tarefas, guardados no próprio computador: até 50 MB por tarefa, conferência de espaço livre em disco, registro na atividade e ações de abrir, mostrar na pasta, salvar cópia e remover.

### Alterado

- Iniciar uma tarefa mantém 0% (antes ia para 1%); 100% conclui a tarefa, e uma tarefa em andamento não volta a "Não iniciado" ao zerar o progresso.
- Formulários de tarefa, metas, desenvolvimento e apontamento de tempo em modais flutuantes; a tarefa pede confirmação antes de descartar alterações.
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
