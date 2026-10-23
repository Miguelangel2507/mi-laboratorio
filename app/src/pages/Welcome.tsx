import { useRef, useState } from 'react';
import { db, setSetting } from '../lib/db';
import { restoreBackup, validateBackup, type Backup } from '../lib/backup';

/** Las que publica el BCE (Frankfurter): son las únicas que la app puede convertir. */
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN',
  'TRY', 'BRL', 'MXN', 'CNY', 'HKD', 'INR', 'IDR', 'ILS', 'ISK', 'KRW', 'MYR', 'PHP', 'SGD', 'THB', 'ZAR'];

export default function Welcome() {
  const [currency, setCurrency] = useState('EUR');
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  async function restore(f: File | undefined) {
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const errs = validateBackup(obj);
      if (errs.length) return setMsg(`Archivo no válido: ${errs[0]}`);
      await restoreBackup(db, obj as Backup);
      if (!(await db.settings.get('currency'))) await setSetting('currency', 'EUR');
    } catch { setMsg('No se pudo leer ese archivo.'); }
  }
  return (
    <div className="mx-auto flex h-full max-w-[560px] flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-large-title">Bienvenido</h1>
        <p className="mt-2 text-text-muted">Tus cuentas, gastos e inversiones en un solo sitio. Todo se guarda en este móvil.</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-footnote text-text-muted">Moneda principal</span>
        <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <button className="btn-primary" onClick={() => setSetting('currency', currency)}>Empezar</button>
      <button className="btn-secondary" onClick={() => file.current?.click()}>Ya tengo una copia: restaurarla</button>
      <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Archivo de copia" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ''; }} />
      {msg && <p role="alert" className="text-footnote text-danger">{msg}</p>}
    </div>
  );
}
