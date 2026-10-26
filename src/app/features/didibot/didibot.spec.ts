import { TestBed } from '@angular/core/testing';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService } from '../../core/profile/profile.service';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { OrganizationStore } from '../organization/organization.service';
import { aiErrorMessage } from './ai-messages';
import { buildContext, type ContextInput, type ContextTask } from './didibot-context';
import { apiKeyValidator } from './didibot-settings-card';
import { DidiBotActions } from './didibot-actions';
import { DidiBotService } from './didibot.service';
import { FormControl } from '@angular/forms';

const task = (overrides: Partial<ContextTask>): ContextTask => ({
  id: 't1',
  title: 'Gateway de pagamento',
  kind: 'task',
  parent_id: null,
  status: 'in_progress',
  priority: 'urgent',
  progress_percentage: 60,
  due_date: '2026-10-27',
  project_id: 'p1',
  ...overrides,
});

const input: ContextInput = {
  today: '2026-10-26',
  dueSoonDays: 2,
  dateFormat: 'dd/MM/yyyy',
  timeZone: 'America/Sao_Paulo',
  displayName: 'Deyvid',
  tasks: [
    task({
      id: 't2',
      title: 'Gráfico de consumo',
      parent_id: 'p-panel',
      priority: 'medium',
      due_date: null,
    }),
    task({}),
    task({
      id: 't3',
      title: 'Contrato',
      priority: 'high',
      due_date: '2026-10-20',
      status: 'blocked',
    }),
  ],
  parents: new Map([
    ['p-panel', { title: 'Painel do cliente', parent_id: 'e1' }],
    ['e1', { title: 'Lançamento do Portal 2.0', parent_id: null }],
  ]),
  projects: new Map([['p1', 'Portal do Cliente']]),
  todayPriorities: ['Gateway de pagamento'],
  secondsToday: 9000,
  dailyTargetHours: 7,
  completedLast30Days: 11,
};

describe('DidiBot context', () => {
  it('summarizes open work without descriptions, nearest deadline first', () => {
    const context = buildContext(input);
    expect(context).toContain('Usuário: Deyvid');
    expect(context).toContain('Hoje: 26/10/2026 (2026-10-26)');
    expect(context).toContain('Horas registradas hoje: 2h 30min (meta 7 h)');
    expect(context).toContain('Tarefas abertas: 3 (1 atrasadas, 1 vencendo em até 2 dia(s))');
    expect(context).toContain('Prioridades de hoje definidas pelo usuário: Gateway de pagamento');
    const lines = context.split('\n').filter((line) => line.startsWith('- ['));
    expect(lines[0]).toBe(
      '- [Alta] Contrato — Bloqueado, 60%; entrega 20/10/2026 (Atrasada há 6 dias); projeto Portal do Cliente',
    );
    expect(lines[1]).toContain('(Vence amanhã)');
    expect(lines[2]).toContain('sem data de entrega');
    expect(lines[2]).toContain('épico/tarefa-mãe: Lançamento do Portal 2.0 › Painel do cliente');
  });

  it('says when there is nothing open', () => {
    expect(buildContext({ ...input, tasks: [], todayPriorities: [] })).toContain('- nenhuma');
  });
});

describe('DidiBot settings', () => {
  it('accepts an empty field or an AI Studio key', () => {
    const check = (value: string) => apiKeyValidator(new FormControl(value, { nonNullable: true }));
    expect(check('')).toBeNull();
    expect(check('test-fake-gemini-key-not-a-secret-0001')).toBeNull();
    expect(check('minha senha')).toEqual({ apiKey: true });
  });

  it('explains errors', () => {
    expect(aiErrorMessage('quota')).toContain('Limite gratuito');
    expect(aiErrorMessage('not-configured')).toContain('Conecte sua conta Google');
  });
});

