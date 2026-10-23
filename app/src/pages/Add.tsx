import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type Kind } from '../lib/db';
import { todayISO } from '../lib/domain';
import { toCents } from '../lib/money';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'expense', label: 'Gasto' }, { id: 'income', label: 'Ingreso' }, { id: 'transfer', label: 'Transferencia' },
];

export default function Add() {
  const nav = useNavigate();
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [toId, setToId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  if (!accounts || !cats) return null;
  const options = cats.filter((c) => c.kind === kind);
  const account = accounts.find((a) => a.id === (accountId === '' ? accounts[0]?.id : accountId));

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = toCents(amount);
    if (!account) return setError('Primero crea una cuenta.');
    if (cents === null || cents <= 0) return setError('Introduce un importe mayor que 0.');
    if (kind === 'transfer') {
      const dest = accounts!.find((a) => a.id === toId);
      if (!dest || dest.id === account.id) return setError('Elige una cuenta de destino distinta.');
      if (dest.currency !== account.currency) return setError('Las transferencias entre divisas llegarán más adelante.');
    }
    await db.transactions.add({
      date, accountId: account.id!, kind, amountCents: cents, currency: account.currency, note: note.trim(), source: 'manual',
      categoryId: kind === 'transfer' ? null : categoryId === '' ? (options.at(-1)?.id ?? null) : categoryId,
      ...(kind === 'transfer' ? { transferAccountId: Number(toId) } : {}),
    });
    nav('/');
  }

  return (
    <form onSubmit={save} noValidate className="mx-auto flex h-full max-w-[560px] flex-col gap-4 overflow-y-auto px-4 pb-8 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="flex items-center justify-between">
        <button type="button" className="min-h-tap font-semibold text-accent" onClick={() => nav(-1)}>Cancelar</button>
        <h1 className="text-headline">Nuevo movimiento</h1>
        <span className="w-16" />
      </header>

      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-3 gap-1 rounded-md bg-surface-2 p-1">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => { setKind(k.id); setCategoryId(''); }}
            className={`min-h-[36px] rounded-sm text-footnote font-semibold ${kind === k.id ? 'bg-surface shadow-card' : 'text-text-muted'}`}>
            {k.label}
          </button>
        ))}
      </div>

      <input aria-label="Importe" autoFocus className="num w-full bg-transparent text-center text-balance outline-none"
        inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />

      <div className="card divide-y divide-border">
        {kind !== 'transfer' && (
          <label className="flex min-h-tap items-center justify-between gap-3 px-4">
            <span>Categoría</span>
            <select className="max-w-[60%] bg-transparent text-right text-text-muted outline-none" value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">{options.at(-1)?.name}</option>
              {options.slice(0, -1).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-h-tap items-center justify-between gap-3 px-4">
          <span>{kind === 'transfer' ? 'Desde' : 'Cuenta'}</span>
          <select className="max-w-[60%] bg-transparent text-right text-text-muted outline-none" value={account?.id ?? ''}
            onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {kind === 'transfer' && (
          <label className="flex min-h-tap items-center justify-between gap-3 px-4">
            <span>Hacia</span>
            <select className="max-w-[60%] bg-transparent text-right text-text-muted outline-none" value={toId}
              onChange={(e) => setToId(Number(e.target.value))}>
              <option value="">Elige…</option>
              {accounts.filter((a) => a.id !== account?.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-h-tap items-center justify-between gap-3 px-4">
          <span>Fecha</span>
          <input type="date" className="bg-transparent text-text-muted outline-none" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex min-h-tap items-center gap-3 px-4">
          <span>Nota</span>
          <input className="min-w-0 flex-1 bg-transparent text-right outline-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </label>
      </div>

      {accounts.length === 0 && <p className="text-footnote text-text-muted">Aún no tienes cuentas. Créala en la pestaña Cuentas.</p>}
      {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
      <button className="btn-primary" type="submit">Guardar</button>
    </form>
  );
}
