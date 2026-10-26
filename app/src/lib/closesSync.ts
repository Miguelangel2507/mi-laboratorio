import { db, getSetting, setSetting } from './db';
import { call, DEFAULT_ALERTS, normalizeUrl, tz, type AlertsConfig } from './alerts';
import { sheetCsvUrl } from './sheet';
import { upsertSnapshots, type Snapshot } from './closes';

export type SyncResult = { ok: true; saved: number; total: number } | { ok: false; error: string };

/**
 * Le pasa al servicio el enlace de tu hoja (para que guarde la foto de precios el último día de cada mes)
 * y recoge las fotos ya hechas. Solo viajan precios de fondos y el enlace de lectura de la hoja.
 */
export async function syncCloses(opts: { force?: boolean } = {}): Promise<SyncResult> {
  const cfg = await getSetting<AlertsConfig>('alerts', DEFAULT_ALERTS);
  const sheetUrl = await getSetting<string>('sheetUrl', '');
  if (!normalizeUrl(cfg.workerUrl) || !cfg.token) return { ok: false, error: 'Primero conecta el servicio en Ajustes > Avisos.' };
  if (!sheetCsvUrl(sheetUrl)) return { ok: false, error: 'Falta el enlace de tu hoja en Ajustes > Precios de fondos.' };
  const last = await getSetting<string | null>('closesSyncedAt', null);
  if (!opts.force && last && Date.now() - new Date(last).getTime() < 6 * 36e5) return { ok: true, saved: 0, total: await db.monthCloses.where('source').equals('worker').count() };
  try {
    await call(cfg, '/sheet', { method: 'POST', body: JSON.stringify({ url: sheetUrl, tz: tz() }) });
    const res = await call(cfg, '/snapshots');
    const { snapshots } = (await res.json()) as { snapshots: Snapshot[] };
    const saved = await upsertSnapshots(db, Array.isArray(snapshots) ? snapshots : []);
    await setSetting('closesSyncedAt', new Date().toISOString());
    return { ok: true, saved, total: await db.monthCloses.where('source').equals('worker').count() };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No se pudo sincronizar.' }; }
}

export async function testSheetRead(): Promise<{ ok: true; funds: number; newestDate: string | null } | { ok: false; error: string }> {
  const cfg = await getSetting<AlertsConfig>('alerts', DEFAULT_ALERTS);
  const sheetUrl = await getSetting<string>('sheetUrl', '');
  if (!normalizeUrl(cfg.workerUrl) || !cfg.token) return { ok: false, error: 'Primero conecta el servicio en Ajustes > Avisos.' };
  if (!sheetCsvUrl(sheetUrl)) return { ok: false, error: 'Falta el enlace de tu hoja en Ajustes > Precios de fondos.' };
  try {
    await call(cfg, '/sheet', { method: 'POST', body: JSON.stringify({ url: sheetUrl, tz: tz() }) });
    const res = await call(cfg, '/snapshot-test', { method: 'POST' });
    const j = (await res.json()) as { funds: number; newestDate: string | null };
    return { ok: true, funds: j.funds, newestDate: j.newestDate };
  } catch (e) {
    const m = e instanceof Error ? e.message : '';
    return { ok: false, error: /502/.test(m) ? 'El servicio no pudo leer tu hoja. Comprueba que se puede ver con el enlace (cualquiera con el enlace).' : m || 'No se pudo comprobar.' };
  }
}
