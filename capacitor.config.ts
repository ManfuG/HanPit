import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.manfug.hanpit',
  appName: 'HanPit',
  webDir: 'dist',
  server: { hostname: 'localhost', androidScheme: 'https' },
  android: { backgroundColor: '#142720', minWebViewVersion: 119 },
  plugins: { SystemBars: { insetsHandling: 'disable', style: 'DARK' } },
};

export default config;
