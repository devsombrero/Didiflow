## DidiFlow — Gestão Pessoal de Demandas

Desktop · Electron · Angular · Supabase

## Prompt completo para desenvolvimento

Escrita

# PROMPT — Desenvolvimento do DidiFlow

## 1\. Papel e objetivo

Atue como um engenheiro de software sênior, arquiteto de aplicações desktop e especialista em Electron, Angular, TypeScript, Supabase, UX/UI e boas práticas de engenharia de software.

Desenvolva uma aplicação desktop chamada **DidiFlow**, destinada à gestão de demandas pessoais, organização do trabalho diário, acompanhamento de entregas e análise de indicadores individuais de produtividade.

A aplicação deverá funcionar como um CRUD completo de tarefas, com recursos adicionais para planejamento, acompanhamento de progresso, gestão de prazos, registro de atividades e visualização de KPIs pessoais.

O desenvolvimento deverá ser incremental, organizado por features, com branches e commits Git independentes para cada funcionalidade.

Não implemente tudo em um único commit ou em uma única branch.

Antes de implementar qualquer funcionalidade, analise a estrutura existente do projeto. Se já houver código, preserve o que estiver funcionando e adapte a arquitetura sem reescrever partes desnecessariamente.

## 2\. Stack tecnológica obrigatória

- Electron para execução como aplicação desktop.
- Angular com TypeScript para a interface.
- Supabase como backend gerenciado.
- Supabase Auth para autenticação.
- Supabase PostgreSQL para persistência de dados.
- Supabase Row Level Security (RLS) para isolamento dos dados por usuário.
- Supabase Storage, somente se houver necessidade real de armazenar anexos.
- Angular Router para navegação.
- Reactive Forms para formulários e validações.
- Biblioteca de gráficos compatível com Angular para dashboards.
- SCSS para estilos.
- ESLint e Prettier para padronização.
- Vitest, Jest ou ferramenta de testes compatível com a versão Angular escolhida.
- Playwright ou ferramenta equivalente para testes de fluxos críticos, quando viável.

Escolha versões estáveis e compatíveis entre si no momento da implementação. Registre as decisões técnicas e não utilize APIs obsoletas.

Utilize um gerenciador de pacotes único para todo o projeto.

## 3\. Arquitetura e segurança

Organize o projeto de forma modular, priorizando separação de responsabilidades, manutenibilidade, testabilidade e baixo acoplamento.

Estruture a aplicação em três partes:

### Electron

- Processo principal responsável pelo ciclo de vida da aplicação.
- Janela principal e configuração de inicialização.
- Preload com API explícita e tipada.
- Comunicação IPC apenas para operações que realmente precisem de recursos nativos.
- Context isolation habilitado.
- Node integration desabilitado na interface Angular.
- Sandbox habilitado quando compatível com a arquitetura adotada.
- Tratamento de erros e encerramento seguro.
- Configuração de empacotamento para os sistemas operacionais definidos no projeto.

### Angular

- Organização por features.
- Componentes reutilizáveis.
- Serviços responsáveis por regras de negócio e acesso aos dados.
- Interfaces e tipos TypeScript compartilhados de maneira controlada.
- Rotas protegidas.
- Formulários com validação.
- Estados de carregamento, erro, vazio e sucesso.
- Layout responsivo para diferentes dimensões de janela.

### Supabase

- Banco PostgreSQL com migrations versionadas.
- Políticas RLS para todas as tabelas com dados privados.
- Relacionamentos e índices adequados.
- Restrições de integridade.
- Consultas paginadas quando necessário.
- Variáveis de ambiente para configuração.
- Nunca exponha a service\_role key no frontend ou no pacote Electron.
- Nunca confie no frontend para impor autorização.
- Não armazene senhas manualmente.
- Não execute SQL de schema automaticamente em produção.

No Electron, não exponha objetos arbitrários do Node.js ao Angular. Utilize APIs explícitas no preload e valide os dados recebidos via IPC.

Documente a estratégia de configuração e proteção das credenciais do Supabase.

## 4\. Funcionalidades principais

### Feature 1 — Autenticação e perfil

Implemente:

- Cadastro, login e logout.
- Recuperação de senha.
- Persistência segura da sessão, considerando as particularidades do Electron.
- Perfil do usuário.
- Nome de exibição.
- Preferências de tema.
- Preferências de notificações.
- Fuso horário e preferências de formato de data.

