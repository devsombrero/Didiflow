import { Injectable, signal } from '@angular/core';

export type PromptCategory =
  'planejamento' | 'prioridades' | 'criar' | 'relatorios' | 'escrita' | 'revisao';

export interface LibraryPrompt {
  id: string;
  category: PromptCategory;
  title: string;
  description: string;
  icon: string;
  /** Text placed in the message box; [entre colchetes] marks what to fill in. */
  prompt: string;
  /** DidiBot will propose projects/tasks to confirm. */
  creates?: boolean;
}

export const PROMPT_CATEGORIES: readonly { id: PromptCategory; label: string; icon: string }[] = [
  { id: 'planejamento', label: 'Planejamento', icon: 'event_note' },
  { id: 'prioridades', label: 'Prioridades', icon: 'priority_high' },
  { id: 'criar', label: 'Criar no DidiFlow', icon: 'add_task' },
  { id: 'relatorios', label: 'Relatórios', icon: 'summarize' },
  { id: 'escrita', label: 'Escrita', icon: 'edit_note' },
  { id: 'revisao', label: 'Revisão e melhoria', icon: 'insights' },
];

/** Built-in prompt library (pt-BR). */
export const PROMPT_LIBRARY: readonly LibraryPrompt[] = [
  // Planejamento
  {
    id: 'plan-day',
    category: 'planejamento',
    title: 'Planejar meu dia',
    description: 'Agenda do dia com blocos de foco a partir das tarefas abertas.',
    icon: 'today',
    prompt:
      'Monte um plano para hoje com blocos de tempo (manhã e tarde), considerando prazos, prioridades e as horas que já registrei. Deixe espaço para imprevistos.',
  },
  {
    id: 'plan-week',
    category: 'planejamento',
    title: 'Planejar a semana',
    description: 'Distribui as tarefas pelos próximos 5 dias úteis.',
    icon: 'date_range',
    prompt:
      'Monte um plano para os próximos 5 dias úteis com as minhas tarefas abertas, respeitando os prazos e equilibrando a carga de cada dia.',
  },
  {
    id: 'plan-sprint',
    category: 'planejamento',
    title: 'Planejar uma sprint',
    description: 'Seleciona o que cabe em uma sprint de duas semanas.',
    icon: 'directions_run',
    prompt:
      'Planeje uma sprint de 2 semanas com [quantas horas por semana] horas de capacidade: escolha as tarefas abertas que cabem, em ordem, e diga o que fica de fora e por quê.',
  },
  {
    id: 'plan-capacity',
    category: 'planejamento',
    title: 'Cabe na minha agenda?',
    description: 'Compara estimativas com a capacidade até uma data.',
    icon: 'hourglass_bottom',
    prompt:
      'Até [data], tenho cerca de [horas] horas disponíveis. As minhas tarefas abertas cabem nesse período? O que devo renegociar?',
  },
  // Prioridades
  {
    id: 'prio-now',
    category: 'prioridades',
    title: 'O que priorizar agora?',
    description: 'As 3 tarefas mais importantes no momento, com justificativa.',
    icon: 'priority_high',
    prompt: 'Quais 3 tarefas devo priorizar agora e por quê?',
  },
  {
    id: 'prio-risk',
    category: 'prioridades',
    title: 'Tarefas em risco',
    description: 'O que pode atrasar e como evitar.',
    icon: 'warning',
    prompt: 'Quais tarefas estão em risco de atrasar e o que posso fazer para evitar?',
  },
  {
    id: 'prio-eisenhower',
    category: 'prioridades',
    title: 'Matriz de Eisenhower',
    description: 'Classifica as tarefas em urgente/importante.',
    icon: 'grid_view',
    prompt:
      'Classifique as minhas tarefas abertas na matriz de Eisenhower (fazer agora, agendar, delegar, eliminar) em uma tabela.',
  },
  {
    id: 'prio-blocked',
    category: 'prioridades',
    title: 'Destravar bloqueios',
    description: 'Próximos passos para as tarefas bloqueadas.',
    icon: 'lock_open',
    prompt:
      'Liste as tarefas bloqueadas e sugira um próximo passo concreto e uma mensagem curta para destravar cada uma.',
  },
  // Criar no DidiFlow
  {
    id: 'create-project',
    category: 'criar',
    title: 'Criar projeto com tarefas',
    description: 'Projeto novo já dividido em tarefas com prazos.',
    icon: 'create_new_folder',
    creates: true,
    prompt:
      'Crie um projeto chamado [nome do projeto] para [objetivo]. Divida em 5 a 8 tarefas com prioridade, estimativa em horas e prazos até [data final].',
  },
  {
    id: 'create-epic',
    category: 'criar',
    title: 'Épico com subtarefas',
    description: 'Um épico, suas tarefas e as subtarefas de cada uma.',
    icon: 'bolt',
    creates: true,
    prompt:
      'Crie um épico "[nome do épico]" no projeto [projeto], com as tarefas necessárias e de 2 a 4 subtarefas em cada uma.',
  },
  {
    id: 'create-from-notes',
    category: 'criar',
    title: 'Tarefas a partir de anotações',
    description: 'Transforma anotações ou uma ata em tarefas.',
    icon: 'sticky_note_2',
    creates: true,
    prompt:
      'Transforme estas anotações em tarefas no DidiFlow, com prioridade e prazo quando houver:\n\n[cole aqui as anotações ou a ata da reunião]',
  },
  {
    id: 'create-goal',
    category: 'criar',
    title: 'Quebrar uma meta em tarefas',
    description: 'Do objetivo ao plano executável.',
    icon: 'flag',
    creates: true,
    prompt:
      'Quero atingir esta meta: [meta] até [data]. Crie as tarefas para chegar lá, em ordem, com estimativas e prazos intermediários.',
  },
  {
    id: 'create-routine',
    category: 'criar',
    title: 'Tarefas recorrentes da semana',
    description: 'Cria as tarefas de rotina da próxima semana.',
    icon: 'event_repeat',
    creates: true,
    prompt:
      'Crie as tarefas da minha rotina da próxima semana: [descreva a rotina, por exemplo: relatório às segundas, reunião de time às quartas].',
  },
  {
    id: 'update-statuses',
    category: 'criar',
    title: 'Atualizar andamento',
    description: 'Atualiza status, progresso e prazos pelo que você contar.',
    icon: 'published_with_changes',
    creates: true,
    prompt:
      'Atualize as minhas tarefas com este andamento: [ex.: terminei o layout, o gateway está em 80% e o contrato ficou para sexta].',
  },
  // Relatórios
  {
    id: 'report-day',
    category: 'relatorios',
    title: 'Resumo do meu dia',
    description: 'Atrasadas, vencendo hoje e horas registradas.',
    icon: 'wb_sunny',
    prompt: 'Faça um resumo do meu dia: o que está atrasado, o que vence hoje e as horas de hoje.',
  },
  {
    id: 'report-status',
    category: 'relatorios',
    title: 'Status report para o gestor',
    description: 'Resumo semanal pronto para enviar.',
    icon: 'mark_email_read',
    prompt:
      'Escreva um status report semanal para o meu gestor: entregas, andamento por projeto, riscos e próximos passos. Tom profissional e direto.',
  },
  {
    id: 'report-project',
    category: 'relatorios',
    title: 'Situação de um projeto',
    description: 'Andamento, prazos e riscos de um projeto.',
    icon: 'folder_open',
    prompt:
      'Como está o projeto [nome do projeto]? Resuma andamento, prazos, riscos e o que falta.',
  },
  {
    id: 'report-daily',
    category: 'relatorios',
    title: 'Daily (ontem, hoje, bloqueios)',
    description: 'Fala pronta para a reunião diária.',
    icon: 'groups',
    prompt: 'Prepare a minha fala da daily: o que fiz ontem, o que farei hoje e os bloqueios.',
  },
  // Escrita
  {
    id: 'write-description',
    category: 'escrita',
    title: 'Descrição de tarefa',
    description: 'Objetivo, critérios de aceite e checklist em Markdown.',
    icon: 'description',
    prompt:
      'Escreva uma descrição em Markdown para a tarefa "[título]": objetivo, critérios de aceite e um checklist.',
  },
  {
    id: 'write-message',
    category: 'escrita',
    title: 'Mensagem para o solicitante',
    description: 'Atualização educada sobre prazo ou andamento.',
    icon: 'chat',
    prompt:
      'Escreva uma mensagem curta e educada para [solicitante] sobre a tarefa "[título]": [o que precisa comunicar, ex.: novo prazo].',
  },
  {
    id: 'write-negotiate',
    category: 'escrita',
    title: 'Renegociar um prazo',
    description: 'Argumentos e proposta de nova data.',
    icon: 'handshake',
    prompt:
      'Ajude a renegociar o prazo da tarefa "[título]": explique o motivo com base nos dados e proponha uma nova data realista.',
  },
  // Revisão
  {
    id: 'review-estimates',
    category: 'revisao',
    title: 'Minhas estimativas estão boas?',
    description: 'Compara horas registradas com estimativas.',
    icon: 'query_stats',
    prompt:
      'Compare as horas registradas com as estimativas das minhas tarefas e diga se costumo subestimar ou superestimar, com dicas.',
  },
  {
    id: 'review-week',
    category: 'revisao',
    title: 'Retrospectiva da semana',
    description: 'O que foi bem, o que melhorar e um compromisso.',
    icon: 'history',
    prompt:
      'Faça uma retrospectiva curta da minha semana: o que foi bem, o que pode melhorar e um compromisso para a próxima.',
  },
  {
    id: 'review-cleanup',
    category: 'revisao',
    title: 'Faxina nas tarefas',
    description: 'Tarefas paradas, duplicadas ou sem prazo.',
    icon: 'cleaning_services',
    prompt:
      'Revise as minhas tarefas abertas e aponte as paradas, as sem prazo e as que parecem duplicadas, sugerindo o que fazer com cada uma.',
  },
];

