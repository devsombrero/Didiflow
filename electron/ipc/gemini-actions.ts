import type { AiAction, AiTaskPriority, AiTaskStatus } from './contract';

/**
 * Actions DidiBot may propose through Gemini function calling. Nothing here
 * writes data: the renderer shows the proposals and applies only the ones the
 * user confirms.
 */
export const MAX_ACTIONS = 30;

const PRIORITIES: readonly AiTaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const STATUSES: readonly AiTaskStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

const priority = {
  type: 'STRING',
  enum: [...PRIORITIES],
  description: 'Prioridade: low (baixa), medium (média), high (alta) ou urgent (urgente).',
};
const date = (what: string) => ({ type: 'STRING', description: `${what} no formato YYYY-MM-DD.` });

/** Gemini function declarations (OpenAPI subset). */
export const ACTION_DECLARATIONS = [
  {
    name: 'create_project',
    description:
      'Cria um projeto no DidiFlow. Use só quando o usuário pedir um projeto novo que ainda não exista no contexto.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Nome do projeto (até 100 caracteres).' },
        description: { type: 'STRING', description: 'Descrição curta do projeto.' },
        color: { type: 'STRING', description: 'Cor em hexadecimal, por exemplo #0284c7.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_task',
    description:
      'Cria uma tarefa ou um épico no DidiFlow, opcionalmente com subtarefas. Use nomes de projeto, categoria e tags que existam no contexto ou projetos criados nesta mesma resposta.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Título da tarefa (até 200 caracteres), começando com verbo.',
        },
        description: { type: 'STRING', description: 'Descrição em Markdown, objetiva.' },
        kind: {
          type: 'STRING',
          enum: ['task', 'epic'],
          description: 'task (padrão) ou epic para agrupar tarefas.',
        },
        priority,
        due_date: date('Data de entrega'),
        start_date: date('Data de início'),
        estimated_hours: { type: 'NUMBER', description: 'Estimativa em horas.' },
        project: { type: 'STRING', description: 'Nome do projeto.' },
        category: { type: 'STRING', description: 'Nome da categoria existente.' },
        tags: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Nomes de tags existentes.',
        },
        parent: {
          type: 'STRING',
          description: 'Título exato do épico ou tarefa-mãe (existente ou criado nesta resposta).',
        },
        subtasks: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Títulos de subtarefas a criar dentro desta tarefa.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description:
      'Altera uma tarefa existente identificada pelo título exato do contexto: status, progresso, prazo ou prioridade.',
    parameters: {
      type: 'OBJECT',
      properties: {
        task: { type: 'STRING', description: 'Título exato da tarefa existente.' },
        status: {
          type: 'STRING',
          enum: [...STATUSES],
          description: 'not_started, in_progress, blocked, done ou cancelled.',
        },
        progress: { type: 'NUMBER', description: 'Progresso de 0 a 100.' },
        due_date: date('Nova data de entrega'),
        priority,
      },
      required: ['task'],
    },
  },
];

export const ACTIONS_PROMPT = [
  'Você pode preparar ações no DidiFlow com as funções create_project, create_task e update_task quando o usuário pedir para criar, organizar, planejar em tarefas ou alterar projetos e tarefas.',
  'O aplicativo mostra as ações ao usuário e só as aplica depois da confirmação dele; nunca diga que já criou algo.',
  'Use nomes existentes do contexto para projetos, categorias, tags e tarefas. Para criar um projeto e suas tarefas, chame create_project e depois create_task com o mesmo nome de projeto.',
  'Converta datas relativas ("sexta", "semana que vem") para YYYY-MM-DD a partir de Hoje. Junto com as funções, explique em uma ou duas frases o que preparou.',
].join('\n');

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function longText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function list(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => text(item, maxLength))
    .filter((item): item is string => !!item)
    .slice(0, maxItems);
  return items.length ? items : undefined;
}

function validDate(value: unknown): string | undefined {
  return typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return options.includes(value as T) ? (value as T) : undefined;
}

/** Strips undefined keys so the renderer gets compact actions. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** A Gemini function call turned into a safe action, or null when unusable. */
export function toAction(name: unknown, rawArgs: unknown): AiAction | null {
  const args = (typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}) as Record<
    string,
    unknown
  >;
  if (name === 'create_project') {
    const projectName = text(args['name'], 100);
    if (!projectName) return null;
    return compact({
      type: 'create_project' as const,
      name: projectName,
      description: longText(args['description'], 2000),
      color:
        typeof args['color'] === 'string' && COLOR.test(args['color']) ? args['color'] : undefined,
    });
  }
  if (name === 'create_task') {
    const title = text(args['title'], 200);
    if (!title) return null;
    const hours = Number(args['estimated_hours']);
    return compact({
      type: 'create_task' as const,
      title,
      description: longText(args['description'], 10_000),
      kind: oneOf(args['kind'], ['task', 'epic'] as const),
      priority: oneOf(args['priority'], PRIORITIES),
      dueDate: validDate(args['due_date']),
      startDate: validDate(args['start_date']),
      estimatedHours:
        Number.isFinite(hours) && hours > 0 ? Math.min(Math.round(hours * 4) / 4, 1000) : undefined,
      project: text(args['project'], 100),
      category: text(args['category'], 60),
      tags: list(args['tags'], 10, 40),
      parent: text(args['parent'], 200),
      subtasks: list(args['subtasks'], 20, 200),
    });
  }
  if (name === 'update_task') {
    const task = text(args['task'], 200);
    if (!task) return null;
    const progress = Number(args['progress']);
    const action = compact({
      type: 'update_task' as const,
      task,
      status: oneOf(args['status'], STATUSES),
      progress: Number.isFinite(progress)
        ? Math.min(100, Math.max(0, Math.round(progress)))
        : undefined,
      dueDate: validDate(args['due_date']),
      priority: oneOf(args['priority'], PRIORITIES),
    });
    // An update that changes nothing is not worth confirming.
    return Object.keys(action).length > 2 ? action : null;
  }
  return null;
}

interface FunctionCallPart {
  functionCall?: { name?: unknown; args?: unknown };
}

/** Actions from the parts of a Gemini answer, in order, at most MAX_ACTIONS. */
export function extractActions(parts: readonly FunctionCallPart[]): AiAction[] {
  return parts
    .map((part) =>
      part.functionCall ? toAction(part.functionCall.name, part.functionCall.args) : null,
    )
    .filter((action): action is AiAction => action !== null)
    .slice(0, MAX_ACTIONS);
}
