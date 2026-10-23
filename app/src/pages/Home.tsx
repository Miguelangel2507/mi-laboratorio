import { useLiveQuery } from 'dexie-react-hooks';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Flame, Settings as Cog } from 'lucide-react';
import { db, setSetting } from '../lib/db';
import { todayISO } from '../lib/domain';
import { budgetStatus } from '../lib/budget';
import { streak } from '../lib/stats';
import { useFx, useMoney, useNetWorth, useSetting } from '../lib/hooks';
import { Banner, Group, Skeleton, fmtDate } from '../components/ui';
import { EmptyState, LargeTitle } from '../components/Layout';

export default function Home() {
  const hide = useSetting<boolean>('hideBalances', false) ?? false;
  const lastBackup = useSetting<string | null>('lastBackup', null);
  const money = useMoney();
  const { main, data, result } = useNetWorth();
  const { conv } = useFx();
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const budgets = useLiveQuery(() => db.budgets.toArray(), []);
  const timer = useRef<number | undefined>(undefined);

  if (!data || !result || !cats || !budgets || lastBackup === undefined) return <Skeleton h="h-40" />;

  const today = todayISO();
  const catName = (id: number | null) => cats.find((c) => c.id === id)?.name ?? 'Sin categoría';
  const recent = [...data.txs].sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0)).slice(0, 8);
  const alerts = budgets
    .map((b) => ({ b, s: budgetStatus(b, data.txs, today, (t) => conv(t.amountCents, t.currency)) }))
    .filter((x) => x.s.level !== 'ok');
  const days = lastBackup ? (Date.now() - new Date(lastBackup).getTime()) / 864e5 : Infinity;
  const needsBackup = data.txs.length + data.accounts.length > 0 && days > 14;
  const n = streak(data.txs, today);

  return (
    <>
      <LargeTitle action={<Link to="/settings" aria-label="Ajustes" className="grid min-h-tap min-w-tap place-items-center"><Cog size={22} /></Link>}>Inicio</LargeTitle>

      {needsBackup && (
        <Banner tone="warn" action={<Link to="/settings/data" className="font-semibold text-accent">Exportar</Link>}>
          {lastBackup ? 'Hace más de 2 semanas de tu última copia.' : 'Aún no has hecho ninguna copia de seguridad.'}
        </Banner>
      )}
      {alerts.map(({ b, s }) => (
        <Banner key={b.id} tone={s.level === 'over' ? 'danger' : 'warn'} action={<Link to="/settings/budgets" className="font-semibold text-accent">Ver</Link>}>
          {catName(b.categoryId)}: {s.level === 'over' ? 'te has pasado del presupuesto' : `llevas el ${Math.round(s.pct * 100)} % del presupuesto`}.
        </Banner>
      ))}

      <section className="card p-5" aria-label="Patrimonio neto">
        <div className="flex items-center justify-between text-footnote text-text-muted">
          <Link to="/networth">Patrimonio neto</Link>
          <button aria-label={hide ? 'Mostrar saldos' : 'Ocultar saldos'} className="grid min-h-tap min-w-tap place-items-center"
            onClick={() => setSetting('hideBalances', !hide)}>{hide ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <p className="num select-none text-balance"
          onPointerDown={() => { timer.current = window.setTimeout(() => setSetting('hideBalances', !hide), 500); }}
          onPointerUp={() => window.clearTimeout(timer.current)} onPointerLeave={() => window.clearTimeout(timer.current)}>
          {money(result.cents, main)}
        </p>
        <div className="mt-1 flex items-center justify-between text-footnote text-text-muted">
          <span>Cuentas {money(result.accountsCents, main)} · Inversiones {money(result.assetsCents, main)}</span>
          {n > 1 && <span className="flex items-center gap-1" aria-label={`Racha de ${n} días`}><Flame size={14} />{n}</span>}
        </div>
        {result.excluded > 0 && (
          <p className="mt-2 text-footnote text-warning">
            {result.excluded} {result.excluded === 1 ? 'elemento' : 'elementos'} en otra divisa sin tipo de cambio todavía (necesita conexión una vez).
          </p>
        )}
      </section>

      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="text-footnote uppercase tracking-wide text-text-muted">Últimos movimientos</h2>
        <Link to="/movements" className="text-footnote font-semibold text-accent">Ver todos</Link>
      </div>
      {data.accounts.length === 0 ? (
        <EmptyState title="Empieza creando una cuenta" text="Añade tu cuenta del banco o tu efectivo con su saldo actual.">
          <Link to="/accounts" className="btn-primary inline-flex items-center">Crear cuenta</Link>
        </EmptyState>
      ) : recent.length === 0 ? (
        <EmptyState title="Aún no hay movimientos" text="Pulsa + para apuntar tu primer gasto o ingreso." />
      ) : (
        <TxList txs={recent} catName={catName} money={money} />
      )}
      <p className="mt-6 text-center text-caption text-text-muted">Hoy es {fmtDate(today)}</p>
    </>
  );
}

import type { Transaction } from '../lib/db';
export function TxList({ txs, catName, money }: { txs: Transaction[]; catName: (id: number | null) => string; money: (c: number, cur: string) => string }) {
  return (
    <Group>
      {txs.map((t) => (
        <Link key={t.id} to={`/tx/${t.id}`} className="flex min-h-tap items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate">{t.kind === 'transfer' ? 'Transferencia' : catName(t.categoryId)}</p>
            <p className="truncate text-footnote text-text-muted">{t.date}{t.note ? ` · ${t.note}` : ''}{t.source !== 'manual' ? ` · ${t.source === 'import' ? 'importado' : 'recurrente'}` : ''}</p>
          </div>
          <span className={`num shrink-0 ${t.kind === 'income' ? 'text-income' : 'text-expense'}`}>
            {t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : ''}{money(t.amountCents, t.currency)}
          </span>
        </Link>
      ))}
    </Group>
  );
}
