import type { CapacitorConfig } from '@capacitor/cli';

// Android build of the same Angular app (see docs/mobile.md).
const config: CapacitorConfig = {
  appId: 'app.didiflow.mobile',
  appName: 'DidiFlow',
  webDir: 'dist/didiflow-mobile/browser',
  android: {
    // Debug builds may talk to a local Supabase over http on the LAN (the
    // network security config limits cleartext to that host).
    allowMixedContent: (process.env.DIDIFLOW_SUPABASE_URL ?? '').startsWith('http:'),
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_didiflow',
      iconColor: '#0284c7',
    },
  },
};

export default config;
