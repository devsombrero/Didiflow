// Bundles the Electron main and preload scripts into dist-electron/.
// The preload must be a single CommonJS file: sandboxed preloads cannot
// require local modules.
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

if (existsSync('.env')) process.loadEnvFile('.env');

// The CSP restricts connect-src to the Supabase project the app is built for.
let supabaseOrigin = '';
if (process.env.DIDIFLOW_SUPABASE_URL) {
  try {
    supabaseOrigin = new URL(process.env.DIDIFLOW_SUPABASE_URL).origin;
  } catch {
    console.error('electron:build: DIDIFLOW_SUPABASE_URL is not a valid URL');
    process.exit(1);
  }
}

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
  define: { __SUPABASE_ORIGIN__: JSON.stringify(supabaseOrigin) },
};

await Promise.all([
  build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' }),
  build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' }),
]);
