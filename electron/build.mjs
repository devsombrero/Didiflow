// Bundles the Electron main and preload scripts into dist-electron/.
// The preload must be a single CommonJS file: sandboxed preloads cannot
// require local modules.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' });
