import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the built Electron app (npm run build && npm run
 * electron:build) against the local Supabase stack (npm run db:start).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
