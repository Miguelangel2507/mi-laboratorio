import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../lib/db';
import { todayISO } from '../lib/domain';
import { toCents } from '../lib/money';
import { useMoney, useNetWorth } from '../lib/hooks';
import { BackHeader, Field, Group, Row, Seg, Skeleton } from '../components/ui';

export default function NetWorth() {
  const money = useMoney();
  const { main, result } = useNetWorth();
  const points = useLiveQuery(() => db.netWorth.toArray(), []);
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  if (!result || !points) return <Skeleton h="h-40" />;

  const now = todayISO();
  const curLabel = period === 'month' ? now.slice(0, 7) : now.slice(0, 4);
  const own = points.filter((p) => p.period === period && p.label !== curLabel).sort((a, b) => a.label.localeCompare(b.label));
  const series = [...own.map((p) => ({ label: p.label, v: p.valueCents / 100 })), { label: curLabel, v: result.cents / 100 }];

  async function add(e: FormEvent) {
    e.preventDefault();
    const cents = toCents(value);
    const ok = period === 'month' ? /^\d{4}-(0[1-9]|1[0-2])$/.test(label) : /^\d{4}$/.test(label);
    if (!ok) return setError(period === 'month' ? 'Escribe el mes como AAAA-MM, por ejemplo 2026-03.' : 'Escribe el año como AAAA.');
    if (cents === null) return setError('El valor no es un número válido.');
    if (label >= curLabel) return setError('Solo puedes añadir periodos anteriores al actual; el actual se calcula solo.');
    const existing = await db.netWorth.where('[period+label]').equals([period, label]).first();
    if (existing) await db.netWorth.update(existing.id!, { valueCents: cents });
    else await db.netWorth.add({ period, label, valueCents: cents });
    setLabel(''); setValue(''); setError('');
  }

  return (
    <>
      <BackHeader title="Evolución del patrimonio" to="/" />
      <p className="card num mb-4 p-5 text-title">{money(result.cents, main)}</p>
      <Seg label="Escala" value={period} onChange={setPeriod} options={[{ id: 'month', label: 'Meses' }, { id: 'year', label: 'Años' }]} />
      <div className="card my-4 h-56 p-3">
        {series.length < 2 ? (
          <p className="grid h-full place-items-center px-6 text-center text-footnote text-text-muted">Añade periodos pasados abajo para ver la evolución. El actual se calcula solo.</p>
        ) : (
          <ResponsiveContainer>
            <LineChart data={series}>
              <CartesianGrid stroke="var(--c-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--c-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis width={48} tick={{ fill: 'var(--c-text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => [money(Math.round(Number(v) * 100), main), 'Patrimonio']} />
              <Line type="monotone" dataKey="v" stroke="var(--c-accent)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <h2 className="mb-2 text-footnote uppercase tracking-wide text-text-muted">Periodos anteriores (los apuntas tú)</h2>
      <form onSubmit={add} noValidate className="card mb-4 flex flex-col gap-3 p-4">
        <Field label={period === 'month' ? 'Mes (AAAA-MM)' : 'Año (AAAA)'}><input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={period === 'month' ? '2026-03' : '2025'} /></Field>
        <Field label={`Patrimonio en ese periodo (${main})`}><input className="field num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" /></Field>
        {error && <p role="alert" className="text-footnote text-danger">{error}</p>}
        <button className="btn-secondary" type="submit">Guardar periodo</button>
      </form>
      {own.length > 0 && (
        <Group>
          {[...own].reverse().map((p) => (
            <Row key={p.id} right={<span className="flex items-center gap-3"><span className="num">{money(p.valueCents, main)}</span>
              <button aria-label={`Borrar ${p.label}`} className="min-h-tap text-danger" onClick={() => db.netWorth.delete(p.id!)}>Borrar</button></span>}>{p.label}</Row>
          ))}
        </Group>
      )}
    </>
  );
}
