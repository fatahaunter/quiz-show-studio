// Builds the Android app and copies it to release/QuizShowStudio.apk
//   debug (default): installable on any phone by sideloading, signed with the debug key
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
if (!existsSync(sdk)) {
  console.error('Android SDK not found. Install Android Studio or set ANDROID_HOME.');
  process.exit(1);
}

// Gradle reads the SDK location from android/local.properties (machine specific, not committed).
// Properties files need backslashes and colons escaped.
const escaped = sdk.split('\\').join('\\\\').split(':').join('\\:');
writeFileSync('android/local.properties', 'sdk.dir=' + escaped + '\n');

const win = process.platform === 'win32';
const r = spawnSync(win ? '.\\gradlew.bat' : './gradlew', ['assembleDebug'], { cwd: 'android', stdio: 'inherit', shell: win });
if (r.status !== 0) process.exit(r.status ?? 1);

mkdirSync('release', { recursive: true });
copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'release/QuizShowStudio.apk');
console.log('APK: release/QuizShowStudio.apk');
