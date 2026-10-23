import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { db } from '../lib/db';
import { todayISO } from '../lib/domain';
import { addDays, addMonths, periodRange, type PeriodKind } from '../lib/dates';
import { health, pctChange, summarize } from '../lib/stats';
import { color } from '../lib/palette';
import { useFx, useMoney } from '../lib/hooks';
import { Seg, Skeleton, fmtDate, pct } from '../components/ui';
import { EmptyState, LargeTitle } from '../components/Layout';

const KINDS: { id: PeriodKind; label: string }[] = [
  { id: 'day', label: 'Día' }, { id: 'week', label: 'Semana' }, { id: 'month', label: 'Mes' }, { id: 'year', label: 'Año' },
];
const step = (k: PeriodKind, anchor: string, dir: 1 | -1) =>
  k === 'day' ? addDays(anchor, dir) : k === 'week' ? addDays(anchor, 7 * dir) : addMonths(anchor, (k === 'month' ? 1 : 12) * dir);

export default function Stats() {
  const money = useMoney();
  const { main, conv } = useFx();
  const today = todayISO();
  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(today);
  const txs = useLiveQuery(() => db.transactions.toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);

  const r = useMemo(() => periodRange(kind, anchor), [kind, anchor]);
  const calc = useMemo(() => {
    if (!txs) return null;
    const toMain = (t: { amountCents: number; currency: string }) => conv(t.amountCents, t.currency);
    const cur = summarize(txs, r.from, r.to, toMain);
    const prev = summarize(txs, r.prevFrom, r.prevTo, toMain);
    return { cur, prev, h: health(cur, r, today) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, r, main]);
  if (!calc || !cats) return <Skeleton h="h-40" />;
  const { cur, prev, h } = calc;

  const label = kind === 'day' ? fmtDate(r.from) : kind === 'year' ? r.from.slice(0, 4)
    : kind === 'month' ? new Date(`${r.from}T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
  const rows = [...cur.byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const name = (id: number | null) => cats.find((c) => c.id === id)?.name ?? 'Sin categoría';
  const delta = (c: number, p: number, goodWhenUp: boolean) => {
    const x = pctChange(c, p);
    return x === null ? <span className="text-text-muted">sin periodo anterior</span>
      : <span className={(x >= 0) === goodWhenUp ? 'text-income' : 'text-text-muted'}>{pct(x, 0)} vs. periodo anterior</span>;
  };

  return (
    <>
      <LargeTitle>Estadísticas</LargeTitle>
      <Seg label="Periodo" value={kind} onChange={(k) => { setKind(k); setAnchor(today); }} options={KINDS} />
      <div className="my-3 flex items-center justify-between">
        <button aria-label="Periodo anterior" className="grid min-h-tap min-w-tap place-items-center text-accent" onClick={() => setAnchor(step(kind, anchor, -1))}><ChevronLeft /></button>
        <span className="text-headline first-letter:uppercase">{label}</span>
        <button aria-label="Periodo siguiente" disabled={r.to >= today} className="grid min-h-tap min-w-tap place-items-center text-accent disabled:opacity-30" onClick={() => setAnchor(step(kind, anchor, 1))}><ChevronRight /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4"><p className="text-footnote text-text-muted">Ingresos</p><p className="num text-title text-income">{money(cur.income, main)}</p><p className="text-caption">{delta(cur.income, prev.income, true)}</p></div>
        <div className="card p-4"><p className="text-footnote text-text-muted">Gastos</p><p className="num text-title">{money(cur.expense, main)}</p><p className="text-caption">{delta(cur.expense, prev.expense, false)}</p></div>
      </div>
      <div className="card mt-3 p-4">
        <p className="text-footnote text-text-muted">Balance</p>
        <p className={`num text-title ${cur.balance >= 0 ? 'text-income' : 'text-danger'}`}>{money(cur.balance, main)}</p>
      </div>

      {cur.count === 0 ? (
        <div className="mt-4"><EmptyState title="Sin movimientos en este periodo" text="Cuando apuntes gastos o ingresos, verás aquí el resumen." /></div>
      ) : (
        <>
          <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Salud del periodo</h2>
          <dl className="card grid grid-cols-2 gap-y-3 p-4 text-footnote">
            <div><dt className="text-text-muted">Tasa de ahorro</dt><dd className="num text-headline">{h.savingsRate === null ? '—' : pct(h.savingsRate, 0).replace('+', '')}</dd></div>
            <div><dt className="text-text-muted">Gasto medio</dt><dd className="num text-headline">{h.avgTicket === null ? '—' : money(h.avgTicket, main)}</dd></div>
            <div><dt className="text-text-muted">Media diaria</dt><dd className="num text-headline">{money(h.dailyAvg, main)}</dd></div>
            <div><dt className="text-text-muted">Proyección del periodo</dt><dd className="num text-headline">{h.projection === null ? '—' : money(h.projection, main)}</dd></div>
          </dl>

          {rows.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Gasto por categoría</h2>
              <div className="card p-4">
                <div className="h-44" aria-hidden="true">
                  <ResponsiveContainer>
                    <PieChart><Pie data={rows.map(([id, v]) => ({ name: name(id), value: v }))} dataKey="value" innerRadius="55%" outerRadius="95%" stroke="none" isAnimationActive={false}>
                      {rows.map((_, i) => <Cell key={i} fill={color(i)} />)}
                    </Pie></PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {rows.map(([id, v], i) => (
                    <li key={String(id)} className="flex items-center justify-between gap-3 py-2">
                      <span className="flex min-w-0 items-center gap-2"><i className="size-3 shrink-0 rounded-pill" style={{ background: color(i) }} /><span className="truncate">{name(id)}</span></span>
                      <span className="num shrink-0">{money(v, main)} <span className="text-text-muted">· {Math.round((v / cur.expense) * 100)} %</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
