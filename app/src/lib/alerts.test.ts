import { describe, expect, it } from 'vitest';
import { AppDB } from './db';
import { DEFAULT_ALERTS, buildReminders, normalizeUrl, urlBase64ToUint8Array } from './alerts';
import { exportBackup, restoreBackup } from './backup';

describe('recordatorios', () => {
  const plan = { day: 1, accountId: null, active: true };
  it('avisa el día del plan y cada domingo, a la hora elegida', () => {
    const r = buildReminders({ ...DEFAULT_ALERTS, hour: 8 }, plan);
    expect(r).toEqual([
      expect.objectContaining({ id: 'plan', day: 1, hour: 8 }),
      expect.objectContaining({ id: 'backup', weekday: 0, hour: 8 }),
    ]);
  });
  it('no avisa del plan si está desactivado ni de lo que el usuario apague', () => {
    expect(buildReminders(DEFAULT_ALERTS, { ...plan, active: false }).map((x) => x.id)).toEqual(['backup']);
    expect(buildReminders({ ...DEFAULT_ALERTS, backupReminder: false, planReminder: false }, plan)).toEqual([]);
  });
  it('los textos son genéricos: ni cifras ni nombres de fondos', () => {
    for (const r of buildReminders(DEFAULT_ALERTS, plan)) expect(r.text).not.toMatch(/\d|€/);
  });
});

describe('dirección del servicio', () => {
  it('exige https y quita barras finales', () => {
    expect(normalizeUrl(' https://avisos.ejemplo.workers.dev/ ')).toBe('https://avisos.ejemplo.workers.dev');
    expect(normalizeUrl('http://avisos.ejemplo.com')).toBeNull();
    expect(normalizeUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(normalizeUrl('no es una url')).toBeNull();
  });
  it('convierte la clave VAPID de base64url a bytes', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });
});

describe('el código secreto de avisos', () => {
  it('no viaja en la copia, y se conserva en el dispositivo al restaurar', async () => {
    const d = new AppDB(`alerts-${Math.random()}`);
    await d.settings.put({ key: 'alerts', value: { ...DEFAULT_ALERTS, token: 'MUY-SECRETO', workerUrl: 'https://x.dev' } });
    await d.settings.put({ key: 'alertsKeys', value: { publicKey: 'PUB', privateKey: 'CLAVE-PRIVADA-SECRETA', token: 'TOK' } });
    await d.settings.put({ key: 'currency', value: 'EUR' });
    const b = await exportBackup(d, { includeSheetUrl: true });
    expect(JSON.stringify(b)).not.toContain('MUY-SECRETO');
    expect(JSON.stringify(b)).not.toContain('CLAVE-PRIVADA-SECRETA');
    await restoreBackup(d, JSON.parse(JSON.stringify(b)));
    expect(((await d.settings.get('alerts'))!.value as { token: string }).token).toBe('MUY-SECRETO');
    expect((await d.settings.get('currency'))!.value).toBe('EUR');
    expect(await d.settings.get('alertsKeys')).toBeTruthy();
  });
});