Todo usuário autenticado deve visualizar exclusivamente os dados que tem autorização para acessar.

### Feature 2 — Cadastro e gerenciamento de demandas

Implemente um CRUD completo de tarefas com:

- Criar tarefa.
- Consultar tarefa.
- Editar tarefa.
- Excluir tarefa, com confirmação.
- Cancelar tarefa.
- Reabrir tarefa cancelada, se permitido pela regra de negócio.
- Alterar status.
- Atualizar percentual de progresso.
- Pesquisar e filtrar.
- Ordenar e paginar.
- Duplicar tarefa.
- Arquivar tarefas antigas.

Campos obrigatórios ou relevantes:

- Título da demanda.
- Descrição.
- Data da solicitação.
- Pessoa solicitante.
- Existência de card no Jira.
- URL do card no Jira.
- Existência de thread no Slack.
- URL da thread no Slack.
- Observações.
- Data de início.
- Data prevista de entrega.
- Data efetiva de conclusão.
- Status.
- Percentual de progresso.
- Prioridade.
- Categoria ou tipo de demanda.
- Estimativa de esforço.
- Tempo efetivamente dedicado, quando registrado.
- Tags.
- Data de criação e última atualização.

Valide URLs, datas e campos obrigatórios. A data prevista de entrega não deve ser anterior à data de início, salvo se uma regra explicitamente documentada permitir isso.

A data de solicitação pode ser diferente da data de criação do registro.

### Feature 3 — Status e progresso

Defina um fluxo de status consistente:

- Não iniciado.
- Em andamento.
- Bloqueado.
- Concluído.
- Cancelado.

O status e o percentual de progresso precisam permanecer consistentes.

Regras iniciais:

- Não iniciado: 0%.
- Em andamento: de 1% a 99%.
- Bloqueado: preserva o progresso já alcançado.
- Concluído: 100%.
- Cancelado: mantém o histórico do percentual atingido.

Permita ajustar o progresso manualmente nas tarefas em andamento.

Exiba uma barra de progresso visual, percentual numérico e data prevista de entrega.

Quando uma tarefa for concluída, registre a data efetiva de conclusão. Ao reabrir uma tarefa, preserve o histórico e não apague os registros anteriores.

### Feature 4 — Dashboard pessoal

Crie um dashboard inicial com:

- Total de tarefas abertas.
- Tarefas em andamento.
- Tarefas concluídas no período.
- Tarefas bloqueadas.
- Tarefas atrasadas.
- Tarefas próximas do vencimento.
- Percentual de conclusão.
- Progresso médio das tarefas ativas.
- Entregas realizadas no prazo.
- Tempo investido, quando houver registros de tempo.
- Evolução semanal e mensal.

Inclua gráficos de produtividade, distribuição por status, tarefas por prioridade e histórico de entregas.

Permita filtrar os indicadores por período, status, prioridade e categoria.

Não apresente dados fictícios como se fossem dados reais. Em contas novas, mostre estados vazios com orientações para começar.

### Feature 5 — KPIs pessoais

Implemente indicadores com fórmulas documentadas e resultados calculados a partir dos dados reais.

1. Volume de entregas: quantidade de tarefas concluídas no período.
2. Cumprimento de prazos: percentual de tarefas elegíveis concluídas até a data prevista.
3. Taxa de atraso: percentual de tarefas vencidas e ainda não concluídas, além de uma métrica histórica de atrasos.
4. Lead time: tempo entre a data de início e a conclusão.
5. Tempo de ciclo: tempo entre o início efetivo do trabalho e a conclusão, se esses eventos forem registrados separadamente.
6. Previsibilidade: relação entre esforço estimado e esforço efetivamente registrado.
7. Taxa de retrabalho: tarefas reabertas ou devolvidas para revisão, quando esses eventos forem registrados.
8. Distribuição de esforço: tempo dedicado por categoria, projeto ou tipo de atividade.
9. Evolução da produtividade: comparação entre períodos equivalentes.
10. Desenvolvimento pessoal: cursos, habilidades e certificações registrados.

Cada indicador deve apresentar:

- Nome.
- Descrição.
- Fórmula.
- Período analisado.
- Valor atual.
- Comparação com o período anterior, quando houver dados suficientes.
- Meta opcional.
- Histórico.
- Estado sem dados suficientes.

