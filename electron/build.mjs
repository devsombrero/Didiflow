// Bundles the Electron main and preload scripts into dist-electron/.
// The preload must be a single CommonJS file: sandboxed preloads cannot
// require local modules.
import { createCipheriv, randomBytes } from 'node:crypto';
import { build } from 'esbuild';
import { loadEnv } from '../scripts/load-env.mjs';

loadEnv();

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

// Optional default Gmail account for notification e-mails (desktop main process
// only). Sealed with AES-256-GCM under a random per-build key; the format must
// match electron/ipc/builtin-email.ts. Never logged.
function sealBuiltInEmail() {
  const address = process.env.DIDIFLOW_GMAIL_ADDRESS?.trim().toLowerCase() ?? '';
  const pass = (process.env.DIDIFLOW_GMAIL_APP_PASSWORD ?? '').replace(/\s+/g, '').toLowerCase();
  if (!address && !pass) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || !/^[a-z]{16}$/.test(pass)) {
    console.error(
      'electron:build: DIDIFLOW_GMAIL_ADDRESS must be an e-mail and DIDIFLOW_GMAIL_APP_PASSWORD a 16-letter Gmail app password',
    );
    process.exit(1);
  }
  const key = randomBytes(32);
  const mask = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ address, pass }), 'utf8'),
    cipher.final(),
  ]);
  const payload = {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    mask: mask.toString('base64'),
    masked: Buffer.from(key.map((byte, i) => byte ^ mask[i])).toString('base64'),
  };
  console.log('electron:build: built-in e-mail account embedded (encrypted)');
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
  define: {
    __SUPABASE_ORIGIN__: JSON.stringify(supabaseOrigin),
    __BUILTIN_EMAIL__: JSON.stringify(sealBuiltInEmail()),
  },
};

await Promise.all([
  build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' }),
  build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' }),
]);
