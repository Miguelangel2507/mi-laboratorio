import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db } from '../lib/db';
import { todayISO } from '../lib/domain';
import { applyLegacyCloses, parseLegacyCloses, planLegacyCloses, type LegacyClose } from '../lib/closes';
import { useMoney } from '../lib/hooks';
import { Banner, Group, Row, Section, DangerButton } from '../components/ui';

/** Trae los cierres mensuales de la cartera de la app anterior (solo Cartera: ni cuentas ni movimientos). */
export function LegacyClosesImport() {
  const money = useMoney();
  const file = useRef<HTMLInputElement>(null);
  const closes = useLiveQuery(() => db.monthCloses.toArray(), []);
  const [list, setList] = useState<LegacyClose[] | null>(null);
  const [msg, setMsg] = useState('');
  if (!closes) return null;

  const plan = list ? planLegacyCloses(list, closes, todayISO()) : null;
  const imported = closes.filter((c) => c.source === 'import').length;
  const real = closes.filter((c) => c.source !== 'import').length;

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg('');
    try {
      const parsed = parseLegacyCloses(JSON.parse(await f.text()));
      if (!parsed) return setMsg('Ese archivo no es una copia de la app anterior: no trae cierres mensuales ni precios por mes.');
      if (parsed.length === 0) return setMsg('El archivo no trae ningún cierre mensual válido.');
      setList(parsed);
    } catch { setMsg('No se pudo leer ese archivo.'); }
  }

  return (
    <Section title="Cierres mensuales de tu app anterior" hint="Solo trae el valor de la cartera al cerrar cada mes, para el «Rendimiento mensual» de Cartera. No toca tus cuentas, movimientos ni compras.">
      {msg && <Banner>{msg}</Banner>}
      <div className="card flex flex-col gap-3 p-4">
        <p className="text-footnote text-text-muted">Tienes {imported} {imported === 1 ? 'cierre importado' : 'cierres importados'} y {real} {real === 1 ? 'cierre real' : 'cierres reales'}.</p>
        <button className="btn-secondary" onClick={() => file.current?.click()}>Elegir el archivo de la app anterior…</button>
        <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Archivo de la app anterior" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
        {imported > 0 && <DangerButton label="Quitar los cierres importados" confirmLabel="Pulsa otra vez para quitarlos" onConfirm={async () => { await db.monthCloses.where('source').equals('import').delete(); setMsg('Cierres importados quitados.'); }} />}
      </div>

      {plan && list && (
        <div className="mt-3">
          <h3 className="mb-2 text-footnote uppercase tracking-wide text-text-muted">Vista previa: {plan.add.length} de {list.length}</h3>
          <Group>
            {list.map((c) => {
              const skip = plan.skipped.find((s) => s.month === c.month);
              return (
                <Row key={c.month} right={<span className={`text-footnote ${skip ? 'text-text-muted' : 'text-accent'}`}>{skip ? skip.reason : 'se importa'}</span>}>
                  <span className="num block">{c.month} · {c.prices ? `precios de ${Object.keys(c.prices).length} fondos` : money(c.marketCents ?? 0, 'EUR')}</span>
                  {c.investedCents != null && <span className="block text-footnote text-text-muted">invertido {money(c.investedCents, 'EUR')}</span>}
                </Row>
              );
            })}
          </Group>
          <p className="mt-2 text-footnote text-text-muted">Si algún mes de tu app anterior no sumaba todos los fondos, no se mezcla con los estimados: ese mes se calcula con el precio de tus compras.</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary flex-1" disabled={plan.add.length === 0} onClick={async () => { const n = await applyLegacyCloses(db, list, todayISO()); setMsg(`Importados ${n} cierres.`); setList(null); }}>Importar {plan.add.length}</button>
            <button className="btn-secondary" onClick={() => setList(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </Section>
  );
}
