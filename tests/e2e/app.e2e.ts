import { expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConfirmedUser, launchApp, login, removeDir } from './support';

test.describe.configure({ mode: 'serial' });

let email: string;

test.beforeAll(async () => {
  email = await createConfirmedUser();
});

test('security: renderer is isolated from Node and only exposes the preload API', async () => {
  const { page, close, userDataDir } = await launchApp();
  try {
    const surface = await page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      api: Object.keys((window as unknown as { didiflow: object }).didiflow).sort(),
    }));
    expect(surface).toEqual({
      require: 'undefined',
      process: 'undefined',
      api: [
        'ai',
        'attachments',
        'backups',
        'email',
        'notify',
        'onNavigate',
        'openBackupFile',
        'openExternal',
        'platform',
        'saveFile',
        'secureStore',
      ],
    });
    await expect(
      page.evaluate(() =>
        (
          window as unknown as { didiflow: { openExternal(u: string): Promise<void> } }
        ).didiflow.openExternal('file:///C:/Windows/System32/calc.exe'),
      ),
    ).rejects.toThrow();

    // The Gmail app password can be stored but never read back by the renderer.
    const email = await page.evaluate(async () => {
      const api = (
        window as unknown as { didiflow: import('../../electron/ipc/contract').DidiflowApi }
      ).didiflow;
      const status = await api.email.save({
        enabled: false,
        address: 'e2e@example.com',
        recipient: '',
        kinds: ['reminder'],
        appPassword: 'abcd efgh ijkl mnop',
      });
      const rejected = await api.email
        .save({
          enabled: true,
          address: 'e2e@example.com',
          recipient: '',
          kinds: [],
          appPassword: 'senha123',
        })
        .then(
          () => false,
          () => true,
        );
      return {
        status: JSON.stringify(status),
        viaSecureStore: await api.secureStore.get('gmail-app-password'),
        skipped: await api.email.send({ kind: 'reminder', title: 'x' }),
        rejected,
      };
    });
    expect(email.status).toContain('"hasPassword":true');
    expect(email.status).not.toContain('abcdefghijklmnop');
    expect(email.viaSecureStore).toBeNull();
    expect(email.skipped).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(email.rejected).toBe(true);
  } finally {
    await close();
    removeDir(userDataDir);
  }
});

