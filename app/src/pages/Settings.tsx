import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { setSetting } from '../lib/db';
import { sheetCsvUrl } from '../lib/sheet';
import { useSetting } from '../lib/hooks';

export default function Settings() {
  const saved = useSetting<string>('sheetUrl', '');
  const theme = useSetting<string>('theme', 'auto') ?? 'auto';
  const hide = useSetting<boolean>('hideBalances', false) ?? false;
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { if (saved !== undefined) setLink(saved); }, [saved]);

  async function saveLink() {
    if (link.trim() && !sheetCsvUrl(link)) return setMsg('Ese enlace no parece de Google Sheets.');
    await setSetting('sheetUrl', link.trim());
    setMsg('Enlace guardado.');
  }

  return (
    <>
      <header className="mb-4 flex items-center gap-1">
        <Link to="/" aria-label="Volver" className="-ml-2 grid min-h-tap min-w-tap place-items-center text-accent"><ChevronLeft size={26} /></Link>
        <h1 className="text-title">Ajustes</h1>
      </header>

      <h2 className="mb-2 text-footnote uppercase tracking-wide text-text-muted">Apariencia</h2>
      <div className="card divide-y divide-border">
        <label className="flex min-h-tap items-center justify-between px-4">
          <span>Tema</span>
          <select className="bg-transparent text-text-muted outline-none" value={theme} onChange={(e) => setSetting('theme', e.target.value)}>
            <option value="auto">Automático</option><option value="light">Claro</option><option value="dark">Oscuro</option>
          </select>
        </label>
        <label className="flex min-h-tap items-center justify-between px-4">
          <span>Ocultar saldos</span>
          <input type="checkbox" role="switch" checked={hide} onChange={(e) => setSetting('hideBalances', e.target.checked)} className="size-6" />
        </label>
      </div>

      <h2 className="mb-2 mt-6 text-footnote uppercase tracking-wide text-text-muted">Precios de fondos</h2>
      <div className="card flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-footnote text-text-muted">Enlace de tu Google Sheet (con columnas ISIN, Nombre, VL y Fecha)</span>
          <input className="field" inputMode="url" autoCapitalize="off" value={link} onChange={(e) => { setLink(e.target.value); setMsg(''); }}
            placeholder="https://docs.google.com/spreadsheets/d/…" />
        </label>
        {msg && <p role="status" className="text-footnote text-text-muted">{msg}</p>}
        <button className="btn-secondary" onClick={saveLink}>Guardar enlace</button>
        <p className="text-footnote text-text-muted">El enlace se guarda solo en este móvil. La hoja debe poder verse con el enlace y no debe contener tus cantidades.</p>
      </div>
    </>
  );
}
