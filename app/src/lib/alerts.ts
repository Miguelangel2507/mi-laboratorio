import { getSetting, setSetting, type PlanConfig } from './db';
import { DEFAULT_PLAN } from './plan';
import { isIOS, isStandalone } from './storage';

export interface Reminder {
  id: string; text: string; hour: number;
  /** Día del mes (1–31; en meses cortos se avisa el último día). */
  day?: number;
  /** Día de la semana (0 = domingo). */
  weekday?: number;
  /** Ruta que se abre al tocar el aviso. */
  url?: string;
}

export interface AlertsConfig {
  workerUrl: string; token: string; enabled: boolean; hour: number; planReminder: boolean; backupReminder: boolean;
}
export const DEFAULT_ALERTS: AlertsConfig = { workerUrl: '', token: '', enabled: false, hour: 9, planReminder: true, backupReminder: true };

/** Solo viajan textos genéricos: el servicio nunca recibe importes, cuentas ni saldos. */
export function buildReminders(cfg: AlertsConfig, plan: PlanConfig): Reminder[] {
  const out: Reminder[] = [];
  if (cfg.planReminder && plan.active) out.push({ id: 'plan', text: 'Hoy toca tu plan de inversión: confirma las aportaciones de este mes.', hour: cfg.hour, day: plan.day, url: '#/investments/plan' });
  if (cfg.backupReminder) out.push({ id: 'backup', text: 'Haz una copia de seguridad de tus datos (Ajustes > Copia).', hour: cfg.hour, weekday: 0, url: '#/settings/data' });
  return out;
}

export function normalizeUrl(input: string): string | null {
  const s = input.trim().replace(/\/+$/, '');
  try {
    const u = new URL(s);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return `${u.origin}${u.pathname === '/' ? '' : u.pathname}`;
  } catch { return null; }
}

export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type Result = { ok: true; message?: string } | { ok: false; error: string };

export function supportProblem(): string | null {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return isIOS() && !isStandalone()
      ? 'En el iPhone los avisos solo funcionan con la app instalada: Compartir > Añadir a pantalla de inicio, y ábrela desde el icono.'
      : 'Este navegador no admite notificaciones push.';
  }
  return null;
}

export async function call(cfg: AlertsConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const url = normalizeUrl(cfg.workerUrl);
  if (!url) throw new Error('La dirección del servicio no es válida (debe empezar por https://).');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${cfg.token}`);
  if (init.body) headers.set('content-type', 'application/json');
  let res: Response;
  try { res = await fetch(`${url}${path}`, { ...init, headers }); } catch { throw new Error('No se pudo conectar con el servicio. Revisa la dirección y tu conexión.'); }
  if (res.status === 401 || res.status === 403) throw new Error('El código secreto no coincide con el del servicio.');
  if (!res.ok) throw new Error(`El servicio respondió con un error (${res.status}).`);
  return res;
}

export const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

async function currentSubscription(cfg: AlertsConfig, create: boolean): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing || !create) return existing;
  const url = normalizeUrl(cfg.workerUrl)!;
  let key: string;
  try { key = (await (await fetch(`${url}/vapid-public-key`)).text()).trim(); } catch { throw new Error('No se pudo conectar con el servicio.'); }
  if (!key) throw new Error('El servicio no tiene clave de avisos configurada.');
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
}

/** Debe llamarse directamente desde un toque del usuario (iOS lo exige para pedir permiso). */
export async function enableAlerts(cfg: AlertsConfig, plan: PlanConfig): Promise<Result> {
  const problem = supportProblem();
  if (problem) return { ok: false, error: problem };
  if (!normalizeUrl(cfg.workerUrl)) return { ok: false, error: 'La dirección del servicio no es válida (debe empezar por https://).' };
  if (!cfg.token.trim()) return { ok: false, error: 'Falta el código secreto.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'No has dado permiso. Actívalo en Ajustes del iPhone > Notificaciones > esta app.' };
  try {
    const sub = await currentSubscription(cfg, true);
    await call(cfg, '/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub!.toJSON(), reminders: buildReminders(cfg, plan), tz: tz() }) });
    await setSetting('alerts', { ...cfg, enabled: true });
    return { ok: true, message: 'Avisos activados. Pulsa «Enviar aviso de prueba» para comprobarlo.' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No se pudo activar.' }; }
}

export async function sendTest(cfg: AlertsConfig): Promise<Result> {
  try { await call(cfg, '/test', { method: 'POST' }); return { ok: true, message: 'Enviado. Debería llegarte en unos segundos (con la app cerrada o en segundo plano).' }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No se pudo enviar.' }; }
}

export async function disableAlerts(cfg: AlertsConfig): Promise<Result> {
  try {
    await call(cfg, '/subscribe', { method: 'DELETE' }).catch(() => undefined);
    const sub = await currentSubscription(cfg, false);
    await sub?.unsubscribe();
    await setSetting('alerts', { ...cfg, enabled: false });
    return { ok: true, message: 'Avisos desactivados.' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No se pudo desactivar.' }; }
}

/** Reenvía los recordatorios (por ejemplo, tras cambiar el día del plan). Silencioso si no hay avisos. */
export async function syncRemindersIfEnabled(): Promise<void> {
  try {
    const cfg = await getSetting<AlertsConfig>('alerts', DEFAULT_ALERTS);
    if (!cfg.enabled || supportProblem()) return;
    const plan = await getSetting<PlanConfig>('plan', DEFAULT_PLAN);
    const sub = await currentSubscription(cfg, false);
    if (!sub) return;
    await call(cfg, '/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), reminders: buildReminders(cfg, plan), tz: tz() }) });
  } catch { /* se reintentará la próxima vez */ }
}