/** Filters the library by text (title, description, prompt) and category. */
export function filterPrompts(
  prompts: readonly LibraryPrompt[],
  query: string,
  category: PromptCategory | 'todos' | 'meus',
): LibraryPrompt[] {
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return prompts.filter(
    (item) =>
      (category === 'todos' || category === 'meus' || item.category === category) &&
      terms.every((term) =>
        normalize(`${item.title} ${item.description} ${item.prompt}`).includes(term),
      ),
  );
}

const MY_PROMPTS_KEY = 'didiflow:didibot:my-prompts';
export const MAX_MY_PROMPTS = 50;

/** Prompts saved by the user on this device. */
@Injectable({ providedIn: 'root' })
export class MyPrompts {
  readonly items = signal<LibraryPrompt[]>(this.read());

  save(title: string, prompt: string): LibraryPrompt {
    const item: LibraryPrompt = {
      id: `my-${Date.now().toString(36)}`,
      category: 'planejamento',
      title: title.trim().slice(0, 80) || prompt.trim().slice(0, 60),
      description: 'Meu prompt',
      icon: 'bookmark',
      prompt: prompt.trim().slice(0, 4000),
    };
    this.write([item, ...this.items()].slice(0, MAX_MY_PROMPTS));
    return item;
  }

  remove(id: string): void {
    this.write(this.items().filter((item) => item.id !== id));
  }

  private read(): LibraryPrompt[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(MY_PROMPTS_KEY) ?? '[]');
      return Array.isArray(parsed) ? (parsed as LibraryPrompt[]).slice(0, MAX_MY_PROMPTS) : [];
    } catch {
      return [];
    }
  }

  private write(items: LibraryPrompt[]): void {
    this.items.set(items);
    try {
      localStorage.setItem(MY_PROMPTS_KEY, JSON.stringify(items));
    } catch {
      // Storage unavailable: saved prompts last for this session.
    }
  }
}