test('session persists encrypted across restarts and ends on sign-out', async () => {
  const first = await launchApp();
  try {
    await login(first.page, email);
    await expect(first.page.getByRole('heading', { level: 1 })).toContainText('Olá, E2E User');
  } finally {
    await first.close();
  }

  const store = readFileSync(path.join(first.userDataDir, 'secure-store.json'), 'utf8');
  expect(store).not.toContain('access_token');

  const second = await launchApp(first.userDataDir);
  try {
    await expect(second.page.locator('.sidebar__nav')).toBeVisible();
    await second.page.locator('.sidebar__account').click();
    await second.page.getByRole('menuitem', { name: 'Sair' }).click();
    await expect(second.page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  } finally {
    await second.close();
    removeDir(first.userDataDir);
  }
});

test('task lifecycle: create, progress, complete, search and export', async () => {
  const { page, app, close, userDataDir } = await launchApp();
  const exportDir = path.join(userDataDir, 'exports');
  try {
    await login(page, email);

    await page.getByRole('link', { name: 'Tarefas' }).click();
    // Unsaved changes in the floating form ask before closing.
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova tarefa' })).toBeVisible();
    await page.locator('#title').fill('Rascunho descartado');
    await page.keyboard.press('Escape');
    await page
      .getByRole('dialog', { name: 'Descartar alterações?' })
      .getByRole('button', { name: 'Descartar' })
      .click();
    await expect(page.locator('app-task-form-dialog')).toHaveCount(0);

    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova tarefa' })).toBeVisible();
    await page.locator('#title').fill('Relatório trimestral E2E');
    await page.locator('#requester_name').fill('Marina');
    await page.getByLabel('Possui card no Jira').check();
    await page.locator('#jira_url').fill('http://inseguro.local/DF-1');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByText('Informe uma URL começando com https://.')).toBeVisible();
    await page.locator('#jira_url').fill('https://empresa.atlassian.net/browse/DF-1');
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Relatório trimestral E2E');
    await expect(page.getByRole('button', { name: /DF-1/ })).toBeVisible();

    await page.getByRole('button', { name: 'Editar' }).click();
    await expect(page.getByRole('dialog', { name: 'Editar tarefa' })).toBeVisible();
    await page.locator('#requester_name').fill('Marina Souza');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('app-task-form-dialog')).toHaveCount(0);
    await expect(page.locator('.detail-grid')).toContainText('Marina Souza');

    await page.getByLabel('Progresso').fill('40');
    await page.getByLabel('Progresso').dispatchEvent('change');
    await expect(page.locator('app-status-badge').first()).toContainText('Em andamento');

    await page.getByRole('button', { name: 'Marcar como concluída' }).click();
    await expect(page.locator('app-status-badge').first()).toContainText('Concluído');
    await expect(page.locator('.feed')).toContainText('Tarefa concluída');

    await page.keyboard.press('Control+K');
    await page.keyboard.type('relatorio trimestral');
    await page.keyboard.press('Enter');
    await expect(page.locator('.result mark').first()).toHaveText('Relatório');

    mkdirSync(exportDir, { recursive: true });
    await app.evaluate(({ dialog }, dir) => {
      // Avoid regex/backslash literals: this function is serialized to the main process.
      const baseName = (file: string) =>
        file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf(String.fromCharCode(92))) + 1);
      dialog.showSaveDialog = (async (_window: unknown, options?: { defaultPath?: string }) => ({
        canceled: false,
        filePath: `${dir}/${baseName(options?.defaultPath ?? 'x.csv')}`,
      })) as typeof dialog.showSaveDialog;
    }, exportDir);
    await page.goto(page.url().replace(/\/search.*$/, '/export'));
    await page.locator('.export').first().getByRole('button', { name: 'CSV' }).click();
    await expect(page.locator('.toast--success')).toContainText('Arquivo salvo');

    const csvFile = readdirSync(exportDir).find((file) => file.endsWith('.csv'))!;
    const csv = readFileSync(path.join(exportDir, csvFile), 'utf8');
    expect(csv).toContain('Relatório trimestral E2E;Concluído;100');
  } finally {
    await close();
    removeDir(userDataDir);
  }
});

test('kanban: drag a card between columns and keep it after reload', async () => {
  const { page, close, userDataDir } = await launchApp();
  try {
    await login(page, email);
    await page.getByRole('link', { name: 'Tarefas' }).click();
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova tarefa' })).toBeVisible();
    await page.locator('#title').fill('Card do quadro E2E');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Card do quadro E2E');

    await page.goto(page.url().replace(/\/tasks\/.*$/, '/tasks/board'));
    const card = page.locator('.column[data-status="not_started"] .card', {
      hasText: 'Card do quadro E2E',
    });
    const target = page.locator('.column[data-status="in_progress"] .column__list');
    await expect(card).toBeVisible();

    // CDK drag & drop needs real pointer movement.
    const from = (await card.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + 20);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + 30, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 15 });
    await page.mouse.up();

    await expect(
      page.locator('.column[data-status="in_progress"] .card', { hasText: 'Card do quadro E2E' }),
    ).toBeVisible();
    await expect(page.locator('.toast--success')).toContainText('movida para Em andamento');

    await page.reload();
    await expect(
      page.locator('.column[data-status="in_progress"] .card', { hasText: 'Card do quadro E2E' }),
    ).toBeVisible();
  } finally {
    await close();
    removeDir(userDataDir);
  }
});

