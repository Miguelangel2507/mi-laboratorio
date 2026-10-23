import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, setSetting, type Frequency, type Kind } from '../lib/db';
import { sheetCsvUrl } from '../lib/sheet';
import { refreshQuotes } from '../lib/quotes';
import { budgetStatus, goalSaved } from '../lib/budget';
import { todayISO } from '../lib/domain';
import { toCents } from '../lib/money';
import { exportBackup, restoreBackup, summarizeBackup, validateBackup, wipeAll, type Backup } from '../lib/backup';
import { aiInstructions, commitImport, CSV_TEMPLATE, MAX_IMPORT_ROWS, parseImport, transactionsToCsv, undoImport, type ImportRow } from '../lib/csvio';
import { checkPin, clearPin, setPin } from '../lib/lock';
import { download, fmtBytes, requestPersistence, shareOrDownload, storageStatus, type StorageStatus } from '../lib/storage';
import { useFx, useMoney, useSetting } from '../lib/hooks';
import { BackHeader, DangerButton, Field, Group, Row, Section, Skeleton, Banner, fmtDate } from '../components/ui';
import { EmptyState } from '../components/Layout';
import { CURRENCIES } from './Welcome';
import { FREQ } from './Add';

/* ---------- Categorías ---------- */
export function Categories() {
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  if (!cats) return <Skeleton />;
  const list = cats.filter((c) => c.kind === kind);
  async function add(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Escribe un nombre.');
    if (list.some((c) => c.name.toLowerCase() === n.toLowerCase())) return setError('Ya existe esa categoría.');
    await db.categories.add({ kind, name: n, isDefault: false });
    setName(''); setError('');
  }
  async function remove(id: number) {
    const fallback = list.at(-1)?.id;
    await db.transaction('rw', db.categories, db.transactions, db.budgets, async () => {
      await db.transactions.where('categoryId').equals(id).modify({ categoryId: fallback === id ? null : (fallback ?? null) });
      await db.budgets.where('categoryId').equals(id).delete();
      await db.categories.delete(id);
    });
  }
  return (
    <>
      <BackHeader title="Categorías" to="/settings" />
      <div role="radiogroup" aria-label="Tipo" className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-surface-2 p-1">
        {(['expense', 'income'] as const).map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-[36px] rounded-sm text-footnote font-semibold ${kind === k ? 'bg-surface shadow-card' : 'text-text-muted'}`}>{k === 'expense' ? 'Gastos' : 'Ingresos'}</button>
        ))}
      </div>
      <form onSubmit={add} noValidate className="card mb-4 flex gap-2 p-3">
        <input aria-label="Nueva categoría" className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" />
        <button className="btn-primary" type="submit">Añadir</button>
      </form>
      {error && <p role="alert" className="mb-3 text-footnote text-danger">{error}</p>}
      <Group>
        {list.map((c) => (
          <Row key={c.id} right={c.isDefault ? <span className="text-footnote text-text-muted">por defecto</span> : <button className="min-h-tap text-danger" onClick={() => remove(c.id!)}>Borrar</button>}>{c.name}</Row>
        ))}
      </Group>
      <p className="mt-3 text-footnote text-text-muted">La última de la lista es la que se usa si no eliges ninguna. Si borras una, sus movimientos pasan a esa.</p>
    </>
  );
}

/* ---------- Presupuestos ---------- */
export function Budgets() {
  const money = useMoney();
  const { main, conv } = useFx();
  const budgets = useLiveQuery(() => db.budgets.toArray(), []);
  const cats = useLiveQuery(() => db.categories.where('kind').equals('expense').toArray(), []);
  const txs = useLiveQuery(() => db.transactions.toArray(), []);
  const [catId, setCatId] = useState<number | ''>('');
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [limit, setLimit] = useState('');
  const [rollover, setRollover] = useState(false);
  const [error, setError] = useState('');
  if (!budgets || !cats || !txs) return <Skeleton />;
  async function add(e: FormEvent) {
    e.preventDefault();
    const c = toCents(limit);
    if (catId === '') return setError('Elige una categoría.');
    if (c === null || c <= 0) return setError('Indica un límite mayor que 0.');
    if (budgets!.some((b) => b.categoryId === catId && b.period === period)) return setError('Ya tienes un presupuesto así.');
    await db.budgets.add({ categoryId: catId, period, limitCents: c, rollover });
    setLimit(''); setCatId(''); setError('');
  }
  const today = todayISO();
  return (
    <>
      <BackHeader title="Presupuestos" to="/settings" />
      {budgets.length === 0 ? <EmptyState title="Sin presupuestos" text="Pon un límite por categoría y te avisaremos al llegar al 80 % y al 100 %." /> : (
        <div className="flex flex-col gap-3">
          {budgets.map((b) => {
            const s = budgetStatus(b, txs, today, (t) => conv(t.amountCents, t.currency));
            const tone = s.level === 'over' ? 'bg-danger' : s.level === 'warn' ? 'bg-warning' : 'bg-accent';
            return (
              <div key={b.id} className="card p-4">
                <div className="flex items-center justify-between"><span className="text-headline">{cats.find((c) => c.id === b.categoryId)?.name}</span>
                  <button className="min-h-tap text-danger" aria-label="Borrar presupuesto" onClick={() => db.budgets.delete(b.id!)}>Borrar</button></div>
                <div role="progressbar" aria-valuenow={Math.round(s.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${Math.round(s.pct * 100)} % del presupuesto`} className="my-2 h-2 overflow-hidden rounded-pill bg-surface-2">
                  <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, s.pct * 100)}%` }} />
                </div>
                <p className="num text-footnote text-text-muted">{money(s.spentCents, main)} de {money(s.limitCents, main)} · {b.period === 'week' ? 'semanal' : b.period === 'month' ? 'mensual' : 'anual'}{b.rollover ? ' · acumula lo que sobra' : ''}</p>
              </div>
            );
          })}
        </div>
      )}
      <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Nuevo presupuesto</h2>
      <form onSubmit={add} noValidate className="card flex flex-col gap-3 p-4">
        <Field label="Categoría"><select className="field" value={catId} onChange={(e) => setCatId(e.target.value === '' ? '' : Number(e.target.value))}><option value="">Elige…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Periodo"><select className="field" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}><option value="week">Semanal</option><option value="month">Mensual</option><option value="year">Anual</option></select></Field>
        <Field label={`Límite (${main})`}><input className="field num" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
        <label className="flex min-h-tap items-center justify-between"><span>Acumular lo que sobra</span><input type="checkbox" role="switch" className="size-6" checked={rollover} onChange={(e) => setRollover(e.target.checked)} /></label>
        {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
        <button className="btn-primary" type="submit">Crear presupuesto</button>
      </form>
    </>
  );
}

/* ---------- Metas ---------- */
export function Goals() {
  const money = useMoney();
  const { main } = useFx();
  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [add, setAdd] = useState<Record<number, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  if (!goals) return <Skeleton />;
  async function create(e: FormEvent) {
    e.preventDefault();
    const c = toCents(target);
    if (!name.trim()) return setError('Ponle un nombre a la meta.');
    if (c === null || c <= 0) return setError('Indica un objetivo mayor que 0.');
    await db.goals.add({ name: name.trim(), targetCents: c, currency: main, contributions: [] });
    setName(''); setTarget(''); setError('');
  }
  return (
    <>
      <BackHeader title="Metas de ahorro" to="/settings" />
      {note && <Banner>{note}</Banner>}
      {goals.length === 0 ? <EmptyState title="Sin metas" text="Crea una hucha con un objetivo y ve sumando aportaciones." /> : (
        <div className="flex flex-col gap-3">
          {goals.map((g) => {
            const saved = goalSaved(g), p = Math.min(1, saved / g.targetCents);
            return (
              <div key={g.id} className="card p-4">
                <div className="flex items-center justify-between"><span className="text-headline">{g.name}</span>
                  <button className="min-h-tap text-danger" aria-label={`Borrar ${g.name}`} onClick={() => db.goals.delete(g.id!)}>Borrar</button></div>
                <div role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${Math.round(p * 100)} % de la meta`} className="my-2 h-2 overflow-hidden rounded-pill bg-surface-2"><div className="h-full bg-accent" style={{ width: `${p * 100}%` }} /></div>
                <p className="num text-footnote text-text-muted">{money(saved, g.currency)} de {money(g.targetCents, g.currency)} · {Math.round(p * 100)} %{p >= 1 ? ' · ¡conseguida!' : ''}</p>
                <form className="mt-3 flex gap-2" noValidate onSubmit={async (e) => {
                  e.preventDefault(); const c = toCents(add[g.id!] ?? '');
                  if (c === null || c === 0) return;
                  await db.goals.update(g.id!, { contributions: [...g.contributions, { date: todayISO(), cents: c }] });
                  const before = goalSaved(g) / g.targetCents, after = (goalSaved(g) + c) / g.targetCents;
                  const hit = [1, 0.75, 0.5].find((t) => before < t && after >= t);
                  setNote(hit ? `¡${g.name}: has llegado al ${Math.round(hit * 100)} %!` : '');
                  setAdd({ ...add, [g.id!]: '' });
                }}>
                  <input aria-label={`Aportación a ${g.name}`} className="field num flex-1" inputMode="decimal" placeholder="Aportar (negativo para retirar)" value={add[g.id!] ?? ''} onChange={(e) => setAdd({ ...add, [g.id!]: e.target.value })} />
                  <button className="btn-secondary" type="submit">Aportar</button>
                </form>
              </div>
            );
          })}
        </div>
      )}
      <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Nueva meta</h2>
      <form onSubmit={create} noValidate className="card flex flex-col gap-3 p-4">
        <Field label="Nombre"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Viaje, fondo de emergencia…" /></Field>
        <Field label={`Objetivo (${main})`}><input className="field num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
        <button className="btn-primary" type="submit">Crear meta</button>
      </form>
    </>
  );
}

