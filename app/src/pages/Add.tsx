import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db, type Frequency, type Kind } from '../lib/db';
import { todayISO } from '../lib/domain';
import { convertCents } from '../lib/fx';
import { useFx } from '../lib/hooks';
import { toCents } from '../lib/money';
import { runRecurring } from '../lib/recurring';
import { DangerButton, Seg } from '../components/ui';

const KINDS: { id: Exclude<Kind, 'invest'>; label: string }[] = [
  { id: 'expense', label: 'Gasto' }, { id: 'income', label: 'Ingreso' }, { id: 'transfer', label: 'Transferencia' },
];
export const FREQ: { id: Frequency | 'none'; label: string }[] = [
  { id: 'none', label: 'No se repite' }, { id: 'daily', label: 'Cada día' }, { id: 'weekly', label: 'Cada semana' },
  { id: 'biweekly', label: 'Cada 2 semanas' }, { id: 'monthly', label: 'Cada mes' }, { id: 'yearly', label: 'Cada año' },
];

/** Un único formulario para tres cosas: movimiento nuevo, editar un movimiento y crear/editar una regla recurrente. */
export default function Add() {
  const nav = useNavigate();
  const params = useParams();
  const [sp] = useSearchParams();
  const editId = Number(params.id) || null;
  const editRuleId = Number(params.ruleId) || null;
  const isRule = !!editRuleId || sp.get('rule') === '1';
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const [kind, setKind] = useState<Exclude<Kind, 'invest'>>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [toId, setToId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [freq, setFreq] = useState<Frequency | 'none'>(isRule ? 'monthly' : 'none');
  const [received, setReceived] = useState('');
  const [receivedTouched, setReceivedTouched] = useState(false);
  const { rates } = useFx();
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!editId && !editRuleId);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (editId) {
      void db.transactions.get(editId).then((t) => {
        if (!t || t.kind === 'invest') return setMissing(true);
        setKind(t.kind); setAmount((t.amountCents / 100).toFixed(2).replace('.', ',')); setAccountId(t.accountId);
        setToId(t.transferAccountId ?? ''); setCategoryId(t.categoryId ?? ''); setDate(t.date); setNote(t.note);
        if (t.toAmountCents !== undefined) { setReceived((t.toAmountCents / 100).toFixed(2).replace('.', ',')); setReceivedTouched(true); }
        setLoaded(true);
      });
    } else if (editRuleId) {
      void db.recurring.get(editRuleId).then((r) => {
        if (!r || r.kind === 'invest') return setMissing(true);
        setKind(r.kind); setAmount((r.amountCents / 100).toFixed(2).replace('.', ',')); setAccountId(r.accountId);
        setToId(r.transferAccountId ?? ''); setCategoryId(r.categoryId ?? ''); setDate(r.nextRun); setNote(r.note); setFreq(r.frequency);
        setLoaded(true);
      });
    }
  }, [editId, editRuleId]);

  if (missing) return <p className="p-6">Esto ya no existe. <button className="font-semibold text-accent" onClick={() => nav('/')}>Volver</button></p>;
  if (!accounts || !cats || !loaded) return null;
  const options = cats.filter((c) => c.kind === kind);
  const account = accounts.find((a) => a.id === (accountId === '' ? accounts[0]?.id : accountId));
  const dest = kind === 'transfer' ? accounts.find((x) => x.id === toId) : undefined;
  const cross = !!account && !!dest && dest.currency !== account.currency;
  const suggested = (() => {
    const c = toCents(amount);
    if (!cross || !account || !dest || c === null || c <= 0) return '';
    const v = convertCents(c, account.currency, dest.currency, rates);
    return v === null ? '' : (v / 100).toFixed(2).replace('.', ',');
  })();
  const receivedShown = receivedTouched ? received : suggested;
  const today = todayISO();
  const makesRule = isRule || (!editId && freq !== 'none');
  const future = date > today;

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = toCents(amount);
    if (!account) return setError('Primero crea una cuenta.');
    if (cents === null || cents <= 0) return setError('Introduce un importe mayor que 0.');
    if (!date) return setError('Elige una fecha.');
    if (kind === 'transfer') {
      if (!dest || dest.id === account.id) return setError('Elige una cuenta de destino distinta.');
    }
    let toAmountCents: number | undefined;
    if (cross && dest) {
      if (makesRule) return setError('Las transferencias entre divisas no se pueden repetir.');
      const r = toCents(receivedShown);
      if (r === null || r <= 0) return setError(`Indica el importe que recibe la cuenta destino en ${dest.currency}.`);
      toAmountCents = r;
    }
    const categoryFinal = kind === 'transfer' ? null : categoryId === '' ? (options.at(-1)?.id ?? null) : categoryId;

    if (makesRule) {
      if (freq === 'none') return setError('Elige cada cuánto se repite.');
      const rule = {
        kind, accountId: account.id!, transferAccountId: kind === 'transfer' ? Number(toId) : undefined, categoryId: categoryFinal,
        amountCents: cents, currency: account.currency, note: note.trim(), frequency: freq,
        anchorDay: Number(date.slice(8)), nextRun: date, active: 1 as const,
      };
      if (editRuleId) await db.recurring.put({ ...rule, id: editRuleId });
      else await db.recurring.add(rule);
      await runRecurring(db, today); // si la fecha ya llegó, registra ya las que toquen
      return nav(-1);
    }

    const base = {
      date, accountId: account.id!, kind, amountCents: cents, currency: account.currency, note: note.trim(), categoryId: categoryFinal,
      ...(kind === 'transfer' ? { transferAccountId: Number(toId) } : {}),
      ...(toAmountCents !== undefined ? { toAmountCents } : {}),
    };
    if (editId) {
      const old = await db.transactions.get(editId);
      await db.transactions.put({ ...base, id: editId, source: old?.source ?? 'manual', importBatchId: old?.importBatchId, recurringId: old?.recurringId });
    } else {
      await db.transactions.add({ ...base, source: 'manual' });
    }
    nav(-1);
  }

  const title = editRuleId ? 'Editar recurrente' : isRule ? 'Nuevo recurrente' : editId ? 'Editar movimiento' : 'Nuevo movimiento';

  return (
    <form onSubmit={save} noValidate className="mx-auto flex h-full max-w-[560px] flex-col gap-4 overflow-y-auto px-4 pb-8 pt-[max(env(safe-area-inset-top),16px)]">
      <header className="flex items-center justify-between">
        <button type="button" className="min-h-tap font-semibold text-accent" onClick={() => nav(-1)}>Cancelar</button>
        <h1 className="text-headline">{title}</h1>
        <span className="w-16" />
      </header>

      <Seg label="Tipo" value={kind} options={KINDS} onChange={(k) => { setKind(k); setCategoryId(''); }} />
      <input aria-label="Importe" autoFocus={!editId && !editRuleId} className="num w-full bg-transparent text-center text-balance outline-none"
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
        {cross && dest && (
          <label className="flex min-h-tap items-center justify-between gap-3 px-4">
            <span>Recibe ({dest.currency})</span>
            <input aria-label={`Importe recibido en ${dest.currency}`} inputMode="decimal" className="num w-32 bg-transparent text-right outline-none"
              value={receivedShown} placeholder="0,00" onChange={(e) => { setReceived(e.target.value); setReceivedTouched(true); }} />
          </label>
        )}
        <label className="flex min-h-tap items-center justify-between gap-3 px-4">
          <span>{makesRule ? 'Primera fecha' : 'Fecha'}</span>
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
              {FREQ.filter((f) => !isRule || f.id !== 'none').map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {makesRule ? (
        <p className="text-footnote text-text-muted">
          {future ? `No se registrará nada hasta el ${date.split('-').reverse().join('/')}. ` : ''}
          Después se apuntará solo en cada fecha, sin que tengas que confirmar.
        </p>
      ) : future && (
        <p className="text-footnote text-text-muted">Fecha futura: figurará como programado y no contará en tus saldos hasta ese día.</p>
      )}
      {accounts.length === 0 && <p className="text-footnote text-text-muted">Aún no tienes cuentas. Créala en la pestaña Cuentas.</p>}
      {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
      <button className="btn-primary" type="submit">{makesRule ? 'Guardar recurrente' : 'Guardar'}</button>
      {editId && <DangerButton label="Eliminar movimiento" onConfirm={async () => { await db.transactions.delete(editId); nav(-1); }} />}
      {editRuleId && <DangerButton label="Eliminar recurrente" onConfirm={async () => { await db.recurring.delete(editRuleId); nav(-1); }} />}
      {editRuleId && <p className="text-footnote text-text-muted">Eliminar la regla no borra lo que ya se registró.</p>}
    </form>
  );
}
