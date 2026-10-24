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
