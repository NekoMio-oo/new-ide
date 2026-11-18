import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.pocketforge.ide',
  appName: 'PocketForge IDE',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['127.0.0.1'],
  },
  plugins: {
    PocketForgeNative: {
      daemonPort: 19527,
      enableForegroundProtection: true,
    },
  },
};

export default config;
