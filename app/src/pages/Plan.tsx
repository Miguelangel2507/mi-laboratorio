import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db, setSetting, type Account, type Asset, type PlanConfig, type PlanItem, type PlanRun, type Quote } from '../lib/db';
import { todayISO } from '../lib/domain';
import { parseDecimal, toCents } from '../lib/money';
import { confirmRun, DEFAULT_PLAN, dueDateFor, generatePlanRuns, nextStartMonth, reopenRun, skipRun, undoRun } from '../lib/plan';
import { useMoney, useSetting } from '../lib/hooks';
import { syncRemindersIfEnabled } from '../lib/alerts';
import { Banner, BackHeader, Field, Group, Row, Section, Skeleton, fmtDate } from '../components/ui';

const fmtPrice = (e5: number) => (e5 / 1e5).toString().replace('.', ',');
const monthName = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

/** Precio sugerido: el de la hoja; si la hoja no lo da, el último manual que usaste. */
function suggestedPrice(key: string, quotes: Quote[], assets: Asset[]): number | null {
  return quotes.find((q) => q.key === key)?.priceE5 ?? assets.find((a) => a.key === key)?.manualPriceE5 ?? null;
}

function PendingCard({ run, item, price, accounts, defaultAccount }: {
  run: PlanRun; item: PlanItem; price: number | null; accounts: Account[]; defaultAccount: number | null;
}) {
  const money = useMoney();
  const today = todayISO();
  const eur = accounts.filter((a) => a.currency === 'EUR');
  const [amount, setAmount] = useState((run.amountCents / 100).toFixed(2).replace('.', ','));
  const [date, setDate] = useState(run.dueDate > today ? today : run.dueDate);
  const [px, setPx] = useState(price ? fmtPrice(price) : '');
  const [accountId, setAccountId] = useState<number | ''>(defaultAccount && eur.some((a) => a.id === defaultAccount) ? defaultAccount : (eur[0]?.id ?? ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cents = toCents(amount), p = parseDecimal(px);
  const qty = cents && p && p > 0 ? Math.round(((cents * 1000) / Math.round(p * 1e5)) * 1e6) / 1e6 : null;

  async function confirm() {
    setError('');
    if (cents === null || cents <= 0) return setError('Introduce un importe mayor que 0.');
    if (p === null || p <= 0) return setError('Escribe el precio por participación.');
    if (accountId === '') return setError('Elige la cuenta de la que sale el dinero.');
    setBusy(true);
    try { await confirmRun(db, run.id!, { amountCents: cents, date, priceE5: Math.round(p * 1e5), accountId }, todayISO()); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo confirmar.'); }
    setBusy(false);
  }

  return (
    <div className="card flex flex-col gap-3 p-4" role="group" aria-label={`${item.name}, ${monthName(run.month)}`}>
      <div>
        <p className="text-headline">{item.name}</p>
        <p className="text-footnote text-text-muted first-letter:uppercase">{monthName(run.month)} · tocaba el {fmtDate(run.dueDate)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe (€)"><input className="field num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={`Importe de ${item.name}`} /></Field>
        <Field label="Fecha de la operación"><input type="date" className="field" max={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label={`Fecha de ${item.name}`} /></Field>
      </div>
      <Field label="Precio por participación" hint={price === null ? 'Tu hoja no trae precio de este fondo: escríbelo tú.' : 'Tomado de tu hoja. Puedes corregirlo.'}>
        <input className="field num" inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} aria-label={`Precio de ${item.name}`} placeholder="0,00" />
      </Field>
      <Field label="Sale de la cuenta">
        <select className="field" value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} aria-label={`Cuenta para ${item.name}`}>
          {eur.length === 0 && <option value="">No hay cuentas en EUR</option>}
          {eur.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <p className="num text-footnote text-text-muted">{qty !== null ? `≈ ${qty.toLocaleString('es-ES', { maximumFractionDigits: 6 })} participaciones` : 'Participaciones: —'}{cents ? ` · ${money(cents, 'EUR')}` : ''}</p>
      {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy} onClick={confirm}>Confirmar</button>
        <button className="btn-secondary" disabled={busy} onClick={() => skipRun(db, run.id!)}>Saltar este mes</button>
      </div>
    </div>
  );
}

export default function PlanPage() {
  const money = useMoney();
  const cfg = useSetting<PlanConfig>('plan', DEFAULT_PLAN);
  const items = useLiveQuery(() => db.planItems.toArray(), []);
  const runs = useLiveQuery(() => db.planRuns.toArray(), []);
  const quotes = useLiveQuery(() => db.quotes.toArray(), []);
  const assets = useLiveQuery(() => db.assets.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.filter((a) => !a.archived).toArray(), []);
  const [pick, setPick] = useState('');
  const [amount, setAmount] = useState('');
  const [start, setStart] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const today = todayISO();

  if (!cfg || !items || !runs || !quotes || !assets || !accounts) return <Skeleton h="h-40" />;
  const itemById = new Map(items.map((i) => [i.id!, i]));
  const pending = runs.filter((r) => r.status === 'pending' && itemById.has(r.itemId)).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.itemId - b.itemId);
  const done = runs.filter((r) => r.status === 'confirmed').sort((a, b) => (b.confirmedAt ?? '').localeCompare(a.confirmedAt ?? '')).slice(0, 6);
  const skipped = runs.filter((r) => r.status === 'skipped');
  const eur = accounts.filter((a) => a.currency === 'EUR');
  const available = quotes.filter((q) => !items.some((i) => i.assetKey === q.key));
  const defaultStart = nextStartMonth(today, cfg.day);
  const monthly = items.filter((i) => i.active).reduce((s, i) => s + i.amountCents, 0);

  async function saveCfg(next: PlanConfig) {
    await setSetting('plan', next);
    await generatePlanRuns(db, todayISO());
    void syncRemindersIfEnabled();
  }
  async function addItem() {
    setError('');
    const q = quotes!.find((x) => x.key === pick);
    const cents = toCents(amount);
    if (!q) return setError('Elige un fondo de tu hoja.');
    if (cents === null || cents <= 0) return setError('Indica la cantidad mensual.');
    const startMonth = start || defaultStart;
    if (!/^\d{4}-\d{2}$/.test(startMonth)) return setError('Elige el mes de la primera aportación.');
    await db.planItems.add({ assetKey: q.key, name: q.name, amountCents: cents, startMonth, active: 1 });
    await generatePlanRuns(db, todayISO());
    setPick(''); setAmount(''); setStart('');
  }
  async function confirmAll() {
    setMsg('');
    let ok = 0, left = 0;
    for (const r of pending) {
      const item = itemById.get(r.itemId)!;
      const price = suggestedPrice(item.assetKey, quotes!, assets!);
      const acc = cfg!.accountId && eur.some((a) => a.id === cfg!.accountId) ? cfg!.accountId : null;
      if (!price || !acc) { left++; continue; }
      try { await confirmRun(db, r.id!, { amountCents: r.amountCents, date: r.dueDate > todayISO() ? todayISO() : r.dueDate, priceE5: price, accountId: acc }, todayISO()); ok++; } catch { left++; }
    }
    setMsg(`${ok} confirmadas.${left ? ` ${left} necesitan que las revises (falta precio o cuenta).` : ''}`);
  }
  const canAll = pending.length > 1;

  return (
    <>
      <BackHeader title="Plan mensual" to="/investments" />
      {msg && <Banner>{msg}</Banner>}

      <Section title={`Por confirmar (${pending.length})`} hint={pending.length > 0 ? 'Hasta que no confirmes una aportación, ese dinero no cuenta en tu patrimonio.' : undefined}>
        {pending.length === 0 ? (
          <div className="card p-4 text-footnote text-text-muted">
            {items.length === 0 ? 'Crea tu plan abajo y cada mes aparecerán aquí las aportaciones.' : 'No hay nada pendiente. La próxima aportación aparecerá en su día.'}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {canAll && <button className="btn-secondary" onClick={confirmAll}>Confirmar todas con los datos por defecto</button>}
            {pending.map((r) => {
              const item = itemById.get(r.itemId)!;
              return <PendingCard key={r.id} run={r} item={item} price={suggestedPrice(item.assetKey, quotes, assets)} accounts={accounts} defaultAccount={cfg.accountId} />;
            })}
          </div>
        )}
      </Section>

      <Section title="Mi plan" hint={items.length ? `Cada mes: ${money(monthly, 'EUR')} entre ${items.filter((i) => i.active).length} fondos.` : undefined}>
        <Group>
          <label className="flex min-h-tap items-center justify-between px-4">
            <span>Plan activo</span>
            <input type="checkbox" role="switch" className="size-6" checked={cfg.active} onChange={(e) => saveCfg({ ...cfg, active: e.target.checked })} />
          </label>
          <label className="flex min-h-tap items-center justify-between gap-3 px-4">
            <span>Día del mes</span>
            <select className="bg-transparent text-right text-text-muted outline-none" value={cfg.day} onChange={(e) => saveCfg({ ...cfg, day: Number(e.target.value) })} aria-label="Día del mes">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex min-h-tap items-center justify-between gap-3 px-4">
            <span>Cuenta de origen</span>
            <select className="max-w-[55%] bg-transparent text-right text-text-muted outline-none" value={cfg.accountId ?? ''} aria-label="Cuenta de origen"
              onChange={(e) => saveCfg({ ...cfg, accountId: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">Elegir al confirmar</option>
              {eur.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </Group>
        <p className="mt-2 text-footnote text-text-muted">Puedes cambiar la cuenta, la fecha, el importe y el precio en cada aportación al confirmarla.</p>

        {items.length > 0 && (
          <div className="mt-4">
            <Group>
              {items.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </Group>
          </div>
        )}

        <h3 className="mb-2 mt-4 text-footnote uppercase tracking-wide text-text-muted">Añadir fondo al plan</h3>
        <div className="card flex flex-col gap-3 p-4">
          {quotes.length === 0 ? (
            <p className="text-footnote text-text-muted">Primero conecta tu hoja en <Link to="/settings/prices" className="font-semibold text-accent">Ajustes</Link> para elegir fondos.</p>
          ) : (
            <>
              <Field label="Fondo de tu hoja">
                <select className="field" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Fondo de tu hoja">
                  <option value="">Elige…</option>
                  {available.map((q) => <option key={q.key} value={q.key}>{q.name}</option>)}
                </select>
              </Field>
              <Field label="Cantidad mensual (€)"><input className="field num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Cantidad mensual" placeholder="0,00" /></Field>
              <Field label="Primera aportación" hint={`Por defecto ${dueDateFor(defaultStart, cfg.day).split('-').reverse().join('/')}. No se crean aportaciones de meses anteriores.`}>
                <input type="month" className="field" value={start || defaultStart} min={today.slice(0, 7)} onChange={(e) => setStart(e.target.value)} aria-label="Mes de la primera aportación" />
              </Field>
              {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
              <button className="btn-primary" onClick={addItem}>Añadir al plan</button>
            </>
          )}
        </div>
      </Section>

      {done.length > 0 && (
        <Section title="Confirmadas recientes">
          <Group>
            {done.map((r) => (
              <Row key={r.id} right={<button className="min-h-tap text-danger" onClick={() => undoRun(db, r.id!)} aria-label={`Deshacer ${itemById.get(r.itemId)?.name ?? ''}`}>Deshacer</button>}>
                <span className="block truncate">{itemById.get(r.itemId)?.name ?? 'Fondo eliminado'}</span>
                <span className="num block text-footnote text-text-muted">{money(r.amountCents, 'EUR')} · {r.month}</span>
              </Row>
            ))}
          </Group>
        </Section>
      )}

      {skipped.length > 0 && (
        <Section title="Saltadas">
          <Group>
            {skipped.map((r) => (
              <Row key={r.id} right={<button className="min-h-tap text-accent" onClick={() => reopenRun(db, r.id!)}>Reabrir</button>}>
                <span className="block truncate">{itemById.get(r.itemId)?.name ?? 'Fondo eliminado'}</span>
                <span className="block text-footnote text-text-muted">{r.month}</span>
              </Row>
            ))}
          </Group>
        </Section>
      )}
    </>
  );
}

function ItemRow({ item }: { item: PlanItem }) {
  const [v, setV] = useState((item.amountCents / 100).toFixed(2).replace('.', ','));
  const [edit, setEdit] = useState(false);
  const money = useMoney();
  return (
    <div className="flex min-h-tap items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <p className="truncate">{item.name}</p>
        <p className="text-footnote text-text-muted">desde {item.startMonth}{item.active ? '' : ' · pausado'}</p>
      </div>
      {edit ? (
        <form className="flex items-center gap-2" noValidate onSubmit={async (e) => {
          e.preventDefault(); const c = toCents(v);
          if (c === null || c <= 0) return;
          await db.planItems.update(item.id!, { amountCents: c }); setEdit(false);
        }}>
          <input aria-label={`Cantidad de ${item.name}`} className="field num w-24" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} />
          <button className="min-h-tap font-semibold text-accent" type="submit">OK</button>
        </form>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button className="num min-h-tap" onClick={() => setEdit(true)} aria-label={`Cambiar cantidad de ${item.name}`}>{money(item.amountCents, 'EUR')}</button>
          <button className="min-h-tap text-footnote text-text-muted" onClick={() => db.planItems.update(item.id!, { active: item.active ? 0 : 1 })}>{item.active ? 'Pausar' : 'Activar'}</button>
          <DangerInline id={item.id!} />
        </div>
      )}
    </div>
  );
}

function DangerInline({ id }: { id: number }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className="min-h-tap text-footnote text-danger" onClick={async () => {
      if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
      await db.transaction('rw', db.planItems, db.planRuns, async () => {
        await db.planRuns.where('status').equals('pending').filter((r) => r.itemId === id).delete();
        await db.planItems.delete(id);
      });
    }}>{armed ? '¿Seguro?' : 'Quitar'}</button>
  );
}

