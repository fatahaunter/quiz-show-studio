/**
 * Where players can open the app in a normal browser, e.g. https://example.com/quiz/ .
 * In a browser this is just the current page; inside the desktop or phone app the page address is
 * private (app:// or https://localhost), so the host enters their website here once in Settings.
 */
const KEY = 'qss:site';

export function normalizeSite(s: string): string | null {
  try {
    const u = new URL(s.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

export function getSite(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? normalizeSite(v) : null;
  } catch {
    return null;
  }
}

export function setSite(s: string | null) {
  try {
    if (s) localStorage.setItem(KEY, s);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Address players should open, or null if there is no public web address to give them. */
export function publicBase(): string | null {
  if (/^https?:$/.test(location.protocol) && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return location.origin + location.pathname;
  return getSite() ?? (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : null);
}