Não invente horas trabalhadas, erros, retrabalho ou aprendizado. Quando não houver registros necessários, informe que o indicador ainda não pode ser calculado.

Utilize a metodologia SMART para permitir metas pessoais específicas, mensuráveis, alcançáveis, relevantes e temporais.

### Feature 6 — Calendário e planejamento

Implemente:

- Visão diária, semanal e mensal.
- Exibição de tarefas por data de início e vencimento.
- Identificação de atrasos.
- Planejamento de tarefas futuras.
- Filtros por prioridade e status.
- Acesso rápido aos detalhes da tarefa.
- Indicadores visuais para tarefas urgentes.

Considere o fuso horário configurado pelo usuário.

### Feature 7 — Histórico e auditoria

Mantenha um histórico de alterações relevantes:

- Criação.
- Alterações de campos.
- Mudanças de status.
- Mudanças de progresso.
- Reabertura.
- Cancelamento.
- Conclusão.
- Exclusão ou arquivamento.

Registre o usuário responsável, data e hora e, quando apropriado, valores anteriores e novos valores.

Não permita que o usuário edite livremente o histórico de auditoria.

Para exclusões definitivas, defina claramente a política de retenção do histórico. Prefira arquivamento ou exclusão lógica quando isso atender à necessidade do produto.

### Feature 8 — Registro de tempo

Implemente uma funcionalidade opcional de apontamento de tempo:

- Iniciar atividade.
- Pausar.
- Retomar.
- Finalizar.
- Registrar tempo manualmente.
- Associar o registro a uma tarefa.
- Adicionar descrição do trabalho realizado.
- Consultar totais por dia, semana, mês e categoria.

Impeça cronômetros simultâneos para o mesmo usuário, se essa for a regra definida.

Utilize timestamps persistidos para que o registro não dependa de a janela Electron permanecer aberta.

Não trate tempo registrado como medida automática de produtividade ou presença.

### Feature 9 — Notificações e foco

Implemente:

- Avisos de vencimento próximo.
- Alertas de tarefas atrasadas.
- Lembretes configuráveis.
- Lista de prioridades do dia.
- Modo foco associado a uma tarefa.
- Registro opcional de sessões de foco.
- Preferências para desativar notificações.

Utilize notificações nativas do Electron apenas quando apropriado e respeite as permissões e preferências do usuário.

Não prometa execução em segundo plano quando o aplicativo estiver completamente encerrado.

### Feature 10 — Projetos, categorias e tags

Permita organizar tarefas por:

- Projetos.
- Categorias.
- Tags.
- Prioridades.
- Solicitantes.
- Contextos de trabalho.

Uma tarefa pode pertencer a um projeto e ter várias tags.

Inclua filtros combinados e permita visualizar KPIs por projeto e categoria.

### Feature 11 — Busca global

Implemente uma busca que encontre tarefas por:

- Título.
- Descrição.
- Solicitante.
- Projeto.
- Tags.
- Observações.

Inclua filtros rápidos e destaque os resultados relevantes.

### Feature 12 — Exportação e backup

Implemente exportação para CSV e JSON.

Permita exportar tarefas, projetos, registros de tempo e indicadores, respeitando os dados disponíveis e as permissões do usuário.

Documente como restaurar dados e como lidar com conflitos.

Não considere exportação um substituto para backups reais do PostgreSQL.

### Feature 13 — Integrações futuras

Prepare uma arquitetura extensível para integrações com:

- Jira.
- Slack.
- GitHub ou GitLab.
- Google Calendar.

Na primeira versão, os links do Jira e Slack podem ser cadastrados manualmente e abertos pelo aplicativo.

Não implemente chamadas falsas a APIs externas.

Uma integração real deverá utilizar autenticação adequada, tratamento de erros, configuração de credenciais e respeito às permissões dos serviços.

## 5\. Modelo de dados

Projete o banco de dados antes de implementar os componentes.

Considere, no mínimo, as seguintes entidades:

- profiles
- tasks
- projects
- categories
- tags
- task\_tags
- task\_status\_history
- task\_activity\_logs
- time\_entries
- personal\_goals
- skill\_achievements
- user\_preferences

Avalie a necessidade de tabelas adicionais para auditoria, notificações e sessões de foco.

