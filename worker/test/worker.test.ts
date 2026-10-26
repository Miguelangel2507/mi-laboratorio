import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import worker, { isAllowedEndpoint, type Env } from '../src/index';
import { dueReminders, isValidTimeZone, localTime, sanitizeReminders } from '../src/schedule';

// Los tipos de Cloudflare y los de Node discrepan en WebCrypto; en los tests se usa la API de Node tal cual.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const crypto: any = webcrypto;

const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

class FakeKV {
  m = new Map<string, string>();
  async get(k: string, type?: string) { const v = this.m.get(k); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; }
  async put(k: string, v: string) { this.m.set(k, v); }
  async delete(k: string) { this.m.delete(k); }
  async list(o: { prefix?: string }) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(o.prefix ?? '')).map((name) => ({ name })) }; }
}

let env: Env & { KV: FakeKV };
let vapidPub: Uint8Array;
let client: { priv: CryptoKey; pub: Uint8Array; auth: Uint8Array };

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  vapidPub = new Uint8Array([4, ...fromB64u(jwk.x!), ...fromB64u(jwk.y!)]);
  env = { KV: new FakeKV(), OWNER_TOKEN: 'secreto-de-prueba', VAPID_PUBLIC_KEY: b64u(vapidPub), VAPID_PRIVATE_KEY: jwk.d!, VAPID_SUBJECT: 'mailto:t@example.com', ALLOWED_ORIGIN: 'https://miguelangel2507.github.io' } as never;
  const ck = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  client = { priv: ck.privateKey, pub: new Uint8Array(await crypto.subtle.exportKey('raw', ck.publicKey)), auth: crypto.getRandomValues(new Uint8Array(16)) };
});
afterEach(() => { vi.unstubAllGlobals(); (env.KV as FakeKV).m.clear(); });

