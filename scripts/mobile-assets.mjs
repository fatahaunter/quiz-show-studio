// Writes launcher icons + splash screens into the native projects (run after `npx cap add`).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderPng, renderSplash } from './make-icons.mjs';

const dims = (file) => {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

// ---- Android ----
const res = 'android/app/src/main/res';
if (existsSync(res)) {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const dir = join(res, `mipmap-${d}`);
    writeFileSync(join(dir, 'ic_launcher.png'), renderPng(Math.round(48 * k), 'rounded'));
    writeFileSync(join(dir, 'ic_launcher_round.png'), renderPng(Math.round(48 * k), 'round'));
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), renderPng(Math.round(108 * k), 'foreground'));
  }
  writeFileSync(join(res, 'values/ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#080D22</color>\n</resources>\n');
  let n = 0;
  for (const d of readdirSync(res).filter((x) => /^drawable(-(land|port))?(-[a-z]*dpi)?$/.test(x))) {
    const f = join(res, d, 'splash.png');
    if (existsSync(f)) {
      const [w, h] = dims(f);
      writeFileSync(f, renderSplash(w, h));
      n++;
    }
  }
  console.log(`android: icons for ${Object.keys(dens).length} densities, ${n} splash images`);
}

// ---- iOS ----
const assets = 'ios/App/App/Assets.xcassets';
if (existsSync(assets)) {
  const icon = join(assets, 'AppIcon.appiconset');
  for (const f of readdirSync(icon).filter((x) => x.endsWith('.png'))) writeFileSync(join(icon, f), renderPng(1024, 'full'));
  const splash = join(assets, 'Splash.imageset');
  let n = 0;
  if (existsSync(splash)) {
    for (const f of readdirSync(splash).filter((x) => x.endsWith('.png'))) {
      const [w, h] = dims(join(splash, f));
      writeFileSync(join(splash, f), renderSplash(w, h));
      n++;
    }
  }
  console.log(`ios: app icon + ${n} splash images`);
}