/* ---------- Recurrentes ---------- */
export function RecurringList() {
  const money = useMoney();
  const list = useLiveQuery(() => db.recurring.toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  if (!list || !cats || !accounts) return <Skeleton />;
  const label = (f: Frequency) => FREQ.find((x) => x.id === f)?.label ?? f;
  const kindLabel: Record<Kind, string> = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia' };
  return (
    <>
      <BackHeader title="Movimientos recurrentes" to="/settings" />
      {list.length === 0 ? <EmptyState title="Sin recurrentes" text="Al apuntar un movimiento, elige «Repetir» y se registrará solo." /> : (
        <Group>
          {list.map((r) => (
            <Row key={r.id} right={<span className="flex flex-col items-end"><span className="num">{money(r.amountCents, r.currency)}</span>
              <button className="min-h-tap text-footnote text-danger" onClick={() => db.recurring.delete(r.id!)}>Borrar</button></span>}>
              <span className="block truncate">{r.note || cats.find((c) => c.id === r.categoryId)?.name || kindLabel[r.kind]}</span>
              <span className="block text-footnote text-text-muted">{label(r.frequency)} · próxima {fmtDate(r.nextRun)} · {accounts.find((a) => a.id === r.accountId)?.name}</span>
            </Row>
          ))}
        </Group>
      )}
      <p className="mt-3 text-footnote text-text-muted">Los movimientos vencidos se registran al abrir la app. Borrar una regla no borra lo ya registrado.</p>
    </>
  );
}

/* ---------- Precios ---------- */
export function Prices() {
  const saved = useSetting<string>('sheetUrl', '');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (saved !== undefined) setLink(saved); }, [saved]);
  async function save() {
    if (link.trim() && !sheetCsvUrl(link)) return setMsg('Ese enlace no parece de Google Sheets.');
    await setSetting('sheetUrl', link.trim());
    if (!link.trim()) return setMsg('Enlace quitado.');
    setBusy(true);
    try { setMsg(`Enlace guardado. Se han leído ${await refreshQuotes()} fondos.`); } catch (e) { setMsg(`Enlace guardado, pero no se pudo leer: ${e instanceof Error ? e.message : 'error'}`); }
    setBusy(false);
  }
  return (
    <>
      <BackHeader title="Precios de fondos" to="/settings" />
      <div className="card flex flex-col gap-3 p-4">
        <Field label="Enlace de tu Google Sheet" hint="Columnas: clave (ISIN o código), nombre, valor liquidativo y fecha (AAAA-MM-DD).">
          <input className="field" inputMode="url" autoCapitalize="off" value={link} onChange={(e) => { setLink(e.target.value); setMsg(''); }} placeholder="https://docs.google.com/spreadsheets/d/…" />
        </Field>
        {msg && <p role="status" className="text-footnote text-text-muted">{msg}</p>}
        <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Leyendo…' : 'Guardar y leer'}</button>
      </div>
      <p className="mt-3 text-footnote text-text-muted">El enlace se guarda solo en este móvil. La hoja debe poder verse con el enlace y no debe contener tus cantidades ni saldos.</p>
    </>
  );
}