A tabela tasks deve contemplar os campos descritos na Feature 2, incluindo owner\_id, requester\_name, requested\_at, jira\_url, slack\_thread\_url, start\_date, due\_date, completed\_at, status, progress\_percentage, priority, estimated\_minutes e timestamps.

Use UUIDs como identificadores quando apropriado.

Adote enums ou restrições de banco para os campos com valores controlados, de acordo com a estratégia de migrations.

Crie índices para consultas frequentes, como usuário, status, data de entrega, prioridade e data de atualização.

Defina chaves estrangeiras, regras de exclusão e restrições de integridade.

Toda tabela que contenha dados privados deve possuir políticas RLS adequadas.

Não confie exclusivamente em filtros Angular para separar os dados de cada usuário.

## 6\. Organização de pastas

Adote uma estrutura modular semelhante a:

src/ app/ core/ auth/ guards/ services/ interceptors/ shared/ components/ directives/ pipes/ models/ features/ dashboard/ tasks/ projects/ calendar/ time-tracking/ kpis/ goals/ reports/ settings/ layouts/ app.routes.ts

electron/ main.ts preload.ts ipc/

supabase/ migrations/ seed.sql

docs/ architecture.md database.md security.md development-workflow.md kpi-definitions.md

Ajuste a estrutura às convenções da versão Angular escolhida, sem criar abstrações desnecessárias.

## 7\. Estratégia de Git: branches por feature

Utilize Git Flow simplificado, com a branch principal main e uma branch integration ou develop para integração, conforme a estratégia definida no repositório.

Crie uma branch separada para cada feature.

Padrão de nomes:

- feature/project-setup
- feature/electron-shell
- feature/supabase-auth
- feature/task-crud
- feature/task-progress
- feature/dashboard
- feature/personal-kpis
- feature/calendar
- feature/task-history
- feature/time-tracking
- feature/notifications
- feature/projects-tags
- feature/global-search
- feature/data-export
- feature/testing-ci
- feature/packaging-release

Para correções, utilize:

- fix/nome-da-correcao

Para manutenção:

- chore/nome-da-atividade

Cada branch deve partir da branch de integração definida no projeto.

Implemente e teste a feature antes de integrá-la.

Ao concluir uma feature:

1. Execute lint.
2. Execute os testes relevantes.
3. Execute o build.
4. Revise as alterações.
5. Crie commits com escopo específico.
6. Atualize a documentação quando necessário.
7. Integre a branch somente após validação.
8. Resolva conflitos preservando o comportamento esperado.
9. Não avance para uma feature dependente enquanto a base necessária não estiver integrada.

Não crie todas as branches antecipadamente se isso gerar branches desatualizadas. Crie-as à medida que o trabalho for iniciado.

## 8\. Padrão de commits

Utilize Conventional Commits.

Exemplos:

feat(tasks): add task creation form

feat(tasks): implement task editing

feat(tasks): add task cancellation flow

feat(tasks): display progress percentage

feat(kpis): calculate on-time delivery rate

feat(dashboard): add productivity summary

feat(auth): integrate Supabase authentication

fix(tasks): validate due date against start date

test(tasks): cover task status transitions

docs(kpis): document calculation formulas

refactor(tasks): extract task validation service

chore(electron): configure secure preload

Cada commit deve representar uma alteração pequena, coerente e revisável.

Não misture mudanças de dashboard, autenticação e banco de dados em um único commit sem necessidade.

Não crie commits vazios, não reescreva histórico compartilhado sem autorização e não utilize comandos destrutivos sem confirmação.

Não declare uma branch integrada sem verificar o resultado real da operação.

## 9\. Interface e experiência do usuário

Crie uma interface desktop moderna, limpa, profissional e orientada à produtividade.

Utilize:

- Sidebar com navegação.
- Dashboard com cards de indicadores.
- Tabela de tarefas com filtros.
- Visualização Kanban opcional.
- Formulários organizados em seções.
- Barras de progresso.
- Indicadores de prioridade.
- Badges discretos para status.
- Modais ou painéis para edição rápida.
- Confirmação para ações destrutivas.
- Toasts para feedback.
- Estados de carregamento e erro.
- Tema claro e escuro.
- Atalhos de teclado úteis.

Priorize acessibilidade, contraste, navegação por teclado e mensagens claras.

