// Loads build configuration for the scripts (write-env, electron build,
// Android build).
//
// Precedence: variables already in the environment (CI secrets) win, then the
// file named by DIDIFLOW_ENV_FILE (e.g. .env.production for release builds
// against the cloud Supabase), then the local .env (development). Node's
// loadEnvFile never overwrites a variable that is already set.
import { existsSync } from 'node:fs';

export function loadEnv() {
  const file = process.env.DIDIFLOW_ENV_FILE;
  if (file) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
    } else if (!process.env.DIDIFLOW_SUPABASE_URL) {
      console.error(
        `load-env: ${file} not found and DIDIFLOW_SUPABASE_URL is not set.\nSee .env.example and docs/release.md.`,
      );
      process.exit(1);
    }
  }
  if (existsSync('.env')) process.loadEnvFile('.env');
}
