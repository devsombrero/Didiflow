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

## Exibição

Cada indicador mostra nome, descrição, fórmula, período, valor atual, comparação com o período anterior (quando há dados nos dois), meta opcional, histórico e o estado sem dados.

## Metas

Metas pessoais seguem o modelo SMART: indicador, valor-alvo, período (início e fim) e descrição da relevância.

## Cuidados

- Tempo registrado não é medida automática de produtividade nem de presença.
- Retrabalho depende de reaberturas registradas no histórico; não é inferido do status atual.

Casos-limite cobertos por testes: tarefas sem `completed_at`, canceladas, sem `due_date`, sem `start_date` e sem estimativa.
