import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quizshowstudio.app',
  appName: 'Quiz Show Studio',
  webDir: 'dist',
  backgroundColor: '#080d22',
  // Needed only for the optional self-hosted LAN connection server (ws:// on your Wi-Fi). The default
  // public server uses wss:// and works without it.
  android: { allowMixedContent: true },
  server: { cleartext: true },
  // dark UI: always use light status-bar icons, whatever the phone's own theme is
  plugins: { SystemBars: { style: 'DARK' } },
  ios: { contentInset: 'never', backgroundColor: '#080d22' },
};

export default config;