describe('DidiBotService', () => {
  function setup(chat: ReturnType<typeof vi.fn>) {
    localStorage.clear();
    const actions = {
      describe: (action: { type: string }) => `label ${action.type}`,
      apply: vi
        .fn()
        .mockResolvedValue([{ ok: true, message: 'Projeto “X” criado.', route: '/organization' }]),
    };
    const ai = {
      chat,
      status: vi.fn().mockResolvedValue({ hasKey: true, canStoreKey: true, model: 'm' }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: DesktopBridge, useValue: { ai } },
        { provide: SUPABASE_CLIENT, useValue: {} },
        { provide: UserClock, useValue: {} },
        { provide: ProfileService, useValue: {} },
        { provide: OrganizationStore, useValue: {} },
        { provide: DidiBotActions, useValue: actions },
      ],
    });
    const service = TestBed.inject(DidiBotService);
    service.setIncludeContext(false);
    service.setAllowActions(false);
    return service;
  }

  it('sends the conversation and records the answer', async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', text: 'Priorize o contrato.', actions: [] })
      .mockResolvedValueOnce({ status: 'error', error: 'quota' })
      .mockResolvedValueOnce({ status: 'ok', text: 'Combinado.', actions: [] });
    const bot = setup(chat);
    await bot.send('O que priorizar?');
    await bot.send('E depois?');
    await bot.send('Ok');
    expect(bot.entries().map((entry) => entry.role)).toEqual([
      'user',
      'model',
      'user',
      'error',
      'user',
      'model',
    ]);
    // Errors are not sent back to Gemini; the context is off.
    expect(chat.mock.calls[2][0]).toEqual({
      messages: [
        { role: 'user', text: 'O que priorizar?' },
        { role: 'model', text: 'Priorize o contrato.' },
        { role: 'user', text: 'E depois?\n\nOk' },
      ],
      context: undefined,
      allowActions: false,
    });
    bot.reset();
    expect(bot.entries()).toEqual([]);
  });

  it('signs in with Google and refreshes the status', async () => {
    const bot = setup(vi.fn());
    const ai = TestBed.inject(DesktopBridge).ai as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    ai['connectGoogle'] = vi
      .fn()
      .mockResolvedValue({ status: 'ok', account: 'ana@gmail.com', projectId: 'p' });
    const result = await bot.connectGoogle();
    expect(result).toMatchObject({ status: 'ok', account: 'ana@gmail.com' });
    expect(ai['status']).toHaveBeenCalled();
    expect(bot.connecting()).toBe(false);
    expect(bot.connected()).toBe(true);
  });

  it('shows proposed actions and applies only the selected ones', async () => {
    const chat = vi.fn().mockResolvedValue({
      status: 'ok',
      text: '',
      actions: [
        { type: 'create_project', name: 'X' },
        { type: 'create_task', title: 'Y', project: 'X' },
      ],
    });
    const bot = setup(chat);
    const actions = TestBed.inject(DidiBotActions) as unknown as {
      apply: ReturnType<typeof vi.fn>;
    };
    await bot.send('Crie um projeto X');
    const entry = bot.entries()[1];
    expect(entry.text).toBe('Preparei estas ações para você revisar:');
    expect(entry.actionsState).toBe('pending');
    expect(entry.actions!.map((item) => item.label)).toEqual([
      'label create_project',
      'label create_task',
    ]);

    bot.toggleAction(entry.id, 1, false);
    await bot.applyActions(entry.id);
    expect(actions.apply).toHaveBeenCalledWith([{ type: 'create_project', name: 'X' }]);
    const applied = bot.entries()[1];
    expect(applied.actionsState).toBe('applied');
    expect(applied.actions![0].result).toMatchObject({ ok: true });
    expect(applied.actions![1].result).toBeUndefined();
    expect(bot.entries()[2].text).toContain('Ações aplicadas no DidiFlow');
    // Applying twice does nothing.
    expect(await bot.applyActions(entry.id)).toEqual([]);
  });

  it('can discard proposals', async () => {
    const chat = vi.fn().mockResolvedValue({
      status: 'ok',
      text: 'Ok',
      actions: [{ type: 'create_project', name: 'X' }],
    });
    const bot = setup(chat);
    await bot.send('Crie');
    bot.dismissActions(bot.entries()[1].id);
    expect(bot.entries()[1].actionsState).toBe('dismissed');
  });

  it('remembers the context choice', () => {
    const bot = setup(vi.fn());
    bot.setIncludeContext(true);
    expect(localStorage.getItem('didiflow:didibot:include-context')).toBe('1');
    expect(bot.includeContext()).toBe(true);
  });
});
