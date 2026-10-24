import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Home, Landmark, LineChart, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';

const tab = 'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-tap text-caption';

function Tab({ to, icon, label, badge = 0 }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `${tab} relative py-1.5 ${isActive ? 'text-accent' : 'text-text-muted'}`}
      aria-label={badge > 0 ? `${label}, ${badge} por confirmar` : undefined}>
      {icon}
      <span>{label}</span>
      {badge > 0 && <span aria-hidden="true" className="absolute right-1/4 top-0.5 grid min-w-4 place-items-center rounded-pill bg-danger px-1 text-[10px] font-bold leading-4 text-on-accent">{badge}</span>}
    </NavLink>
  );
}

export function Layout() {
  const nav = useNavigate();
  const pending = useLiveQuery(() => db.planRuns.where('status').equals('pending').count(), []) ?? 0;
  return (
    <div className="mx-auto flex h-full max-w-[560px] flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-32 pt-[max(env(safe-area-inset-top),16px)]">
        <Outlet />
      </main>
      <nav aria-label="Principal" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="bar-blur pointer-events-auto mx-auto flex max-w-[480px] items-center rounded-pill border border-border px-2 shadow-pop">
          <Tab to="/" icon={<Home size={24} />} label="Inicio" />
          <Tab to="/stats" icon={<BarChart3 size={24} />} label="Estadísticas" />
          <div className="flex flex-1 justify-center">
            <button aria-label="Añadir movimiento" onClick={() => nav('/add')}
              className="grid size-12 place-items-center rounded-pill bg-accent text-on-accent shadow-card">
              <Plus size={26} />
            </button>
          </div>
          <Tab to="/accounts" icon={<Landmark size={24} />} label="Cuentas" />
          <Tab to="/investments" icon={<LineChart size={24} />} label="Cartera" badge={pending} />
        </div>
      </nav>
    </div>
  );
}

export function LargeTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between">
      <h1 className="text-large-title">{children}</h1>
      {action}
    </header>
  );
}

export function EmptyState({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <h2 className="text-headline">{title}</h2>
      <p className="text-footnote text-text-muted">{text}</p>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
