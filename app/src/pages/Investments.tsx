import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { db, getSetting } from '../lib/db';
import { fetchQuotes, sheetCsvUrl } from '../lib/sheet';
import { useSetting } from '../lib/hooks';
import { EmptyState, LargeTitle } from '../components/Layout';

const daysAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5));

export async function refreshQuotes(): Promise<number> {
  const link = await getSetting<string>('sheetUrl', '');
  const url = sheetCsvUrl(link);
  if (!url) throw new Error('Añade el enlace de tu hoja en Ajustes.');
  const parsed = await fetchQuotes(url);
  const fetchedAt = new Date().toISOString();
  await db.transaction('rw', db.quotes, async () => {
    await db.quotes.clear();
    await db.quotes.bulkPut(parsed.map((q) => ({ ...q, fetchedAt })));
  });
  return parsed.length;
}

export default function Investments() {
  const link = useSetting<string>('sheetUrl', '');
  const quotes = useLiveQuery(() => db.quotes.toArray(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setBusy(true); setError('');
    try { await refreshQuotes(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer la hoja.'); }
    setBusy(false);
  }

  return (
    <>
      <LargeTitle action={
        <button aria-label="Actualizar precios" disabled={busy || !link} onClick={refresh} className="grid min-h-tap min-w-tap place-items-center text-accent disabled:opacity-40">
          <RefreshCw size={22} className={busy ? 'animate-spin' : ''} />
        </button>}>
        Cartera
      </LargeTitle>

      {error && <p role="alert" className="mb-3 text-footnote text-danger">{error}</p>}

      {!link ? (
        <EmptyState title="Conecta tu hoja de precios" text="La app lee de tu Google Sheet el valor liquidativo de tus fondos.">
          <Link to="/settings" className="btn-primary inline-flex items-center">Ir a Ajustes</Link>
        </EmptyState>
      ) : !quotes ? (
        <div className="card h-24 animate-pulse" aria-busy="true" />
      ) : quotes.length === 0 ? (
        <EmptyState title="Sin precios todavía" text="Pulsa actualizar para leer tu hoja." />
      ) : (
        <>
          <h2 className="mb-2 text-footnote uppercase tracking-wide text-text-muted">Fondos de tu hoja</h2>
          <ul className="card divide-y divide-border overflow-hidden">
            {quotes.map((q) => {
              const age = q.priceDate ? daysAgo(q.priceDate) : null;
              return (
                <li key={q.key} className="flex min-h-tap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate">{q.name}</p>
                    <p className="truncate text-footnote text-text-muted">{q.key}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num">{q.priceE5 === null ? 'Precio manual' : (q.priceE5 / 1e5).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}</p>
                    <p className={`text-footnote ${age !== null && age > 3 ? 'text-warning' : 'text-text-muted'}`}>
                      {age === null ? 'sin fecha' : age === 0 ? 'hoy' : `hace ${age} d`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