test('backup: automatic and manual backups, restore with replace', async () => {
  const { page, close, userDataDir } = await launchApp();
  try {
    await login(page, email);

    await page.getByRole('link', { name: 'Tarefas' }).click();
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova tarefa' })).toBeVisible();
    await page.locator('#title').fill('Tarefa protegida por backup');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tarefa protegida por backup');

    await page.goto(page.url().replace(/\/tasks\/.*$/, '/backup'));
    // The automatic backup runs right after sign-in (no previous backup in this profile).
    await expect(page.locator('.files')).toContainText('Automático');

    await page.getByRole('button', { name: 'Fazer backup agora' }).click();
    await expect(page.locator('.toast--success')).toContainText('Backup criado');
    await expect(page.locator('.files li', { hasText: 'Manual' })).toHaveCount(1);

    // Delete the task, then bring it back from the manual backup.
    await page.goto(page.url().replace(/\/backup$/, '/tasks'));
    await page
      .locator('tr', { hasText: 'Tarefa protegida por backup' })
      .getByRole('button')
      .click();
    await page.getByRole('menuitem', { name: 'Excluir' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir' }).click();
    await expect(page.locator('.toast--success').last()).toContainText('Tarefa excluída');

    await page.goto(page.url().replace(/\/tasks$/, '/backup'));
    await page
      .locator('.files li', { hasText: 'Manual' })
      .getByRole('button', { name: 'Restaurar' })
      .click();
    await expect(page.locator('.restore-card')).toContainText('Tarefas: ');
    await page.getByRole('radio', { name: 'Substituir' }).click();
    await page.locator('.restore-card').getByRole('button', { name: 'Restaurar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Substituir' }).click();
    await expect(page.locator('.toast--success').last()).toContainText('Backup restaurado');
    await expect(page.locator('.files')).toContainText('Antes de restaurar');

    await page.goto(page.url().replace(/\/backup$/, '/tasks'));
    await expect(page.locator('tr', { hasText: 'Tarefa protegida por backup' })).toBeVisible();
  } finally {
    await close();
    removeDir(userDataDir);
  }
});

test('attachments: stored on this computer, 50 MB per task, removable', async () => {
  const { app, page, close, userDataDir } = await launchApp();
  const sources = mkdtempSync(path.join(tmpdir(), 'didiflow-e2e-files-'));
  const small = path.join(sources, 'proposta comercial.txt');
  const big = path.join(sources, 'video.bin');
  writeFileSync(small, 'Proposta para o cliente');
  writeFileSync(big, Buffer.alloc(51 * 1024 * 1024));
  // The native file dialog cannot be driven by Playwright: answer it from the main process.
  const pick = (files: string[]) =>
    app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: chosen })) as never;
    }, files);
  try {
    await login(page, email);
    await page.getByRole('link', { name: 'Tarefas' }).click();
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova tarefa' })).toBeVisible();
    await page.locator('#title').fill('Tarefa com anexos');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tarefa com anexos');

    await pick([big]);
    await page.getByRole('button', { name: 'Anexar arquivos' }).click();
    await expect(page.locator('.toast--error').last()).toContainText('50 MB desta tarefa');

    await pick([small]);
    await page.getByRole('button', { name: 'Anexar arquivos' }).click();
    await expect(page.locator('.toast--success').last()).toContainText('Arquivo anexado');
    const row = page.locator('app-task-attachments-panel li', {
      hasText: 'proposta comercial.txt',
    });
    await expect(row).toBeVisible();
    await expect(page.locator('app-task-attachments-panel')).toContainText('de 50 MB usados');
    await expect(page.locator('app-task-activity-feed')).toContainText('Anexo adicionado');

    const stored = readdirSync(path.join(userDataDir, 'attachments'), { recursive: true }).map(
      String,
    );
    expect(stored.some((file) => file.endsWith('proposta comercial.txt'))).toBe(true);

    await row.getByRole('button', { name: /Ações de/ }).click();
    await page.getByRole('menuitem', { name: 'Remover' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
    await expect(page.locator('.toast--success').last()).toContainText('Anexo removido');
    await expect(page.locator('app-task-attachments-panel')).toContainText('Nenhum anexo.');
    const left = readdirSync(path.join(userDataDir, 'attachments'), { recursive: true }).map(
      String,
    );
    expect(left.some((file) => file.endsWith('.txt'))).toBe(false);
  } finally {
    await close();
    removeDir(userDataDir);
    removeDir(sources);
  }
});

