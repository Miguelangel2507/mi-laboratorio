import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { db, type AssetType } from '../lib/db';
import { refreshQuotes } from '../lib/quotes';
import { signedValue, TYPE_LABEL } from '../lib/invest';
import { convertCents } from '../lib/fx';
import { color } from '../lib/palette';
import { useFx, useMoney, useNetWorth, useSetting } from '../lib/hooks';
import { Banner, Group, Row, Section, Skeleton, pct } from '../components/ui';
import { EmptyState, LargeTitle } from '../components/Layout';

const daysAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso + 'T12:00:00').getTime()) / 864e5));

export default function Investments() {
  const money = useMoney();
  const link = useSetting<string>('sheetUrl', '');
  const { rates } = useFx();
  const { main, result } = useNetWorth();
  const quotes = useLiveQuery(() => db.quotes.toArray(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setBusy(true); setError('');
    try { await refreshQuotes(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer la hoja.'); }
    setBusy(false);
  }

  if (!result || !quotes || link === undefined) return <Skeleton h="h-40" />;
  const views = result.views;
  const toMain = (c: number, cur: string) => convertCents(c, cur, main, rates);
  const invested = views.filter((v) => v.asset.type !== 'debt' && v.asset.type !== 'other');
  const totalValue = invested.reduce((s, v) => s + (toMain(v.valueCents, v.asset.currency) ?? 0), 0);
  const totalCost = invested.reduce((s, v) => s + (toMain(v.costCents, v.asset.currency) ?? 0), 0);
  const pnl = totalValue - totalCost;
  const byType = new Map<AssetType, number>();
  for (const v of views) if (v.asset.type !== 'debt') byType.set(v.asset.type, (byType.get(v.asset.type) ?? 0) + (toMain(v.valueCents, v.asset.currency) ?? 0));
  const slices = [...byType.entries()].filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]);
  const fresh = quotes.length ? quotes.reduce((m, q) => (q.fetchedAt > m ? q.fetchedAt : m), '') : '';

  return (
    <>
      <LargeTitle action={
        <div className="flex">
          <button aria-label="Actualizar precios" disabled={busy || !link} onClick={refresh} className="grid min-h-tap min-w-tap place-items-center text-accent disabled:opacity-40"><RefreshCw size={22} className={busy ? 'animate-spin' : ''} /></button>
          <Link to="/investments/new" aria-label="Añadir inversión" className="grid min-h-tap min-w-tap place-items-center text-accent"><Plus size={24} /></Link>
        </div>}>Cartera</LargeTitle>

      {error && <Banner tone="danger">{error}</Banner>}
      {!link && <Banner action={<Link to="/settings/prices" className="font-semibold text-accent">Conectar</Link>}>Conecta tu hoja para que los fondos tengan precio automático.</Banner>}

      {views.length === 0 ? (
        <EmptyState title="Aún no tienes inversiones" text="Añade tus fondos, acciones, cripto, bienes o deudas para ver tu patrimonio completo.">
          <Link to="/investments/new" className="btn-primary inline-flex items-center">Añadir inversión</Link>
        </EmptyState>
      ) : (
        <>
          <div className="card p-5">
            <p className="text-footnote text-text-muted">Valor invertido</p>
            <p className="num text-balance">{money(totalValue, main)}</p>
            <p className={`num text-footnote ${pnl >= 0 ? 'text-income' : 'text-danger'}`}>
              {pnl >= 0 ? '+' : '−'}{money(Math.abs(pnl), main)} ({pct(totalCost > 0 ? pnl / totalCost : null)})
            </p>
          </div>

          {slices.length > 0 && (
            <div className="card mb-6 mt-3 flex items-center gap-4 p-4">
              <div className="size-28 shrink-0" aria-hidden="true">
                <ResponsiveContainer><PieChart><Pie data={slices.map(([t, v]) => ({ name: TYPE_LABEL[t], value: v }))} dataKey="value" innerRadius="55%" outerRadius="95%" stroke="none" isAnimationActive={false}>
                  {slices.map((_, i) => <Cell key={i} fill={color(i)} />)}</Pie></PieChart></ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 text-footnote">
                {slices.map(([t, v], i) => {
                  const sum = slices.reduce((s, [, x]) => s + x, 0);
                  return <li key={t} className="flex items-center justify-between gap-2 py-0.5"><span className="flex items-center gap-2"><i className="size-2.5 rounded-pill" style={{ background: color(i) }} />{TYPE_LABEL[t]}</span><span className="num">{Math.round((v / sum) * 100)} %</span></li>;
                })}
              </ul>
            </div>
          )}

          <Section title="Posiciones">
            <Group>
              {[...views].sort((a, b) => b.valueCents - a.valueCents).map((v) => (
                <Row key={v.asset.id} to={`/investments/${v.asset.id}`} right={
                  <span className="text-right">
                    <span className="num block">{v.asset.type === 'debt' ? '−' : ''}{money(v.valueCents, v.asset.currency)}</span>
                    {v.asset.type !== 'other' && v.asset.type !== 'debt' && (
                      <span className={`block text-footnote ${v.noPrice ? 'text-warning' : v.pnlCents >= 0 ? 'text-income' : 'text-danger'}`}>
                        {v.noPrice ? 'sin precio' : pct(v.pnlPct)}
                      </span>
                    )}
                  </span>}>
                  <span className="block truncate">{v.asset.name}</span>
                  <span className="block truncate text-footnote text-text-muted">{TYPE_LABEL[v.asset.type]}{v.priceDate ? ` · precio de hace ${daysAgo(v.priceDate)} d` : ''}</span>
                </Row>
              ))}
            </Group>
          </Section>
          <p className="text-footnote text-text-muted">
            Patrimonio de inversiones y bienes: {money(views.reduce((s, v) => s + (toMain(signedValue(v), v.asset.currency) ?? 0), 0), main)}.{' '}
            <Link to="/networth" className="font-semibold text-accent">Ver evolución</Link>
          </p>
        </>
      )}

      {quotes.length > 0 && <p className="mt-4 text-caption text-text-muted">Hoja leída: {quotes.length} fondos{fresh ? ` · ${new Date(fresh).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</p>}
    </>
  );
}
