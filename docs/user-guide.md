# Guia de uso

## Instalação

1. Execute `DidiFlow-Setup-<versão>.exe` e escolha a pasta de instalação. Não é necessário ser administrador.
2. Se o Windows SmartScreen avisar sobre editor desconhecido (build não assinado), clique em **Mais informações → Executar assim mesmo**.
3. Abra o DidiFlow pelo atalho da área de trabalho ou do menu Iniciar.

Para desinstalar: **Configurações do Windows → Aplicativos**. Seus dados ficam no Supabase. A sessão local fica em `%APPDATA%\didiflow` e é preservada.

## Primeiros passos

1. **Criar conta:** nome, e-mail e senha (mínimo de 8 caracteres, com maiúsculas, minúsculas e números). Confirme com o código de 6 dígitos enviado por e-mail.
2. **Configurações:** ajuste o fuso horário, o formato de data, o tema e as notificações.
3. **Organização:** cadastre projetos, categorias, tags e contextos de trabalho (opcional).
4. **Tarefas → Nova tarefa** (atalho `N` na lista): título, solicitante, links do Jira e do Slack, datas, estimativa, observações, projeto e tags.

## Dia a dia

| Tela                               | Para quê                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                          | Abertas, atrasadas, vencendo, entregas no prazo, tempo investido e gráficos do período                                                            |
| Hoje                               | Lista de prioridades do dia, com sugestões (atrasadas, vencendo, alta prioridade)                                                                 |
| Foco                               | Sessões de foco cronometradas (25/50/90 min), opcionalmente registradas e lançadas como tempo                                                     |
| Tarefas                            | Lista com busca (`/`), filtros combinados, ordenação, paginação e ações por linha                                                                 |
| Quadro (Tarefas → ícone de quadro) | Kanban por status: arraste os cards entre colunas ou use o menu "Mover para" (acessível por teclado). Concluídas e canceladas dos últimos 14 dias |
| Calendário                         | Dia, semana e mês por data de início e entrega; `+` em um dia planeja uma tarefa                                                                  |
| KPIs                               | Os 10 indicadores, com fórmula, comparação com o período anterior e histórico                                                                     |
| Metas                              | Metas SMART com acompanhamento automático, e registros de cursos e certificações                                                                  |
| Tempo                              | Cronômetro (também na barra lateral), apontamentos manuais e totais                                                                               |
| Busca (`Ctrl+K`)                   | Título, descrição, solicitante, projeto, tags e observações, sem diferenciar acentos                                                              |

### Status e progresso

- Não iniciado = 0%; Em andamento = 1–99%; Concluído = 100%.
- Bloqueado e Cancelado preservam o progresso.
- Mover o controle de progresso ajusta o status automaticamente.
- Concluir registra a data efetiva de conclusão.
- Cancelar pede confirmação, e a tarefa pode ser reaberta.
- Tudo fica na aba **Atividade** da tarefa.

### Notificações

Lembretes por tarefa e avisos diários de atrasos e vencimentos aparecem **apenas com o aplicativo aberto** (mesmo minimizado). Clicar na notificação abre a tarefa. Desative em Configurações.

### Backup e restauração

**Menu da conta → Backup e restauração:** backups automáticos locais (frequência e retenção configuráveis), backup manual e restauração a partir de um backup local ou de um arquivo, nos modos **Mesclar** ou **Substituir**. Antes de restaurar, um backup de segurança é criado automaticamente.

### Exportação

**Configurações → Exportar dados:** tarefas, organização, tempo e KPIs em CSV (compatível com o Excel) ou JSON, além de uma cópia completa em JSON. Veja [backup-restore.md](backup-restore.md).

## Atalhos

| Atalho                    | Ação                   |
| ------------------------- | ---------------------- |
| `Ctrl+K`                  | Busca global           |
| `/` (na lista de tarefas) | Focar a busca da lista |
| `N` (na lista de tarefas) | Nova tarefa            |
| `Esc`                     | Fechar diálogos        |
