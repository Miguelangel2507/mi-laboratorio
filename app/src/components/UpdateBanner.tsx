import { useEffect, useState } from 'react';

/**
 * Avisa cuando una versión nueva ha tomado el control. La página abierta sigue con la versión antigua
 * hasta recargar, así que se ofrece recargar; si no, se verá sola la próxima vez que abras la app.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller; // en la primera instalación no hay nada que avisar
    const onChange = () => { if (hadController) setReady(true); };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);
  if (!ready) return null;
  return (
    <div role="status" className="bar-blur fixed inset-x-4 top-[max(env(safe-area-inset-top),8px)] z-20 mx-auto flex max-w-[520px] items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-footnote shadow-pop">
      <span>Hay una versión nueva de la app.</span>
      <button className="min-h-tap font-semibold text-accent" onClick={() => window.location.reload()}>Actualizar</button>
    </div>
  );
}
