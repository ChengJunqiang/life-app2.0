import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.life.mobile',
  appName: 'Life',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    iosScheme: 'capacitor',
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
