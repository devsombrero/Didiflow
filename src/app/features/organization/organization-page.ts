import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { MatTabsModule } from '@angular/material/tabs';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { describeError } from '../../shared/utils/errors';
import { ORG_KINDS, type OrgItem, type OrgKind, OrganizationStore } from './organization.service';

type Tab = OrgKind | 'requesters';

const MAX_NAME: Record<OrgKind, number> = {
  projects: 100,
  categories: 60,
  tags: 40,
  work_contexts: 60,
};

@Component({
  selector: 'app-organization-page',
  imports: [ReactiveFormsModule, MATERIAL_FORMS, MATERIAL_UI, MatTabsModule],
  templateUrl: './organization-page.html',
  styleUrl: './organization-page.scss',
})
export class OrganizationPage implements OnInit {
  protected readonly store = inject(OrganizationStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly kinds = ORG_KINDS;
  protected readonly tabs: Tab[] = [...ORG_KINDS.map((k) => k.kind), 'requesters'];
  protected readonly tabIndex = computed(() => this.tabs.indexOf(this.tab()));
  protected readonly tab = signal<Tab>('projects');
  protected readonly editingId = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly current = computed(() => ORG_KINDS.find((k) => k.kind === this.tab()));
  protected readonly list = computed(() => {
    const tab = this.tab();
    return tab === 'requesters' ? [] : this.store.items()[tab];
  });
  protected readonly maxName = computed(() => {
    const tab = this.tab();
    return tab === 'requesters' ? 0 : MAX_NAME[tab];
  });

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    color: ['#2a78d6'],
    description: ['', Validators.maxLength(2000)],
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.store.load();
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.cancelEdit();
  }

  protected edit(item: OrgItem): void {
    this.editingId.set(item.id);
    this.form.reset({
      name: item.name,
      color: item.color ?? '#2a78d6',
      description: item.description ?? '',
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', color: '#2a78d6', description: '' });
  }

  protected async save(): Promise<void> {
    const kind = this.tab();
    if (kind === 'requesters') return;
    const name = this.form.controls.name.value.trim();
    if (this.form.invalid || name.length > MAX_NAME[kind]) {
      this.form.markAllAsTouched();
      return;
    }

    const { color, description } = this.form.getRawValue();
    const input = {
      name,
      color,
      description: kind === 'projects' ? description.trim() || null : undefined,
    };
    this.busy.set(true);
    try {
      const id = this.editingId();
      if (id) {
        await this.store.update(kind, id, input);
        this.toast.success('Alterações salvas.');
      } else {
        await this.store.create(kind, input);
        this.toast.success(`${this.capitalize(this.current()!.singular)} criado(a).`);
      }
      this.cancelEdit();
    } catch (error) {
      this.toast.error(describeError(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleArchive(item: OrgItem): Promise<void> {
    try {
      await this.store.update('projects', item.id, {
        archived_at: item.archived_at ? null : new Date().toISOString(),
      });
      this.toast.success(item.archived_at ? 'Projeto reativado.' : 'Projeto arquivado.');
    } catch (error) {
      this.toast.error(describeError(error));
    }
  }

  protected async remove(item: OrgItem): Promise<void> {
    const kind = this.tab();
    if (kind === 'requesters') return;
    const confirmed = await this.confirm.ask({
      title: `Excluir ${this.current()!.singular}?`,
      message: `"${item.name}" será removido(a). As tarefas não são excluídas: apenas perdem esta associação.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.store.remove(kind, item.id);
      this.toast.success('Excluído.');
    } catch (error) {
      this.toast.error(describeError(error));
    }
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}
