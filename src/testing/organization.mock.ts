import { computed, type Provider, signal } from '@angular/core';
import {
  type OrgItem,
  type OrgKind,
  OrganizationStore,
  type Requester,
} from '../app/features/organization/organization.service';

/** In-memory OrganizationStore for component tests. */
export function provideOrganizationMock(
  items: Partial<Record<OrgKind, OrgItem[]>> = {},
  requesters: Requester[] = [],
): Provider {
  const state = signal<Record<OrgKind, OrgItem[]>>({
    projects: [],
    categories: [],
    tags: [],
    work_contexts: [],
    ...items,
  });
  const store = {
    items: state,
    requesters: signal(requesters),
    loaded: signal(true),
    byId: computed(() => {
      const map = new Map<string, OrgItem>();
      for (const list of Object.values(state())) for (const item of list) map.set(item.id, item);
      return map;
    }),
    activeProjects: computed(() => state().projects.filter((p) => !p.archived_at)),
    load: vi.fn().mockResolvedValue(undefined),
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    loadRequesters: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  };
  return { provide: OrganizationStore, useValue: store };
}
