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

**Notificações personalizadas** (menu lateral → Notificações):

- **Avisos próprios:** crie avisos com título, mensagem e som. A frequência pode ser:
  - uma vez (data e hora);
  - todo dia;
  - dias úteis;
  - dias da semana escolhidos;
  - a cada intervalo (15 min a 8 h), opcionalmente só dentro de um horário (ex.: das 09:00 às 18:00).
- **Na lista:** cada aviso mostra a próxima ocorrência e pode ser pausado, testado, editado ou excluído.
- **Atraso:** se o app ficou fechado, um aviso recorrente perdido há mais de 1 hora não é exibido atrasado; um aviso único é exibido até 24 horas depois.
- **Como aparecem:** todos os avisos, inclusive lembretes de tarefas, resumo de prazos e fim de foco, aparecem como cartão no canto da tela (com botão **Abrir** quando há algo para abrir) se a janela estiver em foco. Com a janela em segundo plano, aparecem como notificação do Windows.
- **Sino:** o sino ao lado do nome do app lista as últimas 100 notificações deste computador, com contador de não lidas.

**Animações e sons** (Configurações → Preferências): transições entre páginas, entrada suave de listas, confete ao concluir tarefas e efeitos sonoros curtos (sucesso, conclusão, notificação, erro, fim de foco), com volume ajustável e botão para ouvir cada som. As animações também são reduzidas quando o Windows está configurado para mostrar menos animações.

Os formulários de **tarefa**, **meta**, **registro de desenvolvimento** e **apontamento manual de tempo** abrem em janelas flutuantes sobre a tela atual. Feche com `Esc`, pelo `×` ou clicando fora; se a tarefa tiver alterações não salvas, o app pergunta antes de descartar. Os endereços `/tasks/new` e `/tasks/:id/edit` continuam abrindo o formulário em página inteira.

A **descrição** e as **observações** da tarefa aceitam Markdown: títulos, **negrito**, _itálico_, listas, checklists (`- [ ]`), citações, código e links. Use a barra de formatação (atalhos `Ctrl+B`, `Ctrl+I` e `Ctrl+K`) e a aba **Visualizar** para conferir antes de salvar. Links abrem no navegador padrão.

**Anexos** (detalhe da tarefa, aplicativo desktop):

- **Limite:** até 50 MB por tarefa, somando todos os arquivos.
- **Onde ficam:** os arquivos são copiados para `%APPDATA%\didiflow\attachments`, no próprio computador; o Supabase guarda só nome, tipo, tamanho e checksum.
- **Espaço em disco:** antes de copiar, o app confere a cota da tarefa e o espaço livre no disco, que precisa continuar com pelo menos 200 MB livres. O painel mostra o uso da cota e o espaço livre.
- **Ações:** abrir com o programa padrão, mostrar na pasta, salvar uma cópia e remover. Executáveis não são abertos diretamente.
- **Outro computador:** um anexo feito em outra máquina aparece como "arquivo não está neste computador".

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
