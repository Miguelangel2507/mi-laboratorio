import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push';
import { dueReminders, isValidTimeZone, sanitizeReminders, type Reminder } from './schedule';
import { buildSnapshot, parseSheetCsv, sheetCsvUrl, snapshotWindow, type Snapshot } from './sheet';

export interface Env {
  KV: KVNamespace;
  OWNER_TOKEN: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  ALLOWED_ORIGIN: string;
}

interface Stored { subscription: PushSubscription; reminders: Reminder[]; tz: string; updatedAt: string }

/** Solo se envía a los servicios de push de los navegadores conocidos. */
const PUSH_HOSTS = [/(^|\.)push\.apple\.com$/, /(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export const isAllowedEndpoint = (e: string) => {
  try { const u = new URL(e); return u.protocol === 'https:' && PUSH_HOSTS.some((r) => r.test(u.hostname)); } catch { return false; }
};

const origins = (env: Env) => env.ALLOWED_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const o = req.headers.get('origin');
  const ok = o && origins(env).includes(o);
  return { 'access-control-allow-origin': ok ? o : 'null', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', vary: 'origin' };
}

async function authorized(req: Request, env: Env): Promise<boolean> {
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!env.OWNER_TOKEN || !given) return false;
  // Comparación en tiempo constante (compara hashes del mismo tamaño).
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([h(given), h(env.OWNER_TOKEN)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface Message { title: string; body: string; url?: string; tag?: string }

export async function sendPush(env: Env, sub: PushSubscription, m: Message): Promise<Response> {
  const payload = await buildPushPayload(
    { data: JSON.stringify(m), options: { ttl: 3600, urgency: 'normal', topic: m.tag?.slice(0, 32) } },
    sub, { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
  );
  return fetch(sub.endpoint, payload);
}

const json = (body: unknown, status: number, h: Record<string, string>) => new Response(JSON.stringify(body), { status, headers: { ...h, 'content-type': 'application/json' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = corsHeaders(req, env);
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (req.method === 'GET' && pathname === '/vapid-public-key') return new Response(env.VAPID_PUBLIC_KEY ?? '', { headers: { ...h, 'content-type': 'text/plain' } });
    if (!(await authorized(req, env))) return json({ error: 'unauthorized' }, 401, h);

    if (pathname === '/subscribe' && req.method === 'POST') {
      let body: { subscription?: PushSubscription; reminders?: unknown; tz?: unknown };
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
      const s = body.subscription;
      if (!s || typeof s.endpoint !== 'string' || !s.keys?.p256dh || !s.keys?.auth) return json({ error: 'bad subscription' }, 400, h);
      if (!isAllowedEndpoint(s.endpoint)) return json({ error: 'endpoint not allowed' }, 400, h);
      const reminders = sanitizeReminders(body.reminders);
      if (!reminders) return json({ error: 'bad reminders' }, 400, h);
      if (!isValidTimeZone(body.tz)) return json({ error: 'bad timezone' }, 400, h);
      const stored: Stored = { subscription: { endpoint: s.endpoint, expirationTime: s.expirationTime ?? null, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, reminders, tz: body.tz, updatedAt: new Date().toISOString() };
      await env.KV.put('sub', JSON.stringify(stored));
      return json({ ok: true, reminders: reminders.length }, 200, h);
    }
    if (pathname === '/subscribe' && req.method === 'DELETE') { await env.KV.delete('sub'); return json({ ok: true }, 200, h); }
    if (pathname === '/test' && req.method === 'POST') {
      const stored = await env.KV.get<Stored>('sub', 'json');
      if (!stored) return json({ error: 'no subscription' }, 404, h);
      const res = await sendPush(env, stored.subscription, { title: 'Mi Patrimonio', body: 'Aviso de prueba: todo funciona.', url: '#/settings/alerts', tag: 'test' });
      if (res.status === 404 || res.status === 410) await env.KV.delete('sub');
      return json({ ok: res.ok, pushStatus: res.status }, res.ok ? 200 : 502, h);
    }
    if (pathname === '/sheet' && req.method === 'POST') {
      let body: { url?: unknown; tz?: unknown };
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, h); }
      const csv = sheetCsvUrl(body.url);
      if (!csv) return json({ error: 'bad sheet url' }, 400, h);
      if (body.tz !== undefined && !isValidTimeZone(body.tz)) return json({ error: 'bad timezone' }, 400, h);
      const prev = await env.KV.get<StoredSheet>('sheet', 'json');
      await env.KV.put('sheet', JSON.stringify({ csv, tz: (body.tz as string | undefined) ?? prev?.tz ?? 'Europe/Madrid' } satisfies StoredSheet));
      return json({ ok: true }, 200, h);
    }
    if (pathname === '/snapshots' && req.method === 'GET') {
      const list = await env.KV.list({ prefix: 'snap:' });
      const snapshots: Snapshot[] = [];
      for (const k of list.keys) { const s = await env.KV.get<Snapshot>(k.name, 'json'); if (s) snapshots.push(s); }
      snapshots.sort((a, b) => a.month.localeCompare(b.month));
      return json({ snapshots }, 200, h);
    }
    if (pathname === '/snapshot-test' && req.method === 'POST') {
      const sheet = await env.KV.get<StoredSheet>('sheet', 'json');
      if (!sheet) return json({ error: 'no sheet' }, 404, h);
      const prices = await readSheet(sheet.csv);
      if (!prices) return json({ error: 'sheet not readable' }, 502, h);
      return json({ ok: true, funds: prices.length, newestDate: prices.map((p) => p.date).sort().at(-1) ?? null }, 200, h);
    }
    return json({ error: 'not found' }, 404, h);
  },

  async scheduled(ctrl: ScheduledController, env: Env): Promise<void> {
    const now = new Date(ctrl.scheduledTime);
    const stored = await env.KV.get<Stored>('sub', 'json');
    if (stored) await sendDueReminders(env, stored, now);
    await takeMonthSnapshot(env, stored?.tz, now);
  },
} satisfies ExportedHandler<Env>;

async function sendDueReminders(env: Env, stored: Stored, now: Date): Promise<void> {
  const { due, local } = dueReminders(now, stored.tz, stored.reminders);
  for (const r of due) {
    const key = `sent:${r.id}:${local.date}:${local.hour}`;
    if (await env.KV.get(key)) continue; // ya enviado esta hora
    const res = await sendPush(env, stored.subscription, { title: 'Mi Patrimonio', body: r.text, url: r.url ?? '#/', tag: r.id });
    if (res.status === 404 || res.status === 410) { await env.KV.delete('sub'); return; } // el móvil ya no acepta avisos
    if (res.ok) await env.KV.put(key, '1', { expirationTtl: 3 * 86400 });
  }
}

interface StoredSheet { csv: string; tz: string }

async function readSheet(csvUrl: string): Promise<ReturnType<typeof parseSheetCsv> | null> {
  try {
    const res = await fetch(csvUrl, { redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.trimStart().startsWith('<')) return null; // página de inicio de sesión: la hoja no es pública
    return parseSheetCsv(text);
  } catch { return null; }
}

/** El último día de cada mes, por la noche, guarda los precios de tu hoja: el «cierre real» del mes. */
export async function takeMonthSnapshot(env: Env, subTz: string | undefined, now: Date): Promise<void> {
  const sheet = await env.KV.get<StoredSheet>('sheet', 'json');
  if (!sheet) return;
  const win = snapshotWindow(now, sheet.tz || subTz || 'Europe/Madrid');
  if (!win || (await env.KV.get(`snap:${win.month}`))) return;
  const prices = await readSheet(sheet.csv);
  const snap = prices ? buildSnapshot(prices, win, now) : null;
  if (snap) await env.KV.put(`snap:${win.month}`, JSON.stringify(snap)); // si falla, se reintenta a la hora siguiente
}
