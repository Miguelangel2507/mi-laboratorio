import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db';
import { todayISO } from '../lib/domain';
import { avgPriceE5, assetView, holding, TYPE_LABEL } from '../lib/invest';
import { parseDecimal, toCents } from '../lib/money';
import { useMoney } from '../lib/hooks';
import { BackHeader, DangerButton, Field, Group, Row, Seg, Skeleton, fmtDate, pct } from '../components/ui';

const price = (e5: number | null, cur: string) =>
  e5 === null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(e5 / 1e5);
const qtyFmt = (q: number) => q.toLocaleString('es-ES', { maximumFractionDigits: 6 });

export default function AssetDetail() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const money = useMoney();
  const asset = useLiveQuery(() => db.assets.get(id), [id]);
  const trades = useLiveQuery(() => db.trades.where('assetId').equals(id).toArray(), [id]);
  const quotes = useLiveQuery(() => db.quotes.toArray(), []);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('');
  const [px, setPx] = useState('');
  const [date, setDate] = useState(todayISO());
  const [value, setValue] = useState('');
  const [manualPx, setManualPx] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!asset) return;
    if (asset.valueCents !== undefined) setValue((asset.valueCents / 100).toFixed(2).replace('.', ','));
    if (asset.manualPriceE5) setManualPx((asset.manualPriceE5 / 1e5).toString().replace('.', ','));
  }, [asset]);
  if (!asset || !trades || !quotes) return <Skeleton h="h-40" />;

  const v = assetView(asset, trades, new Map(quotes.map((q) => [q.key, q])));
  const isFixed = asset.type === 'other' || asset.type === 'debt';
  const h = holding(trades);

  async function addTrade(e: FormEvent) {
    e.preventDefault();
    const q = parseDecimal(qty), p = parseDecimal(px);
    if (q === null || q <= 0) return setError('Las participaciones deben ser un número mayor que 0.');
    if (p === null || p <= 0) return setError('Indica el precio por participación.');
    if (side === 'sell' && q > h.quantity + 1e-9) return setError(`Solo tienes ${qtyFmt(h.quantity)} participaciones.`);
    await db.trades.add({ assetId: id, date, side, quantity: q, priceE5: Math.round(p * 1e5) });
    setQty(''); setPx(''); setError('');
  }

  return (
    <>
      <BackHeader title={asset.name} to="/investments" />
      <div className="card mb-4 p-5">
        <p className="text-footnote text-text-muted">{TYPE_LABEL[asset.type]}{asset.key && !asset.key.startsWith('manual:') ? ` · ${asset.key}` : ''}</p>
        <p className="num text-balance">{asset.type === 'debt' ? '−' : ''}{money(v.valueCents, asset.currency)}</p>
        {!isFixed && (
          <p className={`num text-footnote ${v.noPrice ? 'text-warning' : v.pnlCents >= 0 ? 'text-income' : 'text-danger'}`}>
            {v.noPrice ? 'Sin precio: se valora al coste. Pon un precio manual abajo.' : `${v.pnlCents >= 0 ? '+' : '−'}${money(Math.abs(v.pnlCents), asset.currency)} (${pct(v.pnlPct)})`}
          </p>
        )}
      </div>

      {isFixed ? (
        <form className="card flex flex-col gap-3 p-4" noValidate onSubmit={async (e) => {
          e.preventDefault(); const c = toCents(value);
          if (c === null || c < 0) return setError('Indica un valor válido.');
          await db.assets.update(id, { valueCents: c }); setError('');
        }}>
          <Field label={asset.type === 'debt' ? 'Importe pendiente' : 'Valor actual'}><input className="field num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
          {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
          <button className="btn-secondary" type="submit">Actualizar valor</button>
        </form>
      ) : (
        <>
          <Group>
            <Row right={<span className="num">{qtyFmt(h.quantity)}</span>}>Participaciones</Row>
            <Row right={<span className="num">{price(avgPriceE5(h) || null, asset.currency)}</span>}>Precio medio</Row>
            <Row right={<span className="num">{price(v.priceE5, asset.currency)}</span>}>Precio actual</Row>
            <Row right={<span className="num">{money(v.costCents, asset.currency)}</span>}>Coste</Row>
            <Row right={<span className={`num ${h.realizedCents >= 0 ? 'text-income' : 'text-danger'}`}>{money(h.realizedCents, asset.currency)}</span>}>Ganancia realizada</Row>
          </Group>

          <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Registrar operación</h2>
          <form onSubmit={addTrade} noValidate className="card flex flex-col gap-3 p-4">
            <Seg label="Operación" value={side} onChange={setSide} options={[{ id: 'buy', label: 'Compra' }, { id: 'sell', label: 'Venta' }]} />
            <Field label="Participaciones"><input className="field num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Field label="Precio por participación"><input className="field num" inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} /></Field>
            <Field label="Fecha"><input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
            <button className="btn-primary" type="submit">Guardar operación</button>
          </form>

          {trades.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Operaciones</h2>
              <Group>
                {[...trades].sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0)).map((t) => (
                  <Row key={t.id} right={<button aria-label="Borrar operación" className="min-h-tap text-danger" onClick={() => db.trades.delete(t.id!)}>Borrar</button>}>
                    <span className="block">{t.side === 'buy' ? 'Compra' : 'Venta'} · {qtyFmt(t.quantity)} × {price(t.priceE5, asset.currency)}</span>
                    <span className="block text-footnote text-text-muted">{fmtDate(t.date)}</span>
                  </Row>
                ))}
              </Group>
            </>
          )}

          <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Precio manual</h2>
          <form className="card flex flex-col gap-3 p-4" noValidate onSubmit={async (e) => {
            e.preventDefault(); const p = manualPx.trim() === '' ? null : parseDecimal(manualPx);
            if (manualPx.trim() !== '' && (p === null || p <= 0)) return setError('Precio no válido.');
            await db.assets.update(id, { manualPriceE5: p === null ? null : Math.round(p * 1e5) }); setError('');
          }}>
            <Field label="Se usa solo si tu hoja no trae el precio" hint="Déjalo vacío para usar el de la hoja."><input className="field num" inputMode="decimal" value={manualPx} onChange={(e) => setManualPx(e.target.value)} /></Field>
            <button className="btn-secondary" type="submit">Guardar precio</button>
          </form>
        </>
      )}
      <div className="mt-6"><DangerButton label="Eliminar inversión" onConfirm={async () => {
        await db.transaction('rw', db.assets, db.trades, async () => { await db.trades.where('assetId').equals(id).delete(); await db.assets.delete(id); });
        nav('/investments', { replace: true });
      }} /></div>
    </>
  );
}
