import { db, getSetting } from './db';
import { fetchQuotes, sheetCsvUrl } from './sheet';

export async function refreshQuotes(): Promise<number> {
  const url = sheetCsvUrl(await getSetting<string>('sheetUrl', ''));
  if (!url) throw new Error('Añade el enlace de tu hoja en Ajustes.');
  const parsed = await fetchQuotes(url);
  const fetchedAt = new Date().toISOString();
  await db.transaction('rw', db.quotes, async () => {
    await db.quotes.clear();
    await db.quotes.bulkPut(parsed.map((q) => ({ ...q, fetchedAt })));
  });
  return parsed.length;
}

/** Al abrir la app: como mucho una vez por hora, y sin romper nada si no hay conexión. */
export async function refreshQuotesIfStale(): Promise<void> {
  const last = (await db.quotes.toArray()).reduce((m, q) => (q.fetchedAt > m ? q.fetchedAt : m), '');
  if (last && Date.now() - new Date(last).getTime() < 36e5) return;
  try { await refreshQuotes(); } catch { /* se queda con la caché */ }
}