const subscription = () => ({ endpoint: 'https://web.push.apple.com/abc123', expirationTime: null, keys: { p256dh: b64u(client.pub), auth: b64u(client.auth) } });
const auth = { authorization: 'Bearer secreto-de-prueba', origin: 'https://miguelangel2507.github.io', 'content-type': 'application/json' };
const req = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = auth) =>
  new Request(`https://avisos.example.workers.dev${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

/** Descifra un mensaje Web Push (RFC 8291, aes128gcm) como lo haría el navegador del móvil. */
async function decrypt(body: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16), idlen = body[20], serverPub = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  const hkdf = async (saltB: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) => {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: saltB, info }, k, len * 8));
  };
  const te = new TextEncoder();
  const sPub = await crypto.subtle.importKey('raw', serverPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: sPub }, client.priv, 256));
  const keyInfo = new Uint8Array([...te.encode('WebPush: info\0'), ...client.pub, ...serverPub]);
  const ikm = await hkdf(client.auth, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  let end = plain.length - 1;
  while (end > 0 && plain[end] === 0) end--; // quita el relleno
  return new TextDecoder().decode(plain.slice(0, end)); // el último byte es el delimitador 0x02
}

/** Comprueba la firma VAPID (RFC 8292) con la clave pública. */
async function verifyVapid(authorization: string, endpointOrigin: string) {
  const m = authorization.match(/^vapid t=([^,]+), k=(.+)$/)!;
  expect(m[2]).toBe(env.VAPID_PUBLIC_KEY);
  const [h, p, s] = m[1].split('.');
  const key = await crypto.subtle.importKey('raw', vapidPub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64u(s), new TextEncoder().encode(`${h}.${p}`));
  expect(ok).toBe(true);
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  expect(claims.aud).toBe(endpointOrigin);
  expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
}

describe('horarios', () => {
  it('la hora local respeta la zona y el cambio de hora', () => {
    // 29 oct 2026 07:00 UTC = 08:00 en Madrid (horario de invierno ya desde el 25 oct)
    expect(localTime(new Date('2026-10-29T07:00:00Z'), 'Europe/Madrid')).toMatchObject({ date: '2026-10-29', hour: 8, weekday: 4, day: 29, lastDay: 31 });
    // 1 jul 2026 07:00 UTC = 09:00 en Madrid (verano)
    expect(localTime(new Date('2026-07-01T07:00:00Z'), 'Europe/Madrid')).toMatchObject({ hour: 9, day: 1 });
    // medianoche local no es «24»
    expect(localTime(new Date('2026-11-01T23:00:00Z'), 'Europe/Madrid').hour).toBe(0);
  });
  it('avisa el día del mes a su hora, y solo entonces', () => {
    const r = [{ id: 'plan', text: 'x', hour: 9, day: 1 }];
    expect(dueReminders(new Date('2026-11-01T08:00:00Z'), 'Europe/Madrid', r).due).toHaveLength(1);
    expect(dueReminders(new Date('2026-11-01T07:00:00Z'), 'Europe/Madrid', r).due).toHaveLength(0);
    expect(dueReminders(new Date('2026-11-02T08:00:00Z'), 'Europe/Madrid', r).due).toHaveLength(0);
  });
  it('un aviso del día 31 salta al último día de los meses cortos', () => {
    const r = [{ id: 'fin', text: 'x', hour: 9, day: 31 }];
    expect(dueReminders(new Date('2026-02-28T08:00:00Z'), 'Europe/Madrid', r).due).toHaveLength(1);
    expect(dueReminders(new Date('2026-02-27T08:00:00Z'), 'Europe/Madrid', r).due).toHaveLength(0);
    expect(dueReminders(new Date('2026-04-30T07:00:00Z'), 'Europe/Madrid', r).due).toHaveLength(1);
  });
  it('los avisos semanales caen en su día', () => {
    const r = [{ id: 'copia', text: 'x', hour: 10, weekday: 0 }];
    expect(dueReminders(new Date('2026-10-25T09:00:00Z'), 'Europe/Madrid', r).due).toHaveLength(1); // domingo 25 oct
    expect(dueReminders(new Date('2026-10-26T09:00:00Z'), 'Europe/Madrid', r).due).toHaveLength(0);
  });
  it('valida zonas y recordatorios del cliente', () => {
    expect(isValidTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidTimeZone('Marte/Olimpo')).toBe(false);
    expect(sanitizeReminders([{ id: 'a', text: 'hola', hour: 9, day: 1, url: '#/investments/plan' }])).toHaveLength(1);
    for (const bad of [[{ id: 'a', text: 'x', hour: 24, day: 1 }], [{ id: 'a', text: 'x', hour: 9 }], [{ id: 'a', text: 'x', hour: 9, day: 1, weekday: 1 }],
      [{ id: 'a b', text: 'x', hour: 9, day: 1 }], [{ id: 'a', text: 'x'.repeat(141), hour: 9, day: 1 }], [{ id: 'a', text: 'x', hour: 9, day: 1, url: 'https://malo.com' }], 'no', new Array(11).fill({ id: 'a', text: 'x', hour: 1, day: 1 })]) {
      expect(sanitizeReminders(bad)).toBeNull();
    }
  });
});

describe('servicio', () => {
  it('solo acepta los servicios de push de los navegadores conocidos', () => {
    expect(isAllowedEndpoint('https://web.push.apple.com/x')).toBe(true);
    expect(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isAllowedEndpoint('http://web.push.apple.com/x')).toBe(false);
    expect(isAllowedEndpoint('https://evil.example.com/x')).toBe(false);
    expect(isAllowedEndpoint('https://web.push.apple.com.evil.com/x')).toBe(false);
  });
  it('la clave pública se sirve sin código, pero todo lo demás lo exige', async () => {
    expect(await (await worker.fetch(req('/vapid-public-key', 'GET', undefined, { origin: 'https://miguelangel2507.github.io' }), env)).text()).toBe(env.VAPID_PUBLIC_KEY);
    for (const [p, m] of [['/subscribe', 'POST'], ['/subscribe', 'DELETE'], ['/test', 'POST']] as const) {
      expect((await worker.fetch(req(p, m, {}, { origin: 'https://miguelangel2507.github.io' }), env)).status).toBe(401);
      expect((await worker.fetch(req(p, m, {}, { authorization: 'Bearer otro' }), env)).status).toBe(401);
    }
  });
  it('CORS: solo contesta con permiso a tu web', async () => {
    const ok = await worker.fetch(req('/vapid-public-key', 'GET', undefined, { origin: 'https://miguelangel2507.github.io' }), env);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://miguelangel2507.github.io');
    const bad = await worker.fetch(req('/vapid-public-key', 'GET', undefined, { origin: 'https://otra-web.com' }), env);
    expect(bad.headers.get('access-control-allow-origin')).toBe('null');
    expect((await worker.fetch(req('/subscribe', 'OPTIONS', undefined, { origin: 'https://miguelangel2507.github.io' }), env)).status).toBe(204);
  });
  it('rechaza suscripciones, horarios y zonas no válidos sin guardar nada', async () => {
    const good = { subscription: subscription(), reminders: [{ id: 'plan', text: 'hola', hour: 9, day: 1 }], tz: 'Europe/Madrid' };
    for (const bad of [{ ...good, subscription: { ...subscription(), endpoint: 'https://evil.example.com/x' } }, { ...good, reminders: [{ id: 'x', text: 'y', hour: 99, day: 1 }] }, { ...good, tz: 'Nope/Nope' }, { ...good, subscription: { endpoint: 'https://web.push.apple.com/x' } }]) {
      expect((await worker.fetch(req('/subscribe', 'POST', bad), env)).status).toBe(400);
    }
    expect(env.KV.m.size).toBe(0);
    expect((await worker.fetch(req('/subscribe', 'POST', good), env)).status).toBe(200);
    expect(env.KV.m.has('sub')).toBe(true);
    expect((await worker.fetch(req('/subscribe', 'DELETE'), env)).status).toBe(200);
    expect(env.KV.m.has('sub')).toBe(false);
  });

  async function subscribed(reminders = [{ id: 'plan', text: 'Hoy toca tu plan de inversión.', hour: 9, day: 1, url: '#/investments/plan' }]) {
    await worker.fetch(req('/subscribe', 'POST', { subscription: subscription(), reminders, tz: 'Europe/Madrid' }), env);
  }

  it('el aviso de prueba llega cifrado, firmado y descifrable por el móvil', async () => {
    await subscribed();
    const sent: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { sent.push({ url, init }); return new Response(null, { status: 201 }); }));
    const res = await worker.fetch(req('/test', 'POST'), env);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://web.push.apple.com/abc123');
    const headers = sent[0].init.headers as Record<string, string>;
    expect(headers['content-encoding']).toBe('aes128gcm');
    await verifyVapid(headers.authorization, 'https://web.push.apple.com');
    const msg = JSON.parse(await decrypt(sent[0].init.body as Uint8Array));
    expect(msg).toMatchObject({ title: 'Mi Patrimonio', body: 'Aviso de prueba: todo funciona.', url: '#/settings/alerts' });
  });

  it('el cron envía el aviso en su hora una sola vez, con su ruta, y lo recuerda', async () => {
    await subscribed();
    const sent: RequestInit[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { sent.push(init); return new Response(null, { status: 201 }); }));
    const t = new Date('2026-11-01T08:00:00Z').getTime(); // 09:00 en Madrid
    await worker.scheduled({ scheduledTime: t, cron: '0 * * * *' } as ScheduledController, env);
    await worker.scheduled({ scheduledTime: t + 60_000, cron: '0 * * * *' } as ScheduledController, env); // reintento en la misma hora
    expect(sent).toHaveLength(1);
    expect(JSON.parse(await decrypt(sent[0].body as Uint8Array))).toMatchObject({ body: 'Hoy toca tu plan de inversión.', url: '#/investments/plan', tag: 'plan' });
    // otra hora u otro día: nada
    await worker.scheduled({ scheduledTime: t + 3_600_000, cron: '' } as ScheduledController, env);
    await worker.scheduled({ scheduledTime: t + 86_400_000, cron: '' } as ScheduledController, env);
    expect(sent).toHaveLength(1);
    // y el mes siguiente vuelve a avisar
    await worker.scheduled({ scheduledTime: new Date('2026-12-01T08:00:00Z').getTime(), cron: '' } as ScheduledController, env);
    expect(sent).toHaveLength(2);
  });

  it('si el móvil ya no acepta avisos (410), se borra la suscripción', async () => {
    await subscribed();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 410 })));
    await worker.scheduled({ scheduledTime: new Date('2026-11-01T08:00:00Z').getTime(), cron: '' } as ScheduledController, env);
    expect(env.KV.m.has('sub')).toBe(false);
  });

  it('si el servicio de push falla, no marca el aviso como enviado y reintenta', async () => {
    await subscribed();
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: n++ === 0 ? 503 : 201 })));
    const t = new Date('2026-11-01T08:00:00Z').getTime();
    await worker.scheduled({ scheduledTime: t, cron: '' } as ScheduledController, env);
    await worker.scheduled({ scheduledTime: t + 60_000, cron: '' } as ScheduledController, env);
    expect(n).toBe(2);
  });

  it('sin suscripción no hace nada', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    await worker.scheduled({ scheduledTime: Date.now(), cron: '' } as ScheduledController, env);
    expect(f).not.toHaveBeenCalled();
  });
});


import { buildSnapshot, parseSheetCsv, parseVl, sheetCsvUrl, snapshotWindow } from '../src/sheet';

const CSV = [
  '"ISIN","Nombre","VL","Fecha","",""',
  '"IE00BYX5MX67","Fidelity S&P 500","16,83","2026-10-23","",""',
  '"ES0110862010","Aspe Global FI B","","","",""',
  '"N5546","Horos Internacional PPES","142,28191","2026-10-22","",""',
  '"N5116","Azvalor","1.289,5","2026-11-02","",""',
  '"","","","","",""',
].join('\n');
const SHEET = 'https://docs.google.com/spreadsheets/d/1YXFhoWvz4Q0skOrt8x-PVn5Imvh1DWfWFt8yaju9GzI/edit?usp=sharing';

describe('hoja de precios', () => {
  it('lee VL con coma decimal y puntos de millar, y omite lo manual o sin fecha', () => {
    expect(parseVl('16,9271')).toBe(16.9271);
    expect(parseVl('1.289,5')).toBe(1289.5);
    expect(parseVl('')).toBeNull();
    expect(parseVl('abc')).toBeNull();
    expect(parseVl('0')).toBeNull();
    const p = parseSheetCsv(CSV);
    expect(p.map((x) => x.key)).toEqual(['IE00BYX5MX67', 'N5546', 'N5116']);
    expect(p[0]).toEqual({ key: 'IE00BYX5MX67', priceE5: 1683000, date: '2026-10-23' });
  });
  it('del enlace solo toma el identificador y construye siempre una dirección de docs.google.com', () => {
    expect(sheetCsvUrl(SHEET)).toBe('https://docs.google.com/spreadsheets/d/1YXFhoWvz4Q0skOrt8x-PVn5Imvh1DWfWFt8yaju9GzI/gviz/tq?tqx=out:csv');
    expect(sheetCsvUrl(SHEET.replace('/edit?usp=sharing', '/edit#gid=123'))).toContain('&gid=123');
    for (const bad of ['https://evil.com/spreadsheets/d/1YXFhoWvz4Q0skOrt8x', 'http://docs.google.com/spreadsheets/d/1YXFhoWvz4Q0skOrt8x',
      'https://docs.google.com.evil.com/spreadsheets/d/1YXFhoWvz4Q0skOrt8x', 'https://docs.google.com/document/d/1YXFhoWvz4Q0skOrt8x', 'no', 42, null, 'https://docs.google.com/spreadsheets/d/corto']) {
      expect(sheetCsvUrl(bad)).toBeNull();
    }
  });
});

describe('ventana de cierre de mes', () => {
  it('solo el último día del mes a partir de las 21:00 locales', () => {
    // 31 oct 2026 20:00 UTC = 21:00 en Madrid (horario de verano ya terminado el 25 oct: UTC+1)
    expect(snapshotWindow(new Date('2026-10-31T19:59:00Z'), 'Europe/Madrid')).toBeNull(); // 20:59 local
    expect(snapshotWindow(new Date('2026-10-31T20:00:00Z'), 'Europe/Madrid')).toMatchObject({ month: '2026-10', date: '2026-10-31' });
    expect(snapshotWindow(new Date('2026-10-31T22:30:00Z'), 'Europe/Madrid')?.month).toBe('2026-10');
    expect(snapshotWindow(new Date('2026-10-31T23:00:00Z'), 'Europe/Madrid')).toBeNull(); // ya es 1 nov local
    expect(snapshotWindow(new Date('2026-10-30T21:00:00Z'), 'Europe/Madrid')).toBeNull(); // 30 oct no es el último día
  });
  it('febrero (también bisiesto) y meses de 30 días', () => {
    expect(snapshotWindow(new Date('2026-02-28T21:30:00Z'), 'Europe/Madrid')?.month).toBe('2026-02');
    expect(snapshotWindow(new Date('2028-02-28T21:30:00Z'), 'Europe/Madrid')).toBeNull();
    expect(snapshotWindow(new Date('2028-02-29T21:30:00Z'), 'Europe/Madrid')?.month).toBe('2028-02');
    expect(snapshotWindow(new Date('2026-04-30T20:30:00Z'), 'Europe/Madrid')?.month).toBe('2026-04'); // verano: UTC+2
  });
  it('respeta la zona del usuario', () => {
    expect(snapshotWindow(new Date('2026-10-31T21:00:00Z'), 'Atlantic/Canary')?.month).toBe('2026-10'); // UTC+0 en invierno... 21:00 local
    expect(snapshotWindow(new Date('2026-10-31T21:00:00Z'), 'America/Mexico_City')).toBeNull(); // 15:00 local
  });
  it('un precio con fecha posterior al cierre no entra en la foto', () => {
    const snap = buildSnapshot(parseSheetCsv(CSV), { month: '2026-10', date: '2026-10-31' }, new Date('2026-10-31T21:00:00Z'))!;
    expect(Object.keys(snap.prices)).toEqual(['IE00BYX5MX67', 'N5546']);
    expect(buildSnapshot([], { month: '2026-10', date: '2026-10-31' }, new Date())).toBeNull();
  });
});

describe('cierres mensuales en el servicio', () => {
  const sheetFetch = (status = 200, body = CSV) => vi.fn(async () => new Response(body, { status }));
  const setSheet = async () => { expect((await worker.fetch(req('/sheet', 'POST', { url: SHEET, tz: 'Europe/Madrid' }), env)).status).toBe(200); };
  const sched = (iso: string) => worker.scheduled({ scheduledTime: new Date(iso).getTime(), cron: '0 * * * *' } as ScheduledController, env);

  it('exige el código y solo acepta hojas de Google', async () => {
    expect((await worker.fetch(req('/sheet', 'POST', { url: SHEET }, { origin: 'https://miguelangel2507.github.io' }), env)).status).toBe(401);
    expect((await worker.fetch(req('/snapshots', 'GET', undefined, { origin: 'https://miguelangel2507.github.io' }), env)).status).toBe(401);
    expect((await worker.fetch(req('/sheet', 'POST', { url: 'https://evil.com/spreadsheets/d/1YXFhoWvz4Q0skOrt8x' }), env)).status).toBe(400);
    expect((await worker.fetch(req('/sheet', 'POST', { url: SHEET, tz: 'Marte/Olimpo' }), env)).status).toBe(400);
    expect(env.KV.m.has('sheet')).toBe(false);
  });
  it('la prueba lee la hoja y dice cuántos fondos hay, sin guardar nada', async () => {
    await setSheet();
    vi.stubGlobal('fetch', sheetFetch());
    const res = await worker.fetch(req('/snapshot-test', 'POST'), env);
    expect(await res.json()).toEqual({ ok: true, funds: 3, newestDate: '2026-11-02' });
    expect([...env.KV.m.keys()].filter((k) => k.startsWith('snap:'))).toEqual([]);
  });
  it('si la hoja no es pública o no responde, lo dice', async () => {
    await setSheet();
    vi.stubGlobal('fetch', sheetFetch(200, '<!DOCTYPE html><html>inicia sesión'));
    expect((await worker.fetch(req('/snapshot-test', 'POST'), env)).status).toBe(502);
    vi.stubGlobal('fetch', sheetFetch(500, ''));
    expect((await worker.fetch(req('/snapshot-test', 'POST'), env)).status).toBe(502);
  });
  it('guarda la foto el último día a las 21:00, una sola vez, y la sirve', async () => {
    await setSheet();
    const f = sheetFetch(); vi.stubGlobal('fetch', f);
    await sched('2026-10-31T20:00:00Z'); // 21:00 en Madrid
    await sched('2026-10-31T21:00:00Z'); // 22:00: ya hecha
    expect(f).toHaveBeenCalledTimes(1);
    const res = await (await worker.fetch(req('/snapshots'), env)).json() as { snapshots: { month: string; date: string; prices: Record<string, number> }[] };
    expect(res.snapshots).toHaveLength(1);
    expect(res.snapshots[0]).toMatchObject({ month: '2026-10', date: '2026-10-31', prices: { IE00BYX5MX67: 1683000, N5546: 14228191 } });
    expect(res.snapshots[0].prices.N5116).toBeUndefined(); // con fecha de noviembre
  });
  it('no hace nada fuera de la ventana ni sin hoja configurada', async () => {
    const f = sheetFetch(); vi.stubGlobal('fetch', f);
    await sched('2026-10-31T20:00:00Z'); // sin hoja
    await setSheet();
    await sched('2026-10-30T20:00:00Z'); // no es el último día
    await sched('2026-10-31T19:00:00Z'); // antes de las 21:00 locales
    expect(f).not.toHaveBeenCalled();
  });
  it('si la hoja falla a las 21:00, reintenta a las 22:00 y a las 23:00', async () => {
    await setSheet();
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (n++ < 2 ? new Response('', { status: 503 }) : new Response(CSV))));
    await sched('2026-10-31T20:00:00Z');
    await sched('2026-10-31T21:00:00Z');
    expect(env.KV.m.has('snap:2026-10')).toBe(false);
    await sched('2026-10-31T22:00:00Z');
    expect(env.KV.m.has('snap:2026-10')).toBe(true);
  });
  it('funciona aunque no haya avisos activados (sin suscripción)', async () => {
    await setSheet();
    expect(env.KV.m.has('sub')).toBe(false);
    vi.stubGlobal('fetch', sheetFetch());
    await sched('2026-10-31T20:00:00Z');
    expect(env.KV.m.has('snap:2026-10')).toBe(true);
  });
  it('la hoja y las fotos no se mezclan con los avisos de plan en la misma pasada', async () => {
    await setSheet();
    await worker.fetch(req('/subscribe', 'POST', { subscription: subscription(), reminders: [{ id: 'plan', text: 'Hoy toca tu plan.', hour: 22, day: 31 }], tz: 'Europe/Madrid' }), env);
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { calls.push(new URL(u).hostname); return String(u).includes('docs.google.com') ? new Response(CSV) : new Response(null, { status: 201 }); }));
    await sched('2026-10-31T21:00:00Z'); // 22:00 locales del 31
    expect(calls.sort()).toEqual(['docs.google.com', 'web.push.apple.com']);
    expect(env.KV.m.has('snap:2026-10')).toBe(true);
  });
});