/* ---------- Datos: copia, CSV ---------- */
export function DataPage() {
  const nav = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const csvFile = useRef<HTMLInputElement>(null);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const batches = useLiveQuery(() => db.importBatches.toArray(), []);
  const last = useSetting<string | null>('lastBackup', null);
  const [includeUrl, setIncludeUrl] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pending, setPending] = useState<Backup | null>(null);
  const [msg, setMsg] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [defAcc, setDefAcc] = useState<number | ''>('');
  const [csvText, setCsvText] = useState('');
  const [tooMany, setTooMany] = useState(false);
  const [aiCopied, setAiCopied] = useState(false);
  const [st, setSt] = useState<StorageStatus | null>(null);
  useEffect(() => { void storageStatus().then(setSt); }, []);
  if (!accounts || !cats || !batches) return <Skeleton />;

  async function doExport() {
    const b = await exportBackup(db, { includeSheetUrl: includeUrl });
    const ok = await shareOrDownload(`patrimonio-copia-${todayISO()}.json`, JSON.stringify(b, null, 2), 'application/json');
    if (!ok) return setMsg('Copia cancelada: no se ha guardado.');
    await setSetting('lastBackup', new Date().toISOString());
    setMsg('Copia hecha. Si no la guardaste en Archivos (iCloud Drive) o no te la enviaste, hazlo ahora: es tu única protección.');
  }
  async function pickJson(f: File | undefined) {
    if (!f) return; setMsg('');
    try {
      const obj = JSON.parse(await f.text());
      const errs = validateBackup(obj);
      if (errs.length) return setMsg(`Archivo no válido: ${errs[0]}`);
      setPending(obj as Backup);
    } catch { setMsg('Ese archivo no es un JSON válido.'); }
  }
  async function pickCsv(f: File | undefined, acc: number | '' = defAcc) {
    if (!f) return;
    const text = await f.text(); setCsvText(text);
    reparse(text, acc);
  }
  function reparse(text: string, acc: number | '') {
    const r = parseImport(text, accounts!, cats!, acc === '' ? null : acc);
    setRows(r.rows); setTooMany(r.tooMany);
  }
  const valid = rows?.filter((r) => r.tx) ?? [];

  return (
    <>
      <BackHeader title="Copia, exportar e importar" to="/settings" />
      {msg && <Banner>{msg}</Banner>}

      <Section title="Protección de tus datos">
        <Group>
          <Row right={<span className={st?.standalone ? 'text-income' : 'text-warning'}>{st ? (st.standalone ? 'Sí' : 'No') : '…'}</span>}>Instalada en la pantalla de inicio</Row>
          <Row right={<span className={st?.persisted ? 'text-income' : 'text-warning'}>{st ? (st.persisted === null ? 'No disponible' : st.persisted ? 'Sí' : 'No') : '…'}</span>}>Almacenamiento protegido</Row>
          <Row right={<span className="num text-text-muted">{st?.usageBytes != null ? fmtBytes(st.usageBytes) : '—'}</span>}>Espacio usado</Row>
        </Group>
        {st && !st.standalone && st.ios && <p className="mt-2 text-footnote text-warning">Safari borra los datos de una web que no abres en 7 días, pero no los de una app instalada. En Safari: Compartir &gt; Añadir a pantalla de inicio, y abre la app desde ahí.</p>}
        {st && st.persisted === false && st.standalone && <button className="btn-secondary mt-2 w-full" onClick={async () => { await requestPersistence(); setSt(await storageStatus()); }}>Pedir protección de nuevo</button>}
      </Section>

      <Section title="Copia de seguridad (JSON)" hint={last ? `Última copia: ${new Date(last).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Aún no has hecho ninguna copia.'}>
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-footnote text-text-muted">Incluye cuentas, movimientos, inversiones, presupuestos, metas y recurrentes. Es la única copia de tus datos: hazla cada pocas semanas.</p>
          <label className="flex min-h-tap items-center justify-between"><span>Incluir el enlace de mi hoja</span><input type="checkbox" role="switch" className="size-6" checked={includeUrl} onChange={(e) => setIncludeUrl(e.target.checked)} /></label>
          <button className="btn-primary" onClick={doExport}>Guardar copia</button>
          <button className="btn-secondary" onClick={() => file.current?.click()}>Restaurar desde un archivo…</button>
          <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Archivo de copia" onChange={(e) => { void pickJson(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </Section>

      {pending && (() => { const s = summarizeBackup(pending); return (
        <div className="card mb-6 flex flex-col gap-3 border border-danger p-4" role="alertdialog" aria-label="Confirmar restauración">
          <p className="text-headline">¿Reemplazar todo con esta copia?</p>
          <p className="text-footnote text-text-muted">Copia del {new Date(s.exportedAt).toLocaleDateString('es-ES')}: {s.accounts} cuentas, {s.transactions} movimientos, {s.assets} inversiones. Lo que tienes ahora se sustituirá.</p>
          <DangerButton label="Reemplazar mis datos" confirmLabel="Pulsa otra vez para reemplazar" onConfirm={async () => {
            try { await restoreBackup(db, pending); setPending(null); setMsg('Copia restaurada.'); } catch (e) { setMsg(`No se pudo restaurar: ${e instanceof Error ? e.message : 'error'}. No se ha cambiado nada.`); setPending(null); }
          }} />
          <button className="btn-secondary" onClick={() => setPending(null)}>Cancelar</button>
        </div>); })()}

      <Section title="Exportar movimientos (CSV)">
        <div className="card flex flex-col gap-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde"><input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Hasta"><input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <button className="btn-secondary" onClick={async () => {
            const all = await db.transactions.toArray();
            download(`movimientos-${todayISO()}.csv`, transactionsToCsv(all, accounts, cats, from && to ? from : undefined, from && to ? to : undefined), 'text/csv');
          }}>Descargar CSV</button>
          <p className="text-footnote text-text-muted">Las transferencias no se incluyen. Sin fechas se exporta todo.</p>
        </div>
      </Section>

      <Section title="Importar movimientos (CSV)">
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-footnote text-text-muted">Columnas: Fecha, Descripción, Categoría, Tipo, Cuenta, Importe. Máximo {MAX_IMPORT_ROWS} filas. Lo importado queda en el historial y las estadísticas, pero no cambia el saldo de tus cuentas.</p>
          <button className="btn-secondary" onClick={() => download('plantilla-movimientos.csv', CSV_TEMPLATE, 'text/csv')}>Descargar plantilla</button>
          <button className="btn-secondary" onClick={async () => { await navigator.clipboard?.writeText(aiInstructions(cats, accounts)); setAiCopied(true); }}>{aiCopied ? 'Instrucciones copiadas' : 'Copiar instrucciones para tu IA'}</button>
          <Field label="Cuenta por defecto">
            <select className="field" value={defAcc} onChange={(e) => { const v = e.target.value === '' ? '' : Number(e.target.value); setDefAcc(v); if (csvText) reparse(csvText, v); }}>
              <option value="">Ninguna</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <button className="btn-primary" onClick={() => csvFile.current?.click()}>Elegir archivo CSV…</button>
          <input ref={csvFile} type="file" accept=".csv,text/csv" hidden aria-label="Archivo CSV" onChange={(e) => { void pickCsv(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </Section>

      {rows && (
        <Section title={`Vista previa: ${valid.length} válidas de ${rows.length}`}>
          {tooMany && <Banner tone="warn">El archivo tiene más de {MAX_IMPORT_ROWS} filas; solo se ven las primeras.</Banner>}
          <Group>
            {rows.slice(0, 50).map((r) => (
              <Row key={r.line} right={<button className="min-h-tap text-footnote text-danger" onClick={() => setRows(rows.filter((x) => x !== r))}>Quitar</button>}>
                {r.tx ? <><span className="num block">{r.tx.date} · {r.tx.kind === 'expense' ? '−' : '+'}{(r.tx.amountCents / 100).toFixed(2)} · {r.tx.note || 'sin descripción'}</span>
                  {r.warning && <span className="block text-footnote text-warning">{r.warning}</span>}</>
                  : <span className="block text-danger">Línea {r.line}: {r.error}</span>}
              </Row>
            ))}
          </Group>
          {rows.length > 50 && <p className="mt-2 text-footnote text-text-muted">Se muestran 50 de {rows.length}; se importarán todas las válidas.</p>}
          <div className="mt-3 flex gap-2">
            <button className="btn-primary flex-1" disabled={valid.length === 0} onClick={async () => {
              await commitImport(db, valid.map((r) => r.tx!)); setMsg(`Importados ${valid.length} movimientos. Puedes deshacerlo abajo.`); setRows(null);
            }}>Importar {valid.length}</button>
            <button className="btn-secondary" onClick={() => setRows(null)}>Cancelar</button>
          </div>
        </Section>
      )}

      {batches.length > 0 && (
        <Section title="Importaciones anteriores">
          <Group>
            {[...batches].reverse().map((b) => (
              <Row key={b.id} right={<button className="min-h-tap text-danger" onClick={async () => { await undoImport(db, b.id!); setMsg('Importación deshecha.'); }}>Deshacer</button>}>
                {new Date(b.createdAt).toLocaleDateString('es-ES')} · {b.count} movimientos
              </Row>
            ))}
          </Group>
        </Section>
      )}
      <button className="mt-2 min-h-tap text-footnote text-text-muted" onClick={() => nav('/settings')}>Cerrar</button>
    </>
  );
}

/* ---------- Preferencias ---------- */
export function Preferences() {
  const theme = useSetting<string>('theme', 'auto') ?? 'auto';
  const currency = useSetting<string>('currency', 'EUR') ?? 'EUR';
  return (
    <>
      <BackHeader title="Preferencias" to="/settings" />
      <Group>
        <label className="flex min-h-tap items-center justify-between px-4"><span>Moneda principal</span>
          <select className="bg-transparent text-text-muted outline-none" value={currency} onChange={(e) => setSetting('currency', e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="flex min-h-tap items-center justify-between px-4"><span>Tema</span>
          <select className="bg-transparent text-text-muted outline-none" value={theme} onChange={(e) => setSetting('theme', e.target.value)}>
            <option value="auto">Automático</option><option value="light">Claro</option><option value="dark">Oscuro</option></select></label>
      </Group>
      <p className="mt-3 text-footnote text-text-muted">Cambiar la moneda principal no modifica tus cuentas: solo cómo se suman los totales.</p>
    </>
  );
}

/* ---------- Privacidad y bloqueo ---------- */
export function Privacy() {
  const hide = useSetting<boolean>('hideBalances', false) ?? false;
  const pinHash = useSetting<string | null>('pinHash', null);
  const [pin, setPinV] = useState('');
  const [current, setCurrent] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <>
      <BackHeader title="Privacidad y bloqueo" to="/settings" />
      <Group>
        <label className="flex min-h-tap items-center justify-between px-4"><span>Ocultar saldos</span><input type="checkbox" role="switch" className="size-6" checked={hide} onChange={(e) => setSetting('hideBalances', e.target.checked)} /></label>
      </Group>
      <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Bloqueo con PIN</h2>
      <div className="card flex flex-col gap-3 p-4">
        {pinHash ? (
          <>
            <p>El bloqueo está activado.</p>
            <Field label="PIN actual para quitarlo"><input className="field num" type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
            <button className="btn-secondary" onClick={async () => { if (await checkPin(current)) { await clearPin(); setCurrent(''); setMsg('Bloqueo desactivado.'); } else setMsg('PIN incorrecto.'); }}>Desactivar bloqueo</button>
          </>
        ) : (
          <>
            <Field label="Elige un PIN de 4 a 8 dígitos"><input className="field num" type="password" inputMode="numeric" value={pin} onChange={(e) => setPinV(e.target.value.replace(/\D/g, ''))} /></Field>
            <button className="btn-primary" onClick={async () => { if (pin.length < 4 || pin.length > 8) return setMsg('El PIN debe tener entre 4 y 8 dígitos.'); await setPin(pin); sessionStorage.setItem('unlocked', '1'); setPinV(''); setMsg('Bloqueo activado.'); }}>Activar bloqueo</button>
          </>
        )}
        {msg && <p role="status" className="text-footnote text-text-muted">{msg}</p>}
      </div>
      <p className="mt-3 text-footnote text-text-muted">El PIN impide que otra persona abra la app en tu móvil, pero no cifra los datos guardados. Si lo olvidas, solo se puede quitar borrando los datos de la web en los ajustes de Safari: restaura antes desde tu copia.</p>
    </>
  );
}

/* ---------- Borrar datos ---------- */
export function AccountPage() {
  const nav = useNavigate();
  return (
    <>
      <BackHeader title="Borrar datos" to="/settings" />
      <p className="mb-4 text-footnote text-text-muted">Se borra todo lo que hay en este móvil: cuentas, movimientos, inversiones y ajustes. No se puede deshacer. Haz antes una copia si no estás seguro.</p>
      <div className="flex flex-col gap-3">
        <button className="btn-secondary" onClick={() => nav('/settings/data')}>Hacer una copia primero</button>
        <DangerButton label="Empezar de cero" confirmLabel="Pulsa otra vez para borrarlo todo" onConfirm={async () => { await wipeAll(db); await db.settings.clear(); sessionStorage.removeItem('unlocked'); nav('/', { replace: true }); }} />
      </div>
    </>
  );
}
