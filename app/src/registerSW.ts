/** Registra el service worker. Se comprueba si hay versión nueva al abrir, al volver a la app y cada hora. */
export function registerSW() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        const check = () => void reg.update().catch(() => undefined);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
        setInterval(check, 3_600_000);
      })
      .catch(() => undefined);
  });
}
