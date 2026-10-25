import { expect, test } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
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
      api: ['notify', 'onNavigate', 'openExternal', 'platform', 'saveFile', 'secureStore'],
    });
    await expect(
      page.evaluate(() =>
        (
          window as unknown as { didiflow: { openExternal(u: string): Promise<void> } }
        ).didiflow.openExternal('file:///C:/Windows/System32/calc.exe'),
      ),
    ).rejects.toThrow();
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
    await page.getByRole('link', { name: 'Nova tarefa' }).first().click();
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
