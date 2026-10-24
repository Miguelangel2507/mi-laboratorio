import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';

/** Avisa cuando hay una versión nueva y la aplica solo cuando el usuario lo decide. */
export function UpdateBanner() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Busca versiones nuevas cada hora y cada vez que vuelves a la app.
      setInterval(() => void reg.update(), 3_600_000);
    },
  });
  useEffect(() => {
    const onVis = () => { if (!document.hidden) void navigator.serviceWorker?.getRegistration().then((r) => r?.update()); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  if (!needRefresh) return null;
  return (
    <div role="status" className="bar-blur fixed inset-x-4 top-[max(env(safe-area-inset-top),8px)] z-20 mx-auto flex max-w-[520px] items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-footnote shadow-pop">
      <span>Hay una versión nueva de la app.</span>
      <button className="min-h-tap font-semibold text-accent" onClick={() => void updateServiceWorker(true)}>Actualizar</button>
    </div>
  );
}