test('custom notifications: create in a dialog, test and see it in the bell', async () => {
  const { page, close, userDataDir } = await launchApp();
  try {
    await login(page, email);
    await page.getByRole('link', { name: 'Notificações' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notificações personalizadas');

    await page.getByRole('button', { name: 'Nova notificação' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nova notificação' });
    await dialog.locator('#cn-title').fill('Beber água');
    await dialog.locator('#cn-message').fill('Uma pausa rápida');
    await dialog.getByRole('radio', { name: 'Intervalo' }).click();
    await expect(dialog.locator('.preview')).toContainText('A cada 1 h, das 09:00 às 18:00');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.locator('.toast--success').last()).toContainText('Notificação criada');

    const rule = page.locator('.rule', { hasText: 'Beber água' });
    await expect(rule).toContainText('A cada 1 h, das 09:00 às 18:00');
    await rule.getByRole('button', { name: /Ações de/ }).click();
    await page.getByRole('menuitem', { name: 'Testar agora' }).click();
    await expect(page.locator('.toast--notification').last()).toContainText('Beber água');

    await page.getByRole('button', { name: /notificações não lidas/ }).click();
    await expect(page.locator('.panel__list')).toContainText('Uma pausa rápida');
    await page.locator('.cdk-overlay-backdrop').last().click({ force: true });
    // Closing the menu marks them as read (a scheduler digest may still arrive meanwhile).
    await expect(page.locator('.panel__list')).toBeHidden();

    await rule.getByRole('switch').click();
    await expect(rule).toContainText('Pausada');
  } finally {
    await close();
    removeDir(userDataDir);
  }
});

test('epics: subtasks roll up progress; starting a task keeps 0%', async () => {
  const { page, close, userDataDir } = await launchApp();
  try {
    await login(page, email);
    await page.getByRole('link', { name: 'Tarefas' }).click();
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova tarefa' })).toBeVisible();
    await page.locator('#title').fill('Lançamento do site');
    await page.locator('#kind').click();
    await page.getByRole('option', { name: /Épico/ }).click();
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lançamento do site');

    const panel = page.locator('app-task-children-panel');
    for (const title of ['Landing page', 'E-mail marketing']) {
      await panel.locator('#child-title').fill(title);
      await panel.getByRole('button', { name: 'Adicionar' }).click();
      await expect(panel.locator('.child', { hasText: title })).toBeVisible();
    }
    const progress = page.locator('app-task-progress-panel');
    await expect(progress).toContainText('Calculado automaticamente a partir de 2 itens');

    await panel.getByRole('button', { name: 'Concluir Landing page' }).click();
    await expect(panel).toContainText('1 de 2 concluídas');
    await expect(progress.locator('.progress__value')).toHaveText('50%');
    await expect(page.locator('app-status-badge').first()).toContainText('Em andamento');

    await panel.getByRole('button', { name: 'Concluir E-mail marketing' }).click();
    await expect(page.locator('app-status-badge').first()).toContainText('Concluído');

    // A subtask: starting it keeps 0%.
    await panel.locator('#child-title').fill('Revisão final');
    await panel.getByRole('button', { name: 'Com descrição' }).click();
    await panel.locator('#child-description').fill('**Checklist** de publicação\n- [ ] SEO');
    await panel.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await panel.getByRole('button', { name: 'Expandir Revisão final' }).click();
    await expect(panel.locator('.child__details strong')).toHaveText('Checklist');
    await expect(panel.locator('.child__details .md-check')).toHaveCount(1);
    const details = panel.locator('.child__details');
    await details.getByRole('tab', { name: /Arquivos/ }).click();
    await expect(details.getByRole('button', { name: 'Anexar arquivos' })).toBeVisible();
    await details.getByRole('tab', { name: /Recursos/ }).click();
    await details.locator('#link-url').fill('docs.google.com/document/d/checklist');
    await details.getByRole('button', { name: 'Adicionar link' }).click();
    await expect(details.locator('.link')).toContainText('docs.google.com/document/d/checklist');
    await panel.locator('.child__title', { hasText: 'Revisão final' }).click();
    await expect(page.locator('.breadcrumb')).toContainText('Lançamento do site');
    await expect(page.locator('app-status-badge').first()).toContainText('Não iniciado');
    await page.locator('#task-status').click();
    await page.getByRole('option', { name: 'Em andamento' }).click();
    await expect(page.locator('app-status-badge').first()).toContainText('Em andamento');
    await expect(page.locator('output[for="task-progress"]')).toHaveText('0%');
  } finally {
    await close();
    removeDir(userDataDir);
  }
});

test('resources: attach external links in the Recursos tab', async () => {
  const { app, page, close, userDataDir } = await launchApp();
  try {
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as unknown as { opened: string[] }).opened = opened;
      shell.openExternal = (async (url: string) => {
        opened.push(url);
      }) as typeof shell.openExternal;
    });
    await login(page, email);
    await page.getByRole('link', { name: 'Tarefas' }).click();
    await page.getByRole('button', { name: 'Nova tarefa' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nova tarefa' })).toBeVisible();
    await page.locator('#title').fill('Tarefa com recursos');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tarefa com recursos');

    await page.getByRole('tab', { name: /Recursos/ }).click();
    const panel = page.locator('app-task-links-panel');
    await panel.locator('#link-url').fill('http://inseguro.com/doc');
    await panel.getByRole('button', { name: 'Adicionar link' }).click();
    await expect(panel).toContainText('Use um link começando com https://.');

    await panel.locator('#link-url').fill('www.figma.com/file/abc');
    await panel.locator('#link-title').fill('Protótipo');
    await panel.getByRole('button', { name: 'Adicionar link' }).click();
    await expect(page.locator('.toast--success').last()).toContainText('Link adicionado');
    await expect(page.getByRole('tab', { name: /Recursos/ })).toContainText('1');
    await expect(page.locator('app-task-activity-feed')).toContainText('Link adicionado');

    await panel.getByRole('button', { name: 'Abrir Protótipo' }).click();
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened))
      .toEqual(['https://www.figma.com/file/abc']);

    await panel.getByRole('button', { name: 'Remover Protótipo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
    await expect(panel).toContainText('Nenhum recurso');
  } finally {
    await close();
    removeDir(userDataDir);
  }
});

test('didibot: optional Google account, key never readable, no calls without a key', async () => {
  const { app, page, close, userDataDir } = await launchApp();
  try {
    await app.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as unknown as { opened: string[] }).opened = opened;
      shell.openExternal = (async (url: string) => {
        opened.push(url);
      }) as typeof shell.openExternal;
    });
    await login(page, email);
    await page.getByRole('link', { name: 'DidiBot' }).click();
    await expect(page.locator('#didibot-connect')).toBeVisible();
    const opened = () => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened);

    const api = await page.evaluate(async () => {
      const ai = (
        window as unknown as { didiflow: import('../../electron/ipc/contract').DidiflowApi }
      ).didiflow.ai;
      const googleSignIn = (await ai.status()).googleSignIn;
      const chat = await ai.chat({ messages: [{ role: 'user', text: 'Oi' }] });
      // Without an OAuth client the call fails fast; with one it would open the browser.
      const google = googleSignIn ? null : await ai.connectGoogle();
      const badKey = await ai.save({ model: 'gemini-flash-latest', apiKey: 'senha' }).then(
        () => false,
        () => true,
      );
      const saved = await ai.save({
        model: 'gemini-flash-latest',
        apiKey: 'e2e-fake-gemini-key-not-a-secret-0001',
      });
      const removed = await ai.save({ model: 'gemini-flash-latest', apiKey: null });
      return { googleSignIn, chat, google, badKey, saved: JSON.stringify(saved), removed };
    });
    expect(api.chat).toEqual({ status: 'error', error: 'not-configured' });
    expect(api.badKey).toBe(true);
    expect(api.saved).toContain('"hasKey":true');
    expect(api.saved).not.toContain('e2e-fake-gemini-key');
    expect(api.removed.hasKey).toBe(false);

    // With a key (fake, never used here) the chat shows the prompt library.
    await page.evaluate(() =>
      (
        window as unknown as { didiflow: import('../../electron/ipc/contract').DidiflowApi }
      ).didiflow.ai.save({
        model: 'gemini-flash-latest',
        apiKey: 'e2e-fake-gemini-key-not-a-secret-0001',
      }),
    );
    await page.getByRole('link', { name: 'Hoje' }).click();
    await page.getByRole('link', { name: 'DidiBot' }).click();
    await page.getByRole('button', { name: 'Biblioteca de prompts' }).click();
    const library = page.getByRole('dialog');
    await library.getByRole('tab', { name: /Criar no DidiFlow/ }).click();
    await library.getByRole('button', { name: /Criar projeto com tarefas/ }).click();
    await expect(page.locator('#didibot-input')).toHaveValue(
      /Crie um projeto chamado \[nome do projeto\]/,
    );
    await expect(page.locator('#didibot-actions')).toBeVisible();
    await page.evaluate(() =>
      (
        window as unknown as { didiflow: import('../../electron/ipc/contract').DidiflowApi }
      ).didiflow.ai.save({ model: 'gemini-flash-latest', apiKey: null }),
    );
    await page.getByRole('link', { name: 'Hoje' }).click();
    await page.getByRole('link', { name: 'DidiBot' }).click();
    await expect(page.locator('#didibot-connect')).toBeVisible();

    if (api.googleSignIn) {
      // Google sign-in: the system browser gets an OAuth URL with PKCE and a loopback redirect.
      await page.getByRole('button', { name: 'Entrar com Google' }).click();
      await expect.poll(async () => (await opened())[0] ?? '').toContain('accounts.google.com');
      const auth = new URL((await opened())[0]);
      expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
      expect(auth.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(auth.searchParams.get('scope')).toContain('cloud-platform');
      await page.getByRole('link', { name: 'Usar uma chave própria' }).click();
      const card = page.locator('app-didibot-settings-card');
      await card.getByRole('button', { name: 'Criar chave no AI Studio' }).click();
      await expect
        .poll(async () => (await opened()).at(-1))
        .toBe('https://aistudio.google.com/apikey');
    } else {
      expect(api.google).toEqual({ status: 'error', error: 'not-configured' });
      await page.getByRole('link', { name: 'Conectar conta Google' }).click();
      const card = page.locator('app-didibot-settings-card');
      await expect(card).toContainText('Nenhuma conta Google conectada');
      await card.getByRole('button', { name: 'Conectar conta Google' }).click();
      await expect.poll(opened).toEqual(['https://aistudio.google.com/apikey']);
    }
  } finally {
    await close();
    removeDir(userDataDir);
  }
});

test('dashboard: chart bars use the legend and status colors', async () => {
  const { page, close, userDataDir } = await launchApp();
  try {
    await login(page, email);
    await page.getByRole('link', { name: 'Dashboard' }).click();
    const charts = page.locator('app-bar-chart');
    await expect(charts.first()).toBeVisible();
    const audit = await page.evaluate(() =>
      [...document.querySelectorAll('app-bar-chart')].map((chart) => ({
        legend: [...chart.querySelectorAll('.legend__dot')].map(
          (dot) => getComputedStyle(dot).backgroundColor,
        ),
        bars: [
          ...new Set([...chart.querySelectorAll('path.bar')].map((p) => p.getAttribute('fill'))),
        ],
      })),
    );
    // History: every bar color is one of the legend colors, and they are all different.
    const [history, status] = audit;
    expect(new Set(history.legend).size).toBe(3);
    for (const fill of history.bars) expect(history.legend).toContain(fill);
    // Status: bars follow the status colors (not a single series color).
    expect(status.bars.length).toBeGreaterThan(1);
  } finally {
    await close();
    removeDir(userDataDir);
  }
});
