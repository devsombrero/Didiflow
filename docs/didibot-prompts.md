# Base de prompts do DidiBot

Prompts prontos de **DidiBot → Biblioteca de prompts** (fonte:
`src/app/features/didibot/didibot-prompts.ts`). O texto entre colchetes é o que você preenche: ao
escolher um prompt, o primeiro trecho entre colchetes já vem selecionado na caixa de mensagem.

Os prompts marcados com ✳️ fazem o DidiBot **propor** projetos e tarefas, que só são criados depois
da sua confirmação. Para salvar prompts seus, escreva a mensagem e use **Salvar prompt** (ficam em
"Meus prompts", neste computador).

## Planejamento

| Prompt                | Para quê                                                       | Texto                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Planejar meu dia      | Agenda do dia com blocos de foco a partir das tarefas abertas. | Monte um plano para hoje com blocos de tempo (manhã e tarde), considerando prazos, prioridades e as horas que já registrei. Deixe espaço para imprevistos.               |
| Planejar a semana     | Distribui as tarefas pelos próximos 5 dias úteis.              | Monte um plano para os próximos 5 dias úteis com as minhas tarefas abertas, respeitando os prazos e equilibrando a carga de cada dia.                                    |
| Planejar uma sprint   | Seleciona o que cabe em uma sprint de duas semanas.            | Planeje uma sprint de 2 semanas com [quantas horas por semana] horas de capacidade: escolha as tarefas abertas que cabem, em ordem, e diga o que fica de fora e por quê. |
| Cabe na minha agenda? | Compara estimativas com a capacidade até uma data.             | Até [data], tenho cerca de [horas] horas disponíveis. As minhas tarefas abertas cabem nesse período? O que devo renegociar?                                              |

## Prioridades

| Prompt                 | Para quê                                                     | Texto                                                                                                                  |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| O que priorizar agora? | As 3 tarefas mais importantes no momento, com justificativa. | Quais 3 tarefas devo priorizar agora e por quê?                                                                        |
| Tarefas em risco       | O que pode atrasar e como evitar.                            | Quais tarefas estão em risco de atrasar e o que posso fazer para evitar?                                               |
| Matriz de Eisenhower   | Classifica as tarefas em urgente/importante.                 | Classifique as minhas tarefas abertas na matriz de Eisenhower (fazer agora, agendar, delegar, eliminar) em uma tabela. |
| Destravar bloqueios    | Próximos passos para as tarefas bloqueadas.                  | Liste as tarefas bloqueadas e sugira um próximo passo concreto e uma mensagem curta para destravar cada uma.           |

## Criar no DidiFlow

| Prompt                           | Para quê                                                  | Texto                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criar projeto com tarefas ✳️     | Projeto novo já dividido em tarefas com prazos.           | Crie um projeto chamado [nome do projeto] para [objetivo]. Divida em 5 a 8 tarefas com prioridade, estimativa em horas e prazos até [data final]. |
| Épico com subtarefas ✳️          | Um épico, suas tarefas e as subtarefas de cada uma.       | Crie um épico "[nome do épico]" no projeto [projeto], com as tarefas necessárias e de 2 a 4 subtarefas em cada uma.                               |
| Tarefas a partir de anotações ✳️ | Transforma anotações ou uma ata em tarefas.               | Transforme estas anotações em tarefas no DidiFlow, com prioridade e prazo quando houver: [cole aqui as anotações ou a ata da reunião]             |
| Quebrar uma meta em tarefas ✳️   | Do objetivo ao plano executável.                          | Quero atingir esta meta: [meta] até [data]. Crie as tarefas para chegar lá, em ordem, com estimativas e prazos intermediários.                    |
| Tarefas recorrentes da semana ✳️ | Cria as tarefas de rotina da próxima semana.              | Crie as tarefas da minha rotina da próxima semana: [descreva a rotina, por exemplo: relatório às segundas, reunião de time às quartas].           |
| Atualizar andamento ✳️           | Atualiza status, progresso e prazos pelo que você contar. | Atualize as minhas tarefas com este andamento: [ex.: terminei o layout, o gateway está em 80% e o contrato ficou para sexta].                     |

## Relatórios

| Prompt                         | Para quê                                      | Texto                                                                                                                                     |
| ------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Resumo do meu dia              | Atrasadas, vencendo hoje e horas registradas. | Faça um resumo do meu dia: o que está atrasado, o que vence hoje e as horas de hoje.                                                      |
| Status report para o gestor    | Resumo semanal pronto para enviar.            | Escreva um status report semanal para o meu gestor: entregas, andamento por projeto, riscos e próximos passos. Tom profissional e direto. |
| Situação de um projeto         | Andamento, prazos e riscos de um projeto.     | Como está o projeto [nome do projeto]? Resuma andamento, prazos, riscos e o que falta.                                                    |
| Daily (ontem, hoje, bloqueios) | Fala pronta para a reunião diária.            | Prepare a minha fala da daily: o que fiz ontem, o que farei hoje e os bloqueios.                                                          |

## Escrita

| Prompt                      | Para quê                                               | Texto                                                                                                                          |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Descrição de tarefa         | Objetivo, critérios de aceite e checklist em Markdown. | Escreva uma descrição em Markdown para a tarefa "[título]": objetivo, critérios de aceite e um checklist.                      |
| Mensagem para o solicitante | Atualização educada sobre prazo ou andamento.          | Escreva uma mensagem curta e educada para [solicitante] sobre a tarefa "[título]": [o que precisa comunicar, ex.: novo prazo]. |
| Renegociar um prazo         | Argumentos e proposta de nova data.                    | Ajude a renegociar o prazo da tarefa "[título]": explique o motivo com base nos dados e proponha uma nova data realista.       |

## Revisão e melhoria

| Prompt                         | Para quê                                        | Texto                                                                                                                               |
| ------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Minhas estimativas estão boas? | Compara horas registradas com estimativas.      | Compare as horas registradas com as estimativas das minhas tarefas e diga se costumo subestimar ou superestimar, com dicas.         |
| Retrospectiva da semana        | O que foi bem, o que melhorar e um compromisso. | Faça uma retrospectiva curta da minha semana: o que foi bem, o que pode melhorar e um compromisso para a próxima.                   |
| Faxina nas tarefas             | Tarefas paradas, duplicadas ou sem prazo.       | Revise as minhas tarefas abertas e aponte as paradas, as sem prazo e as que parecem duplicadas, sugerindo o que fazer com cada uma. |
