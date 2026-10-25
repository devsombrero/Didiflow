export const APP_SCHEME = 'app';
export const APP_HOST = 'didiflow';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

const SUPABASE_CLOUD_SOURCES = ['https://*.supabase.co', 'wss://*.supabase.co'];
const SUPABASE_LOCAL_SOURCES = ['http://127.0.0.1:54321', 'ws://127.0.0.1:54321'];

/**
 * Content Security Policy served with every app:// response. Local Supabase
 * endpoints are only allowed in unpackaged (development) builds.
 */
export function buildContentSecurityPolicy(isPackaged: boolean): string {
  const connectSources = [
    "'self'",
    ...SUPABASE_CLOUD_SOURCES,
    ...(isPackaged ? [] : SUPABASE_LOCAL_SOURCES),
  ];

  return [
    "default-src 'self'",
    "script-src 'self'",
    // Angular injects component styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
