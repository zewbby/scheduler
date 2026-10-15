import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.liubai.planner',
  appName: '冲冲冲',
  webDir: 'dist',
  backgroundColor: '#f7f5ef',
  loggingBehavior: 'none',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    minWebViewVersion: 108,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
    },
  },
};

export default config;
