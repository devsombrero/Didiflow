import { computed, inject, Injectable, signal } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tables } from '../../core/supabase/database.types';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

export type OrgKind = 'projects' | 'categories' | 'tags' | 'work_contexts';

export interface OrgItem {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
  archived_at?: string | null;
}

export interface OrgItemInput {
  name: string;
  color: string | null;
  description?: string | null;
}

export type Requester = Pick<Tables<'task_requesters'>, 'name' | 'task_count'>;

export const ORG_KINDS: readonly { kind: OrgKind; label: string; singular: string }[] = [
  { kind: 'projects', label: 'Projetos', singular: 'projeto' },
  { kind: 'categories', label: 'Categorias', singular: 'categoria' },
  { kind: 'tags', label: 'Tags', singular: 'tag' },
  { kind: 'work_contexts', label: 'Contextos', singular: 'contexto' },
];

const COLUMNS: Record<OrgKind, string> = {
  projects: 'id,name,color,description,archived_at',
  categories: 'id,name,color',
  tags: 'id,name,color',
  work_contexts: 'id,name,color',
};

/**
 * Projects, categories, tags and work contexts of the signed-in user, kept
 * in signals so every screen resolves names from the same cache.
 */
@Injectable({ providedIn: 'root' })
export class OrganizationStore {
  private readonly supabase = inject(SUPABASE_CLIENT);
  /** Untyped view for queries over a union of table names (columns are shared). */
  private readonly db = this.supabase as unknown as SupabaseClient;

  readonly items = signal<Record<OrgKind, OrgItem[]>>({
    projects: [],
    categories: [],
    tags: [],
    work_contexts: [],
  });
  readonly requesters = signal<Requester[]>([]);
  readonly loaded = signal(false);

  readonly byId = computed(() => {
    const map = new Map<string, OrgItem>();
    for (const list of Object.values(this.items())) {
      for (const item of list) map.set(item.id, item);
    }
    return map;
  });

  /** Active projects (not archived) for selectors. */
  readonly activeProjects = computed(() => this.items().projects.filter((p) => !p.archived_at));

  async load(): Promise<void> {
    const kinds = ORG_KINDS.map(({ kind }) => kind);
    const results = await Promise.all(kinds.map((kind) => this.fetch(kind)));
    this.items.set(
      Object.fromEntries(kinds.map((kind, i) => [kind, results[i]])) as Record<OrgKind, OrgItem[]>,
    );
    await this.loadRequesters();
    this.loaded.set(true);
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loaded()) await this.load();
  }

  async loadRequesters(): Promise<void> {
    const { data, error } = await this.supabase
      .from('task_requesters')
      .select('name,task_count')
      .order('task_count', { ascending: false });
    if (error) throw error;
    this.requesters.set(data.filter((r): r is Requester => r.name !== null));
  }

  async create(kind: OrgKind, input: OrgItemInput): Promise<OrgItem> {
    const { data, error } = await this.db
      .from(kind)
      .insert(this.payload(kind, input))
      .select(COLUMNS[kind])
      .single();
    if (error) throw error;
    const item = data as unknown as OrgItem;
    this.replace(kind, [...this.items()[kind], item]);
    return item;
  }

  async update(
    kind: OrgKind,
    id: string,
    changes: Partial<OrgItemInput> & { archived_at?: string | null },
  ): Promise<OrgItem> {
    const { data, error } = await this.db
      .from(kind)
      .update(changes)
      .eq('id', id)
      .select(COLUMNS[kind])
      .single();
    if (error) throw error;
    const item = data as unknown as OrgItem;
    this.replace(
      kind,
      this.items()[kind].map((existing) => (existing.id === id ? item : existing)),
    );
    return item;
  }

  /** Tasks keep existing: references are cleared by the database (on delete set null). */
  async remove(kind: OrgKind, id: string): Promise<void> {
    const { error } = await this.db.from(kind).delete().eq('id', id);
    if (error) throw error;
    this.replace(
      kind,
      this.items()[kind].filter((item) => item.id !== id),
    );
  }

  clear(): void {
    this.items.set({ projects: [], categories: [], tags: [], work_contexts: [] });
    this.requesters.set([]);
    this.loaded.set(false);
  }

  private async fetch(kind: OrgKind): Promise<OrgItem[]> {
    const { data, error } = await this.db.from(kind).select(COLUMNS[kind]).order('name');
    if (error) throw error;
    return data as unknown as OrgItem[];
  }

  private payload(kind: OrgKind, input: OrgItemInput) {
    const base = { name: input.name.trim(), color: input.color };
    return kind === 'projects' ? { ...base, description: input.description ?? null } : base;
  }

  private replace(kind: OrgKind, list: OrgItem[]): void {
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.items.update((items) => ({ ...items, [kind]: sorted }));
  }
}
