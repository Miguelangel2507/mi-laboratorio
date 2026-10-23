import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db';
import { accountBalance, todayISO } from '../lib/domain';
import { toCents } from '../lib/money';
import { useMoney, useSetting } from '../lib/hooks';
import { BackHeader, DangerButton, Field, Group, Row, Skeleton } from '../components/ui';
import { EmptyState, LargeTitle } from '../components/Layout';
import { TxList } from './Home';
import { CURRENCIES } from './Welcome';

function AccountForm({ id, onDone }: { id?: number; onDone: () => void }) {
  const main = useSetting<string>('currency', 'EUR') ?? 'EUR';
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState(main);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    void db.accounts.get(id).then((a) => { if (a) { setName(a.name); setBalance((a.initialCents / 100).toFixed(2).replace('.', ',')); setCurrency(a.currency); } });
  }, [id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const initialCents = balance.trim() === '' ? 0 : toCents(balance);
    if (!name.trim()) return setError('Ponle un nombre a la cuenta.');
    if (initialCents === null) return setError('El saldo no es un número válido.');
    if (id) await db.accounts.update(id, { name: name.trim(), initialCents, currency });
    else await db.accounts.add({ name: name.trim(), initialCents, currency, color: 'accent', archived: 0, createdAt: todayISO() });
    onDone();
  }
  return (
    <form onSubmit={save} className="card mb-4 flex flex-col gap-3 p-4" noValidate>
      <Field label="Nombre"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nómina, Efectivo, Tarjeta…" /></Field>
      <Field label={id ? 'Saldo inicial (el actual es este más tus movimientos)' : 'Saldo actual (puede ser negativo)'}>
        <input className="field num" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" />
      </Field>
      <Field label="Divisa">
        <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
      <button className="btn-primary" type="submit">Guardar cuenta</button>
    </form>
  );
}

export default function Accounts() {
  const money = useMoney();
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).toArray(), []);
  const txs = useLiveQuery(() => db.transactions.toArray(), []);
  const [manual, setOpen] = useState<boolean | null>(null);
  const open = manual ?? accounts?.length === 0;
  return (
    <>
      <LargeTitle action={<button className="min-h-tap px-2 font-semibold text-accent" onClick={() => setOpen(!open)}>{open ? 'Cancelar' : 'Nueva'}</button>}>Cuentas</LargeTitle>
      {open && <AccountForm onDone={() => setOpen(false)} />}
      {!accounts || !txs ? <Skeleton /> : accounts.length === 0 ? (
        <EmptyState title="Sin cuentas" text="Crea una para empezar a apuntar movimientos." />
      ) : (
        <Group>
          {accounts.map((a) => (
            <Row key={a.id} to={`/accounts/${a.id}`} right={<span className="num">{money(accountBalance(a, txs), a.currency)}</span>}>{a.name}</Row>
          ))}
        </Group>
      )}
    </>
  );
}

export function AccountDetail() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const money = useMoney();
  const account = useLiveQuery(() => db.accounts.get(id), [id]);
  const txs = useLiveQuery(() => db.transactions.where('accountId').equals(id).toArray(), [id]);
  const all = useLiveQuery(() => db.transactions.toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const [edit, setEdit] = useState(false);
  if (!account || !txs || !all || !cats) return <Skeleton />;
  const recent = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  return (
    <>
      <BackHeader title={account.name} to="/accounts" action={<button className="min-h-tap px-2 font-semibold text-accent" onClick={() => setEdit(!edit)}>{edit ? 'Cancelar' : 'Editar'}</button>} />
      {edit ? <AccountForm id={id} onDone={() => setEdit(false)} /> : (
        <p className="card num mb-4 p-5 text-title">{money(accountBalance(account, all), account.currency)}</p>
      )}
      {recent.length === 0 ? <EmptyState title="Sin movimientos" text="Los movimientos de esta cuenta aparecerán aquí." /> : (
        <TxList txs={recent} catName={(i) => cats.find((c) => c.id === i)?.name ?? 'Sin categoría'} money={money} />
      )}
      <div className="mt-6 flex flex-col gap-2">
        <button className="btn-secondary" onClick={async () => { await db.accounts.update(id, { archived: 1 }); nav('/accounts'); }}>Archivar cuenta</button>
        <DangerButton label="Eliminar cuenta y sus movimientos" onConfirm={async () => {
          await db.transaction('rw', db.accounts, db.transactions, db.recurring, async () => {
            await db.transactions.where('accountId').equals(id).delete();
            await db.transactions.filter((t) => t.transferAccountId === id).delete();
            await db.recurring.filter((r) => r.accountId === id || r.transferAccountId === id).delete();
            await db.accounts.delete(id);
          });
          nav('/accounts');
        }} />
      </div>
      <p className="mt-3 text-footnote text-text-muted">Archivar la oculta pero conserva su historial.</p>
    </>
  );
}
