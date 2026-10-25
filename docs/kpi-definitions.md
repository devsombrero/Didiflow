# Definições de KPIs

Todos os indicadores são calculados a partir de dados reais. Quando faltam os registros necessários, o indicador exibe "dados insuficientes" em vez de um valor estimado.

Convenções:

- **Período**: intervalo `[início, fim]` no fuso horário configurado pelo usuário.
- **Concluída no período**: `status = done` e `completed_at` dentro do período.
- **Elegível para prazo**: concluída no período e com `due_date` preenchida.
- Tarefas canceladas, arquivadas ou excluídas não entram nas métricas de entrega.

| #   | Indicador                 | Fórmula                                                                        | Dados necessários                   |
| --- | ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| 1   | Volume de entregas        | `count(concluídas no período)`                                                 | —                                   |
| 2   | Cumprimento de prazos     | `count(elegíveis com data(completed_at) <= due_date) ÷ count(elegíveis) × 100` | `due_date`                          |
| 3a  | Taxa de atraso atual      | `count(abertas com due_date < hoje) ÷ count(abertas com due_date) × 100`       | `due_date`                          |
| 3b  | Atrasos históricos        | `count(concluídas no período com data(completed_at) > due_date)`               | `due_date`                          |
| 4   | Lead time                 | `média(data(completed_at) − start_date)` em dias, das concluídas no período    | `start_date`                        |
| 5   | Tempo de ciclo            | `média(completed_at − primeira transição para in_progress)`                    | histórico de status                 |
| 6   | Previsibilidade           | `Σ minutos registrados ÷ Σ estimated_minutes` das concluídas com ambos         | `estimated_minutes`, `time_entries` |
| 7   | Taxa de retrabalho        | `count(tarefas reabertas no período) ÷ count(concluídas no período) × 100`     | histórico de status                 |
| 8   | Distribuição de esforço   | `Σ minutos registrados` agrupado por categoria/projeto                         | `time_entries`                      |
| 9   | Evolução da produtividade | indicador 1 do período ÷ indicador 1 do período anterior equivalente − 1       | —                                   |
| 10  | Desenvolvimento pessoal   | `count(skill_achievements no período)` por tipo                                | `skill_achievements`                |

"Abertas" significa `status in (not_started, in_progress, blocked)`.

## Indicadores do dashboard

Calculados em `src/app/features/dashboard/metrics.ts` (funções puras, com testes) sobre as tarefas não excluídas, depois dos filtros de status, prioridade e categoria:

| Indicador                         | Definição                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Abertas                           | `status in (not_started, in_progress, blocked)` e não arquivadas                            |
| Em andamento / Bloqueadas         | Abertas com o status correspondente                                                         |
| Atrasadas                         | Abertas com `due_date < hoje`                                                               |
| Vencendo em até N dias            | Abertas com `hoje <= due_date <= hoje + N` (N vem das preferências)                         |
| Concluídas no período             | Indicador 1, incluindo tarefas arquivadas depois de concluídas                              |
| Entregas no prazo                 | Indicador 2                                                                                 |
| Conclusão das entregas do período | `count(done) ÷ count(não canceladas com due_date no período) × 100`                         |
| Progresso médio das abertas       | Média de `progress_percentage` das abertas                                                  |
| Tempo investido                   | Soma de `time_entries`; exibe "Sem registros de tempo" até existirem apontamentos           |
| Histórico de entregas             | Concluídas por semana (segunda-feira) ou mês, separadas em no prazo, com atraso e sem prazo |
| Distribuição por status           | Tarefas não arquivadas por status                                                           |
| Abertas por prioridade            | Abertas por prioridade                                                                      |

"Hoje" e a data de conclusão são calculados no fuso horário do usuário.

## Exibição

Cada indicador mostra nome, descrição, fórmula, período, valor atual, comparação com o período anterior (quando há dados nos dois), meta opcional, histórico e o estado sem dados.

## Implementação

Os indicadores 1–10 estão em `src/app/features/kpis/kpis.ts` (funções puras com testes de casos-limite). Detalhes de interpretação:

- **Taxa de atraso (3):** o valor é a foto atual das tarefas abertas com prazo vencido; o detalhe mostra as entregas atrasadas no período. Por ser uma foto, não é comparada com o período anterior.
- **Tempo de ciclo (5):** usa a primeira transição para `in_progress` registrada em `task_status_history`.
- **Previsibilidade (6):** só considera entregas do período com estimativa **e** tempo registrado; 100% = estimativa exata, acima de 100% = levou mais que o estimado.
- **Retrabalho (7):** conta transições de `done` para um status aberto. Reabrir uma tarefa cancelada não é retrabalho.
- **Distribuição de esforço (8):** agrupa o tempo pela categoria da tarefa no momento do cálculo.

Cada cartão mostra valor, descrição, fórmula, detalhe, comparação com o período anterior equivalente (quando ambos têm dados), metas associadas e o histórico dos últimos 6 períodos.

## Metas

Metas pessoais (`personal_goals`) seguem o modelo SMART:

- **Específica:** título;
- **Mensurável:** indicador, condição ("pelo menos" ou "no máximo") e valor-alvo;
- **Alcançável** e **Relevante:** textos livres;
- **Temporal:** início e fim.

A meta é avaliada no intervalo `[início, min(fim, hoje)]`. Estados possíveis: ainda não começou, em andamento, atingida, não atingida ou sem dados suficientes. Para metas de taxa de atraso, usa-se a taxa histórica de entregas atrasadas no intervalo, já que uma foto não tem intervalo. O tempo investido é medido em horas.

## Cuidados

- Tempo registrado não é medida automática de produtividade nem de presença.
- Retrabalho depende de reaberturas registradas no histórico; não é inferido do status atual.

Casos-limite cobertos por testes: tarefas sem `completed_at`, canceladas, sem `due_date`, sem `start_date` e sem estimativa.