Evite excesso de elementos visuais e gráficos sem utilidade prática.

## 10\. Testes e qualidade

Implemente testes para:

- Criação, edição, cancelamento e exclusão de tarefas.
- Validação de campos.
- Transições de status.
- Cálculo do progresso.
- Cálculo de KPIs.
- Tarefas atrasadas.
- Datas e fusos horários.
- Registro de tempo.
- Permissões e políticas RLS.
- Autenticação.
- Fluxos críticos da interface.
- Comunicação segura entre Electron e Angular.
- Exportação de dados.

Teste especialmente os limites das fórmulas, como tarefas sem data de conclusão, tarefas canceladas e tarefas sem estimativa de esforço.

Não considere testes de frontend suficientes para validar a segurança do banco.

## 11\. CI/CD e distribuição

Configure pipeline de integração contínua para:

- Instalação reproduzível de dependências.
- Verificação de formatação.
- Lint.
- Testes.
- Build Angular.
- Build Electron.
- Verificação de migrations.
- Empacotamento quando aplicável.

Prepare a distribuição para os sistemas operacionais definidos pelo projeto.

Documente assinatura de aplicativos, atualização de versões e gestão de segredos quando aplicável.

Não inclua arquivos .env com credenciais reais no repositório.

## 12\. Plano de execução obrigatório

Siga esta ordem:

Fase 1 — Diagnóstico e planejamento

- Inspecionar o repositório.
- Verificar versões e dependências.
- Definir arquitetura.
- Criar documentação inicial.
- Propor o backlog e o grafo de dependências entre features.

Fase 2 — Fundação

- Configurar Angular.
- Configurar Electron.
- Definir regras de segurança.
- Configurar lint, testes e build.
- Criar a estrutura de migrations do Supabase.

Fase 3 — Dados e autenticação

- Criar schema inicial.
- Implementar RLS.
- Implementar autenticação.
- Testar isolamento dos dados.

Fase 4 — MVP

- Implementar CRUD de tarefas.
- Implementar status e progresso.
- Implementar filtros e busca básica.
- Criar dashboard inicial.
- Implementar histórico mínimo.

Fase 5 — Indicadores e planejamento

- Implementar KPIs.
- Implementar calendário.
- Implementar metas pessoais.
- Implementar projetos e tags.

Fase 6 — Funcionalidades adicionais

- Registro de tempo.
- Notificações.
- Modo foco.
- Exportação.
- Integrações futuras.

Fase 7 — Qualidade e entrega

- Completar testes.
- Revisar segurança.
- Validar migrations.
- Corrigir problemas.
- Gerar builds.
- Documentar instalação e uso.

Cada fase deve respeitar o fluxo de branches e commits definido anteriormente.

## 13\. Critérios de aceite do MVP

O MVP será considerado funcional quando:

- O usuário conseguir autenticar-se.
- O usuário conseguir criar, listar, editar, cancelar e excluir tarefas.
- Os campos de solicitação, Jira, Slack, início, entrega e observações estiverem disponíveis.
- O progresso for exibido visualmente.
- Os status respeitarem as regras de negócio.
- Os dados persistirem no Supabase.
- O isolamento por usuário estiver protegido por RLS.
- O dashboard apresentar informações reais.
- Os KPIs possuírem fórmulas documentadas.
- Os testes principais estiverem passando.
- O aplicativo iniciar e puder ser empacotado.
- A documentação de configuração estiver completa.
- O histórico Git apresentar branches e commits coerentes.

## 14\. Forma de trabalho da IA

Trabalhe como um agente de desenvolvimento que executa e valida mudanças, não apenas como um gerador de exemplos.

Antes de cada etapa:

1. Informe o objetivo.
2. Liste os arquivos que pretende criar ou alterar.
3. Identifique dependências e riscos.
4. Implemente a menor unidade funcional possível.

Depois de cada etapa:

1. Execute os testes disponíveis.
2. Informe os comandos executados e os resultados reais.
3. Liste os arquivos alterados.
4. Apresente os commits criados e a branch utilizada.
5. Informe problemas encontrados.
6. Registre o que ficou pendente.

Não invente resultados de testes, commits, branches, integrações ou deploys.

Se não houver acesso ao terminal ou ao repositório, forneça os comandos e instruções sem afirmar que foram executados.

