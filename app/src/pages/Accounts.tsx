import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { db } from '../lib/db';
import { accountBalance, todayISO } from '../lib/domain';
import { toCents } from '../lib/money';
import { useMoney, useSetting } from '../lib/hooks';
import { EmptyState, LargeTitle } from '../components/Layout';
import { CURRENCIES } from './Welcome';

export default function Accounts() {
  const main = useSetting<string>('currency', 'EUR') ?? 'EUR';
  const money = useMoney();
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const txs = useLiveQuery(() => db.transactions.toArray(), []);
  const [manual, setOpen] = useState<boolean | null>(null);
  const open = manual ?? accounts?.length === 0;
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState(main);
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    const initialCents = balance.trim() === '' ? 0 : toCents(balance);
    if (!name.trim()) return setError('Ponle un nombre a la cuenta.');
    if (initialCents === null) return setError('El saldo no es un número válido.');
    await db.accounts.add({ name: name.trim(), initialCents, currency, color: 'accent', archived: 0, createdAt: todayISO() });
    setName(''); setBalance(''); setError(''); setOpen(false);
  }

  return (
    <>
      <LargeTitle action={<button className="min-h-tap px-2 font-semibold text-accent" onClick={() => setOpen(!open)}>{open ? 'Cancelar' : 'Nueva'}</button>}>
        Cuentas
      </LargeTitle>

      {open && (
        <form onSubmit={save} className="card mb-4 flex flex-col gap-3 p-4" noValidate>
          <label className="flex flex-col gap-1">
            <span className="text-footnote text-text-muted">Nombre</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nómina, Efectivo, Tarjeta…" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-footnote text-text-muted">Saldo actual (puede ser negativo)</span>
            <input className="field num" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-footnote text-text-muted">Divisa</span>
            <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
          <button className="btn-primary" type="submit">Guardar cuenta</button>
        </form>
      )}

      {!accounts || !txs ? (
        <div className="card h-24 animate-pulse" aria-busy="true" />
      ) : accounts.length === 0 ? (
        <EmptyState title="Sin cuentas" text="Crea una para empezar a apuntar movimientos." />
      ) : (
        <ul className="card divide-y divide-border overflow-hidden">
          {accounts.map((a) => (
            <li key={a.id} className="flex min-h-tap items-center justify-between gap-3 px-4 py-3">
              <span className="truncate">{a.name}</span>
              <span className="num shrink-0">{money(accountBalance(a, txs), a.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
