import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.pocketforge.ide',
  appName: 'PocketForge IDE',
  webDir: 'dist',
  android: {
    // Android 15 (targetSdk 35) enforces edge-to-edge; without this the web
    // content renders under the status bar and the top app bar is obscured.
    // Capacitor 7 defaults to 'disable', so opt in explicitly.
    adjustMarginsForEdgeToEdge: 'auto',
  },
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
