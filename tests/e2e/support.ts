import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

export const SUPABASE_URL = process.env['DIDIFLOW_SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env['DIDIFLOW_SUPABASE_ANON_KEY'] ?? '';
const MAILPIT_URL = process.env['DIDIFLOW_MAILPIT_URL'] ?? 'http://127.0.0.1:54324';
export const PASSWORD = 'Secret123';

if (!['127.0.0.1', 'localhost'].includes(new URL(SUPABASE_URL).hostname)) {
  throw new Error('E2E tests create users and must only run against a local Supabase.');
}

async function readOtp(email: string, since: Date): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages = [] } = (await response.json()) as {
      messages?: { ID: string; Created: string }[];
    };
    const latest = messages.find((message) => new Date(message.Created) >= since);
    if (latest) {
      const message = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)
      ).json()) as {
        Text: string;
      };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No OTP e-mail for ${email}`);
}

/** Creates and confirms a fresh user through the real Auth API. */
export async function createConfirmedUser(name = 'E2E User'): Promise<string> {
  const email = `e2e.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@test.local`;
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 1000);
  const { error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: { data: { display_name: name } },
  });
  if (error) throw error;
  const verified = await client.auth.verifyOtp({
    email,
    token: await readOtp(email, since),
    type: 'email',
  });
  if (verified.error) throw verified.error;
  return email;
}

export interface App {
  app: ElectronApplication;
  page: Page;
  close(): Promise<void>;
}

/** Launches the built app (dist + dist-electron) with an isolated profile. */
export async function launchApp(userDataDir?: string): Promise<App & { userDataDir: string }> {
  const dir = userDataDir ?? mkdtempSync(path.join(tmpdir(), 'didiflow-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, DIDIFLOW_USER_DATA_DIR: dir, NODE_OPTIONS: '' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return {
    app,
    page,
    userDataDir: dir,
    close: async () => {
      await app.close();
    },
  };
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export async function login(page: Page, email: string): Promise<void> {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('.sidebar').waitFor();
}
