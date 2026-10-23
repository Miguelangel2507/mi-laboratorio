import { useState } from 'react';
import { setSetting } from '../lib/db';

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'MXN', 'ARS', 'COP', 'CLP', 'BRL', 'JPY'];

export default function Welcome() {
  const [currency, setCurrency] = useState('EUR');
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
    </div>
  );
}
