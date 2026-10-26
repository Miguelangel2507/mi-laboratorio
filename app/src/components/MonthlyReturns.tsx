import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { firstTradeYear, yearResults, yearReturn, type MonthResult, type PerfInput } from '../lib/performance';

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const fmt = (r: number, digits = 1) => `${r >= 0 ? '+' : '−'}${Math.abs(r * 100).toFixed(digits).replace('.', ',')}`;
const KIND_TEXT = { real: 'cierre real', imported: 'cierre importado', estimated: 'estimado' } as const;

/** Tinte según el signo y la fuerza del rendimiento: a partir de un 3 % ya es el máximo. */
function tint(r: number | null): string | undefined {
  if (r === null) return undefined;
  const strength = Math.min(Math.abs(r) / 0.03, 1);
  const pct = Math.round(12 + strength * 43);
  return `color-mix(in srgb, var(${r >= 0 ? '--c-income' : '--c-danger'}) ${pct}%, var(--c-surface))`;
}

function Cell({ r, index, year }: { r: MonthResult; index: number; year: number }) {
  const has = r.ret !== null;
  const label = has
    ? `${NAMES[index]} de ${year}: ${fmt(r.ret!)} %, ${KIND_TEXT[r.kind]}${r.partial ? ', mes en curso' : ''}`
    : `${NAMES[index]} de ${year}: sin datos`;
  return (
    <li aria-label={label} className={`relative flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md border ${r.partial ? 'border-accent' : 'border-border'} ${has ? '' : 'opacity-50'}`}
      style={{ background: tint(r.ret) ?? 'var(--c-surface-2)' }}>
      <span className="text-caption text-text-muted">{MONTHS[index]}</span>
      <span className="num text-headline">{has ? fmt(r.ret!) : '·'}</span>
      {has && r.kind === 'real' && <i aria-hidden="true" className="absolute right-1.5 top-1.5 size-1.5 rounded-pill bg-accent" />}
      {has && r.kind === 'imported' && <i aria-hidden="true" className="absolute right-1.5 top-1.5 size-1.5 rounded-pill border border-accent" />}
    </li>
  );
}

export function MonthlyReturns({ input }: { input: PerfInput }) {
  const thisYear = Number(input.today.slice(0, 4));
  const first = firstTradeYear(input.trades);
  const [year, setYear] = useState(thisYear);

  if (first === null) {
    return (
      <div className="card mb-6 p-4">
        <h2 className="text-headline">Rendimiento mensual</h2>
        <p className="mt-1 text-footnote text-text-muted">Cuando registres tus compras aparecerá aquí lo que ha rendido cada mes.</p>
      </div>
    );
  }
  const results = yearResults(input, year);
  const total = yearReturn(results);

  return (
    <section className="mb-6" aria-label="Rendimiento mensual">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-footnote font-semibold uppercase tracking-wide text-text-muted">Rendimiento mensual</h2>
        <div className="flex items-center gap-1">
          <button aria-label="Año anterior" disabled={year <= first} onClick={() => setYear(year - 1)} className="grid min-h-tap min-w-tap place-items-center text-accent disabled:opacity-30"><ChevronLeft size={18} /></button>
          <span className="num min-w-10 text-center text-footnote text-text-muted">{year}</span>
          <button aria-label="Año siguiente" disabled={year >= thisYear} onClick={() => setYear(year + 1)} className="grid min-h-tap min-w-tap place-items-center text-accent disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
      </div>
      <ul className="grid grid-cols-4 gap-2">
        {results.map((r, i) => <Cell key={r.month} r={r} index={i} year={year} />)}
      </ul>
      <div className="card mt-3 flex min-h-tap items-center justify-between px-4 py-3">
        <span>Rentabilidad {year}</span>
        <span className={`num text-title ${total === null ? 'text-text-muted' : total >= 0 ? 'text-income' : 'text-danger'}`}>{total === null ? '—' : `${fmt(total, 2)} %`}</span>
      </div>
      <p className="mt-2 text-footnote text-text-muted">
        Rentabilidad mensual ponderada por aportaciones (Modified Dietz). <i aria-hidden="true" className="inline-block size-1.5 rounded-pill bg-accent align-middle" /> cierre real, guardado el último día del mes.{' '}
        <i aria-hidden="true" className="inline-block size-1.5 rounded-pill border border-accent align-middle" /> cierre importado de tu app anterior. Sin marca: estimado con el precio de tus compras.
      </p>
    </section>
  );
}
