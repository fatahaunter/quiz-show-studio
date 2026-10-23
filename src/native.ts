import { Capacitor } from '@capacitor/core';

/** True inside the Android / iPhone app (Capacitor), false in a browser or the desktop app. */
export const isNative = () => Capacitor.isNativePlatform();

/**
 * Phones can't "download" a blob link, so write the file to the app cache and open the system share
 * sheet (Save to Files, Drive, email, AirDrop...). Plugins load lazily so the web build stays small.
 */
export async function shareFile(name: string, text: string) {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const safe = name.replace(/[^\w.-]+/g, '_');
  const w = await Filesystem.writeFile({ path: safe, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: safe, url: w.uri, dialogTitle: 'Save or share' });
}
