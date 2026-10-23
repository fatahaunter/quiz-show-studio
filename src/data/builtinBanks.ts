import { bankFromText, saveBank } from '../store/bank';

/** Question banks that ship inside the app. Each is added to the user's banks once, on first launch. */
export const BUILTIN_BANK_ID = 'builtin-jeopardy-2000';
const FLAG = `qss:seeded:${BUILTIN_BANK_ID}`;

/** Returns true if the bank was added. Deleting it later does not bring it back; re-import the .txt to restore. */
export async function seedBuiltinBanks(): Promise<boolean> {
  try {
    if (localStorage.getItem(FLAG)) return false;
  } catch {
    return false; // storage unavailable: don't re-seed on every load
  }
  const raw = (await import('./question-bank-2000.txt?raw')).default;
  const r = bankFromText(raw, 'Jeopardy Question Bank');
  if (!r.bank) return false;
  await saveBank({ ...r.bank, id: BUILTIN_BANK_ID });
  try {
    localStorage.setItem(FLAG, '1');
  } catch {
    /* ignore */
  }
  return true;
}
