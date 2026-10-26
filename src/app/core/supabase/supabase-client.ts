import { inject, InjectionToken } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { DesktopBridge } from '../platform/desktop-bridge';
import { isNativeMobile, mobileSessionStore } from '../platform/mobile-platform';
import { createAuthStorage } from './auth-storage';
import type { Database } from './database.types';

export type DidiflowSupabaseClient = SupabaseClient<Database>;

export const SUPABASE_CLIENT = new InjectionToken<DidiflowSupabaseClient>('SUPABASE_CLIENT', {
  providedIn: 'root',
  factory: () => {
    const env = inject(APP_ENVIRONMENT);
    const bridge = inject(DesktopBridge);
    return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        // Desktop: OS-encrypted store; Android: app-private Preferences.
        storage: createAuthStorage(
          bridge.secureStore ?? (isNativeMobile() ? mobileSessionStore() : null),
          window.localStorage,
        ),
        persistSession: true,
        autoRefreshToken: true,
        // Auth uses OTP codes; there are no redirect URLs to parse.
        detectSessionInUrl: false,
      },
    });
  },
});
