import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.ascustodiowebdev.fishmap',
  appName: 'Fishmap',
  webDir: 'public',
  android: {
    useLegacyBridge: true
  },
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: false,
        androidScheme: 'https'
      }
    : undefined
};

export default config;
