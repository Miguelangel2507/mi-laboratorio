export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;

export interface StorageStatus { standalone: boolean; ios: boolean; persisted: boolean | null; usageBytes: number | null }

export async function storageStatus(): Promise<StorageStatus> {
  let persisted: boolean | null = null;
  let usageBytes: number | null = null;
  try { persisted = (await navigator.storage?.persisted?.()) ?? null; } catch { /* no disponible */ }
  try { usageBytes = (await navigator.storage?.estimate?.())?.usage ?? null; } catch { /* no disponible */ }
  return { standalone: isStandalone(), ios: isIOS(), persisted, usageBytes };
}

/** Pide que el navegador no borre los datos. Safari solo concede esto a la app instalada. */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * En el iPhone abre la hoja de compartir (Guardar en Archivos, iCloud Drive, Correo...).
 * Devuelve false si el usuario la cancela, para no contar como copia hecha.
 */
export async function shareOrDownload(name: string, text: string, type: string): Promise<boolean> {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; }
    catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return false; }
  }
  download(name, text, type);
  return true;
}

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
