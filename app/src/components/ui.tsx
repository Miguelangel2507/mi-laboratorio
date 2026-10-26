import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function BackHeader({ title, action, to }: { title: string; action?: ReactNode; to?: string }) {
  const nav = useNavigate();
  return (
    <header className="mb-4 flex items-center justify-between gap-1">
      <div className="flex min-w-0 items-center gap-1">
        {to ? (
          <Link to={to} aria-label="Volver" className="-ml-2 grid min-h-tap min-w-tap place-items-center text-accent"><ChevronLeft size={26} /></Link>
        ) : (
          <button aria-label="Volver" onClick={() => nav(-1)} className="-ml-2 grid min-h-tap min-w-tap place-items-center text-accent"><ChevronLeft size={26} /></button>
        )}
        <h1 className="truncate text-title">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function Section({ title, children, hint }: { title?: string; children: ReactNode; hint?: string }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-2 text-footnote uppercase tracking-wide text-text-muted">{title}</h2>}
      {children}
      {hint && <p className="mt-2 text-footnote text-text-muted">{hint}</p>}
    </section>
  );
}

export function Group({ children }: { children: ReactNode }) {
  return <div className="card divide-y divide-border overflow-hidden">{children}</div>;
}

export function Row({ to, onClick, children, right, danger }: { to?: string; onClick?: () => void; children: ReactNode; right?: ReactNode; danger?: boolean }) {
  const cls = `flex min-h-tap w-full items-center justify-between gap-3 px-4 py-2 text-left ${danger ? 'text-danger' : ''}`;
  const inner = (<><span className="min-w-0 flex-1">{children}</span>{right}{to && <ChevronRight size={18} className="shrink-0 text-text-muted" />}</>);
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-footnote text-text-muted">{label}</span>
      {children}
      {hint && <span className="text-footnote text-text-muted">{hint}</span>}
    </label>
  );
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-md bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`min-h-[36px] rounded-sm text-footnote font-semibold ${value === o.id ? 'bg-surface shadow-card' : 'text-text-muted'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Botón destructivo en dos pasos: el primer toque pide confirmar. */
export function DangerButton({ label, confirmLabel = '¿Seguro? Pulsa otra vez', onConfirm }: { label: string; confirmLabel?: string; onConfirm: () => void | Promise<void> }) {
  const [armed, setArmed] = useState(false);
  return (
    <button type="button" className={`btn w-full ${armed ? 'bg-danger text-on-accent' : 'bg-surface-2 text-danger'}`}
      onClick={() => { if (armed) void onConfirm(); else { setArmed(true); setTimeout(() => setArmed(false), 4000); } }}>
      {armed ? confirmLabel : label}
    </button>
  );
}

export function Skeleton({ h = 'h-24' }: { h?: string }) {
  return <div className={`card ${h} animate-pulse`} aria-busy="true" />;
}

export function Banner({ children, tone = 'info', action }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger'; action?: ReactNode }) {
  const c = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warning' : 'text-text';
  return (
    <div role="status" className={`card mb-3 flex items-center justify-between gap-3 px-4 py-3 text-footnote ${c}`}>
      <span>{children}</span>{action}
    </div>
  );
}

export const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
export const pct = (x: number | null, digits = 1) => (x === null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits).replace('.', ',')} %`);

/** En iOS (17.4 o superior) se ve y se comporta como un interruptor nativo, con su toque háptico; en el resto, como una casilla. */
export function Switch(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>) {
  return <input type="checkbox" role="switch" {...{ switch: '' }} {...props} />;
}
