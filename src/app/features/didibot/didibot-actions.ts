import { inject, Injectable } from '@angular/core';
import type { AiAction } from '../../../../electron/ipc/contract';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { describeError } from '../../shared/utils/errors';
import { formatDateValue } from '../../shared/utils/format-date';
import { OrganizationStore } from '../organization/organization.service';
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from '../tasks/task.model';
import { TasksService } from '../tasks/tasks.service';

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Route of the created/updated item, when there is one. */
  route?: string;
}

type DateFormatter = (date: string) => string;

const PROJECT_COLORS = ['#0284c7', '#16a34a', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6'];

/** One-line summary of a proposed action, shown before the user confirms. */
export function describeAction(action: AiAction, formatDate: DateFormatter): string {
  if (action.type === 'create_project') {
    return `Criar projeto “${action.name}”${action.description ? ` — ${action.description}` : ''}`;
  }
  if (action.type === 'create_task') {
    const details = [
      action.project && `projeto ${action.project}`,
      action.parent && `dentro de “${action.parent}”`,
      action.priority && `prioridade ${PRIORITY_LABELS[action.priority].toLowerCase()}`,
      action.dueDate && `entrega ${formatDate(action.dueDate)}`,
      action.estimatedHours && `${action.estimatedHours} h`,
      action.category && `categoria ${action.category}`,
      action.tags?.length && action.tags.map((tag) => `#${tag}`).join(' '),
      action.subtasks?.length &&
        `${action.subtasks.length} subtarefa${action.subtasks.length === 1 ? '' : 's'}`,
    ].filter(Boolean);
    const kind = action.kind === 'epic' ? 'épico' : 'tarefa';
    return `Criar ${kind} “${action.title}”${details.length ? ` — ${details.join(', ')}` : ''}`;
  }
  const changes = [
    action.status && `status ${STATUS_LABELS[action.status]}`,
    action.progress !== undefined && `progresso ${action.progress}%`,
    action.dueDate && `entrega ${formatDate(action.dueDate)}`,
    action.priority && `prioridade ${PRIORITY_LABELS[action.priority].toLowerCase()}`,
  ].filter(Boolean);
  return `Atualizar “${action.task}”: ${changes.join(', ')}`;
}

/** ilike pattern for an exact, case-insensitive title match. */
export function exactTitlePattern(title: string): string {
  return title.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Applies the DidiBot proposals the user confirmed, in order. */
@Injectable({ providedIn: 'root' })
export class DidiBotActions {
  private readonly tasks = inject(TasksService);
  private readonly org = inject(OrganizationStore);
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly clock = inject(UserClock);

  formatDate: DateFormatter = (date) =>
    formatDateValue(date, this.clock.dateFormat(), this.clock.timeZone());

  describe(action: AiAction): string {
    return describeAction(action, this.formatDate);
  }

  async apply(actions: readonly AiAction[]): Promise<ActionResult[]> {
    await this.org.ensureLoaded();
    // Tasks created in this batch, so later actions can use them as parents.
    const created = new Map<string, Task>();
    const results: ActionResult[] = [];
    for (const action of actions) {
      try {
        if (action.type === 'create_project') results.push(await this.createProject(action));
        else if (action.type === 'create_task')
          results.push(await this.createTask(action, created));
        else results.push(await this.updateTask(action, created));
      } catch (error) {
        results.push({
          ok: false,
          message: describeError(error, 'Não foi possível aplicar esta ação.'),
        });
      }
    }
    return results;
  }

  private find(kind: 'projects' | 'categories' | 'tags', name: string) {
    const wanted = name.trim().toLowerCase();
    return this.org.items()[kind].find((item) => item.name.trim().toLowerCase() === wanted);
  }

  private async ensureProject(name: string, description?: string, color?: string) {
    const existing = this.find('projects', name);
    if (existing) return { project: existing, created: false };
    const index = this.org.items().projects.length % PROJECT_COLORS.length;
    const project = await this.org.create('projects', {
      name: name.slice(0, 100),
      color: color ?? PROJECT_COLORS[index],
      description: description ?? null,
    });
    return { project, created: true };
  }

  private async createProject(
    action: Extract<AiAction, { type: 'create_project' }>,
  ): Promise<ActionResult> {
    const { project, created } = await this.ensureProject(
      action.name,
      action.description,
      action.color,
    );
    return {
      ok: true,
      message: created
        ? `Projeto “${project.name}” criado.`
        : `Projeto “${project.name}” já existia.`,
      route: '/organization',
    };
  }

  private async findTask(title: string, created: Map<string, Task>): Promise<Task | null> {
    const fromBatch = created.get(title.trim().toLowerCase());
    if (fromBatch) return fromBatch;
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .is('deleted_at', null)
      .ilike('title', exactTitlePattern(title.trim()))
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data[0] ?? null;
  }

  private async createTask(
    action: Extract<AiAction, { type: 'create_task' }>,
    created: Map<string, Task>,
  ): Promise<ActionResult> {
    const notes: string[] = [];
    let projectId: string | null = null;
    if (action.project) {
      const { project, created: isNew } = await this.ensureProject(action.project);
      projectId = project.id;
      if (isNew) notes.push(`projeto “${project.name}” criado`);
    }
    const category = action.category ? this.find('categories', action.category) : undefined;
    if (action.category && !category) notes.push(`categoria “${action.category}” não existe`);
    const tags = (action.tags ?? []).map((name) => ({ name, tag: this.find('tags', name) }));
    const missingTags = tags.filter((entry) => !entry.tag).map((entry) => entry.name);
    if (missingTags.length) notes.push(`tags ignoradas: ${missingTags.join(', ')}`);

    let parent: Task | null = null;
    if (action.parent && action.kind !== 'epic') {
      parent = await this.findTask(action.parent, created);
      if (!parent) notes.push(`“${action.parent}” não encontrada; criada sem tarefa-mãe`);
    }

    const task = await this.tasks.create({
      title: action.title,
      description: action.description ?? null,
      kind: action.kind ?? 'task',
      priority: action.priority ?? parent?.priority ?? 'medium',
      due_date: action.dueDate ?? null,
      start_date: action.startDate ?? null,
      estimated_minutes: action.estimatedHours ? Math.round(action.estimatedHours * 60) : null,
      project_id: projectId ?? parent?.project_id ?? null,
      category_id: category?.id ?? null,
      parent_id: parent?.id ?? null,
    });
    created.set(task.title.trim().toLowerCase(), task);

    const tagIds = tags.flatMap((entry) => (entry.tag ? [entry.tag.id] : []));
    if (tagIds.length) await this.tasks.setTags(task.id, tagIds);
    for (const title of action.subtasks ?? []) {
      const child = await this.tasks.createSubtask(task, title);
      created.set(child.title.trim().toLowerCase(), child);
    }

    const kind = task.kind === 'epic' ? 'Épico' : 'Tarefa';
    const extra = action.subtasks?.length ? ` com ${action.subtasks.length} subtarefa(s)` : '';
    return {
      ok: true,
      message: `${kind} “${task.title}” ${kind === 'Tarefa' ? 'criada' : 'criado'}${extra}.${
        notes.length ? ` (${notes.join('; ')})` : ''
      }`,
      route: `/tasks/${task.id}`,
    };
  }

  private async updateTask(
    action: Extract<AiAction, { type: 'update_task' }>,
    created: Map<string, Task>,
  ): Promise<ActionResult> {
    const task = await this.findTask(action.task, created);
    if (!task) return { ok: false, message: `Tarefa “${action.task}” não encontrada.` };
    const changes: Parameters<TasksService['update']>[1] = {};
    if (action.dueDate) changes.due_date = action.dueDate;
    if (action.priority) changes.priority = action.priority;
    if (action.progress !== undefined) changes.progress_percentage = action.progress;
    if (Object.keys(changes).length) await this.tasks.update(task.id, changes);
    // Status last: the database keeps status and progress consistent.
    if (action.status) await this.tasks.setStatus(task.id, action.status);
    return { ok: true, message: `Tarefa “${task.title}” atualizada.`, route: `/tasks/${task.id}` };
  }
}
