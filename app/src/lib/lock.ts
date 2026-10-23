import { getSetting, setSetting } from './db';

const enc = new TextEncoder();
async function hash(pin: string, salt: string) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
export async function setPin(pin: string) {
  const salt = crypto.randomUUID();
  await setSetting('pinSalt', salt);
  await setSetting('pinHash', await hash(pin, salt));
}
export async function clearPin() { await setSetting('pinHash', null); await setSetting('pinSalt', null); }
export async function checkPin(pin: string) {
  const [salt, h] = await Promise.all([getSetting<string>('pinSalt', ''), getSetting<string | null>('pinHash', null)]);
  return !!h && (await hash(pin, salt)) === h;
}
export const isUnlocked = () => { try { return sessionStorage.getItem('unlocked') === '1'; } catch { return false; } };
export const setUnlocked = (v: boolean) => { try { v ? sessionStorage.setItem('unlocked', '1') : sessionStorage.removeItem('unlocked'); } catch { /* sin sessionStorage */ } };
