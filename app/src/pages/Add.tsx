import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, type Frequency, type Kind } from '../lib/db';
import { todayISO } from '../lib/domain';
import { toCents } from '../lib/money';
import { DangerButton, Seg } from '../components/ui';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'expense', label: 'Gasto' }, { id: 'income', label: 'Ingreso' }, { id: 'transfer', label: 'Transferencia' },
];
export const FREQ: { id: Frequency | 'none'; label: string }[] = [
  { id: 'none', label: 'No se repite' }, { id: 'daily', label: 'Cada día' }, { id: 'weekly', label: 'Cada semana' },
  { id: 'biweekly', label: 'Cada 2 semanas' }, { id: 'monthly', label: 'Cada mes' }, { id: 'yearly', label: 'Cada año' },
];

export default function Add() {
  const nav = useNavigate();
  const editId = Number(useParams().id) || null;
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [toId, setToId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [freq, setFreq] = useState<Frequency | 'none'>('none');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!editId);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!editId) return;
    void db.transactions.get(editId).then((t) => {
      if (!t) return setMissing(true);
      setKind(t.kind); setAmount((t.amountCents / 100).toFixed(2).replace('.', ',')); setAccountId(t.accountId);
      setToId(t.transferAccountId ?? ''); setCategoryId(t.categoryId ?? ''); setDate(t.date); setNote(t.note); setLoaded(true);
    });
  }, [editId]);

  if (missing) return <p className="p-6">Este movimiento ya no existe. <button className="font-semibold text-accent" onClick={() => nav('/')}>Volver</button></p>;
  if (!accounts || !cats || !loaded) return null;
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
      if (dest.currency !== account.currency) return setError('Las transferencias entre divisas distintas no están disponibles todavía.');
    }
    const base = {
      date, accountId: account.id!, kind, amountCents: cents, currency: account.currency, note: note.trim(),
      categoryId: kind === 'transfer' ? null : categoryId === '' ? (options.at(-1)?.id ?? null) : categoryId,
      ...(kind === 'transfer' ? { transferAccountId: Number(toId) } : {}),
    };
    if (editId) {
      const old = await db.transactions.get(editId);
      await db.transactions.put({ ...base, id: editId, source: old?.source ?? 'manual', importBatchId: old?.importBatchId, recurringId: old?.recurringId });
    } else {
      await db.transactions.add({ ...base, source: 'manual' });
      if (freq !== 'none') {
        const { nextDate } = await import('../lib/recurring');
        await db.recurring.add({
          kind, accountId: account.id!, transferAccountId: kind === 'transfer' ? Number(toId) : undefined, categoryId: base.categoryId,
          amountCents: cents, currency: account.currency, note: base.note, frequency: freq, anchorDay: Number(date.slice(8)),
          nextRun: nextDate(date, freq, Number(date.slice(8))), active: 1,
        });
      }
    }
    nav(-1);
  }

  return (
    <form onSubmit={save} noValidate className="mx-auto flex h-full max-w-[560px] flex-col gap-4 overflow-y-auto px-4 pb-8 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="flex items-center justify-between">
        <button type="button" className="min-h-tap font-semibold text-accent" onClick={() => nav(-1)}>Cancelar</button>
        <h1 className="text-headline">{editId ? 'Editar movimiento' : 'Nuevo movimiento'}</h1>
        <span className="w-16" />
      </header>

      <Seg label="Tipo" value={kind} options={KINDS} onChange={(k) => { setKind(k); setCategoryId(''); }} />
      <input aria-label="Importe" autoFocus={!editId} className="num w-full bg-transparent text-center text-balance outline-none"
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
          <select className="max-w-[60%] bg-transparent text-right text-text-muted outline-none" value={account?.id ?? ''} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {kind === 'transfer' && (
          <label className="flex min-h-tap items-center justify-between gap-3 px-4">
            <span>Hacia</span>
            <select className="max-w-[60%] bg-transparent text-right text-text-muted outline-none" value={toId} onChange={(e) => setToId(Number(e.target.value))}>
              <option value="">Elige…</option>
              {accounts.filter((a) => a.id !== account?.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-h-tap items-center justify-between gap-3 px-4">
          <span>Fecha</span>
          <input type="date" className="bg-transparent text-text-muted outline-none" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex min-h-tap items-center gap-3 px-4">
          <span>Nota</span>
          <input className="min-w-0 flex-1 bg-transparent text-right outline-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </label>
        {!editId && (
          <label className="flex min-h-tap items-center justify-between gap-3 px-4">
            <span>Repetir</span>
            <select className="bg-transparent text-right text-text-muted outline-none" value={freq} onChange={(e) => setFreq(e.target.value as Frequency | 'none')}>
              {FREQ.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {accounts.length === 0 && <p className="text-footnote text-text-muted">Aún no tienes cuentas. Créala en la pestaña Cuentas.</p>}
      {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
      <button className="btn-primary" type="submit">Guardar</button>
      {editId && <DangerButton label="Eliminar movimiento" onConfirm={async () => { await db.transactions.delete(editId); nav(-1); }} />}
    </form>
  );
}
