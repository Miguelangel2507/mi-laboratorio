import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type AssetType } from '../lib/db';
import { todayISO } from '../lib/domain';
import { parseDecimal, toCents } from '../lib/money';
import { TYPE_LABEL } from '../lib/invest';
import { useSetting } from '../lib/hooks';
import { BackHeader, Field } from '../components/ui';
import { CURRENCIES } from './Welcome';

const TRADED: AssetType[] = ['fund', 'stock', 'etf', 'crypto'];
const TYPES: AssetType[] = ['fund', 'stock', 'etf', 'crypto', 'other', 'debt'];

export default function AssetNew() {
  const nav = useNavigate();
  const main = useSetting<string>('currency', 'EUR') ?? 'EUR';
  const quotes = useLiveQuery(() => db.quotes.toArray(), []);
  const [type, setType] = useState<AssetType>('fund');
  const [pick, setPick] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [currency, setCurrency] = useState(main);
  const [qty, setQty] = useState('');
  const [avg, setAvg] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const traded = TRADED.includes(type);
  const fromSheet = traded && pick !== '' && pick !== '__manual';

  async function save(e: FormEvent) {
    e.preventDefault();
    const q = quotes?.find((x) => x.key === pick);
    const finalName = (fromSheet ? q?.name : name)?.trim();
    if (!finalName) return setError('Ponle un nombre.');
    if (traded) {
      const quantity = parseDecimal(qty), price = parseDecimal(avg);
      if (quantity === null || quantity <= 0) return setError('Las participaciones deben ser un número mayor que 0.');
      if (price === null || price <= 0) return setError('Indica tu precio medio de compra.');
      const k = fromSheet ? pick : (key.trim() || `manual:${crypto.randomUUID()}`);
      if (await db.assets.where('key').equals(k).count()) return setError('Ya tienes esa inversión. Abre su ficha para añadir compras.');
      const id = (await db.assets.add({ type, key: k, name: finalName, currency: fromSheet ? 'EUR' : currency, manualPriceE5: null })) as number;
      await db.trades.add({ assetId: id, date: todayISO(), side: 'buy', quantity, priceE5: Math.round(price * 1e5) });
      nav(`/investments/${id}`, { replace: true });
    } else {
      const cents = toCents(value);
      if (cents === null || cents < 0) return setError('Indica un valor válido.');
      const id = (await db.assets.add({ type, key: `manual:${crypto.randomUUID()}`, name: finalName, currency, valueCents: cents })) as number;
      nav(`/investments/${id}`, { replace: true });
    }
  }

  return (
    <>
      <BackHeader title="Nueva inversión" />
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <Field label="Tipo">
          <select className="field" value={type} onChange={(e) => { setType(e.target.value as AssetType); setPick(''); setError(''); }}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}{t === 'other' ? ' (inmueble, coche, arte…)' : t === 'debt' ? ' (hipoteca, préstamo)' : ''}</option>)}
          </select>
        </Field>

        {traded && (
          <Field label="Elige de tu hoja" hint={quotes && quotes.length === 0 ? 'Tu hoja aún no está leída: conéctala en Ajustes y actualiza la cartera.' : undefined}>
            <select className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Elige…</option>
              {quotes?.map((q) => <option key={q.key} value={q.key}>{q.name}</option>)}
              <option value="__manual">Otra (la añado a mano)</option>
            </select>
          </Field>
        )}
        {(!traded || pick === '__manual') && (
          <Field label="Nombre"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'debt' ? 'Hipoteca' : type === 'other' ? 'Piso, coche…' : 'Nombre del activo'} /></Field>
        )}
        {pick === '__manual' && (
          <Field label="Código (ISIN o ticker, opcional)" hint="Si coincide con uno de tu hoja, tomará su precio."><input className="field" autoCapitalize="characters" value={key} onChange={(e) => setKey(e.target.value)} /></Field>
        )}
        {(!fromSheet) && (
          <Field label="Divisa"><select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        )}

        {traded ? (
          <>
            <Field label="Participaciones"><input className="field num" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0,000000" /></Field>
            <Field label="Precio medio de compra" hint="Lo que pagaste de media por cada participación."><input className="field num" inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} placeholder="0,00" /></Field>
          </>
        ) : (
          <Field label={type === 'debt' ? 'Importe pendiente (en positivo)' : 'Valor actual'}><input className="field num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></Field>
        )}
        {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
        <button className="btn-primary" type="submit">Guardar</button>
      </form>
    </>
  );
}
