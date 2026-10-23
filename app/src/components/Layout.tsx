import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, Home, Landmark, LineChart, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

const tab = 'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-tap text-caption';

function Tab({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `${tab} ${isActive ? 'text-accent' : 'text-text-muted'}`}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

export function Layout() {
  const nav = useNavigate();
  return (
    <div className="mx-auto flex h-full max-w-[560px] flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-[max(env(safe-area-inset-top),16px)]">
        <Outlet />
      </main>
      <nav aria-label="Principal" className="bar-blur fixed inset-x-0 bottom-0 border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[560px] items-center">
          <Tab to="/" icon={<Home size={24} />} label="Inicio" />
          <Tab to="/stats" icon={<BarChart3 size={24} />} label="Estadísticas" />
          <div className="flex flex-1 justify-center">
            <button aria-label="Añadir movimiento" onClick={() => nav('/add')}
              className="-mt-5 grid size-14 place-items-center rounded-pill bg-accent text-on-accent shadow-pop">
              <Plus size={28} />
            </button>
          </div>
          <Tab to="/accounts" icon={<Landmark size={24} />} label="Cuentas" />
          <Tab to="/investments" icon={<LineChart size={24} />} label="Cartera" />
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
