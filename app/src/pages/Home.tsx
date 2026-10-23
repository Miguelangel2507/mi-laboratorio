import { useLiveQuery } from 'dexie-react-hooks';
import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Settings as Cog } from 'lucide-react';
import { db, setSetting } from '../lib/db';
import { netWorth } from '../lib/domain';
import { useMoney, useSetting } from '../lib/hooks';
import { EmptyState, LargeTitle } from '../components/Layout';

export default function Home() {
  const currency = useSetting<string>('currency', 'EUR') ?? 'EUR';
  const hide = useSetting<boolean>('hideBalances', false) ?? false;
  const money = useMoney();
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const txs = useLiveQuery(() => db.transactions.toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const timer = useRef<number | undefined>(undefined);

  if (!accounts || !txs || !cats) return <div className="card h-40 animate-pulse" aria-busy="true" />;

  const nw = netWorth(accounts, txs, currency);
  const catName = (id: number | null) => cats.find((c) => c.id === id)?.name ?? 'Sin categoría';
  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0)).slice(0, 20);

  return (
    <>
      <LargeTitle action={<Link to="/settings" aria-label="Ajustes" className="grid min-h-tap min-w-tap place-items-center"><Cog size={22} /></Link>}>
        Inicio
      </LargeTitle>

      <section className="card p-5" aria-label="Patrimonio neto">
        <div className="flex items-center justify-between text-footnote text-text-muted">
          <span>Patrimonio neto</span>
          <button aria-label={hide ? 'Mostrar saldos' : 'Ocultar saldos'} className="grid min-h-tap min-w-tap place-items-center"
            onClick={() => setSetting('hideBalances', !hide)}>
            {hide ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <p className="num select-none text-balance"
          onPointerDown={() => { timer.current = window.setTimeout(() => setSetting('hideBalances', !hide), 500); }}
          onPointerUp={() => window.clearTimeout(timer.current)} onPointerLeave={() => window.clearTimeout(timer.current)}>
          {money(nw.cents, currency)}
        </p>
        {nw.excluded > 0 && (
          <p className="mt-1 text-footnote text-text-muted">
            {nw.excluded} {nw.excluded === 1 ? 'cuenta en otra divisa no está incluida' : 'cuentas en otra divisa no están incluidas'} todavía.
          </p>
        )}
      </section>

      <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Últimos movimientos</h2>
      {accounts.length === 0 ? (
        <EmptyState title="Empieza creando una cuenta" text="Añade tu cuenta del banco o tu efectivo con su saldo actual.">
          <Link to="/accounts" className="btn-primary inline-flex items-center">Crear cuenta</Link>
        </EmptyState>
      ) : recent.length === 0 ? (
        <EmptyState title="Aún no hay movimientos" text="Pulsa + para apuntar tu primer gasto o ingreso." />
      ) : (
        <ul className="card divide-y divide-border overflow-hidden">
          {recent.map((t) => (
            <li key={t.id} className="flex min-h-tap items-center justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate">{t.kind === 'transfer' ? 'Transferencia' : catName(t.categoryId)}</p>
                <p className="truncate text-footnote text-text-muted">{t.date}{t.note ? ` · ${t.note}` : ''}</p>
              </div>
              <span className={`num shrink-0 ${t.kind === 'income' ? 'text-income' : 'text-expense'}`}>
                {t.kind === 'income' ? '+' : t.kind === 'expense' ? '−' : ''}{money(t.amountCents, t.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