Não tente implementar todas as features em uma única resposta. Trabalhe incrementalmente, mantenha o contexto e aguarde validação quando uma decisão importante ou dependência externa bloquear a próxima etapa.

**Comece agora pela Fase 1: analise o repositório atual, proponha a arquitetura, apresente o backlog priorizado e defina a sequência de branches e commits para entregar primeiro um MVP funcional.**

## Features que mais agregariam valor

Além do CRUD solicitado, eu priorizaria estas funcionalidades para transformar o projeto em uma ferramenta realmente útil no dia a dia.

Work Planning Dashboard - Desktop App Concept by Bato on Dribbble

### 1. Dashboard executivo pessoal

Alta prioridadeVisualizar entregas concluídas, tarefas atrasadas, demandas em andamento e desempenho semanal em uma única tela.

Benefício: entender rapidamente como está sua produtividade.

MODERN KANBAN BOARD INTERFACE by Dino on Dribbble

### 2. Quadro Kanban

Alta prioridadeOrganizar demandas por status, com movimentação entre colunas e atualização consistente dos dados.

Benefício: visualizar gargalos e identificar tarefas paradas.

What is Focus Time? Ultimate Guide & Benchmarks | Reclaim

### 3. Apontamento de horas e modo foco

Registrar o tempo dedicado a cada demanda e comparar o esforço estimado com o realizado.

Benefício: melhorar estimativas e entender onde o tempo está sendo investido.

HabitGenius - #1 Habit Tracker & Life Management App | Free

### 4. Metas SMART e evolução profissional

Criar metas mensais de entregas, aprendizado, certificações e redução de atrasos, com acompanhamento de progresso.

Benefício: acompanhar evolução, não apenas volume de trabalho.

Features - TickTick

### 5. Histórico de atividades e retrabalho

Registrar alterações, reaberturas, bloqueios e motivos de atraso.

Benefício: entender por que algumas demandas levam mais tempo que o previsto.

## KPIs que eu colocaria no dashboard

| Indicador | Como calcular |
| --- | --- |
| Entregas realizadas | Quantidade de tarefas concluídas no período |
| Entregas no prazo | Tarefas concluídas até a data prevista ÷ tarefas concluídas elegíveis × 100 |
| Tarefas atrasadas | Quantidade de tarefas abertas cuja data prevista já passou |
| Lead time médio | Média do tempo entre início e conclusão |
| Precisão das estimativas | Comparação entre tempo estimado e tempo realizado |
| Taxa de retrabalho | Tarefas reabertas ÷ tarefas concluídas elegíveis × 100 |
| Evolução mensal | Comparação de entregas entre períodos equivalentes |
| Desenvolvimento | Cursos, habilidades e certificações registrados |

Um cuidado importante: não misture produtividade com quantidade de horas online. Entregas, qualidade, previsibilidade e aprendizado são indicadores diferentes. Para calcular retrabalho e qualidade de forma confiável, o sistema precisa registrar revisões, reaberturas ou erros; não basta inferi-los a partir do status.

## Ordem recomendada para criar as branches

1. `feature/project-setup`
   Estrutura inicial, Angular, Electron, lint, testes e documentação.
2. `feature/supabase-auth`
   Configuração do Supabase, autenticação, schema e RLS.
3. `feature/task-crud`
   Cadastro, edição, consulta, exclusão e cancelamento de tarefas.
4. `feature/task-progress`
   Status, percentual de progresso, prazos e histórico.
5. `feature/dashboard`
   Cards de resumo, filtros e gráficos iniciais.
6. `feature/personal-kpis`
   Fórmulas, metas e indicadores calculados a partir dos dados reais.
7. `feature/calendar`
   Calendário e planejamento das demandas.
8. `feature/time-tracking`
   Cronômetro, apontamentos e análise de esforço.
9. `feature/packaging-release`
   Empacotamento, build de distribuição e checklist final.

Essa sequência é uma proposta de execução, não uma afirmação de que as branches já foram criadas. Cada uma deve partir da branch de integração definida no repositório, e as dependências devem ser integradas antes de iniciar o trabalho que depende delas.

Minha recomendação: comece com autenticação, CRUD, progresso e dashboard. Deixe calendário, cronômetro, notificações e integrações reais com Jira e Slack para as próximas versões. Assim, você terá um MVP útil sem transformar o projeto inicial em algo grande demais.