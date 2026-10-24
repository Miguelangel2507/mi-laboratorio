import { useEffect } from 'react';
import { useSetting } from './hooks';

/**
 * Toque háptico al pulsar botones.
 * - Android y navegadores con Vibration API: navigator.vibrate.
 * - iPhone: Safari no tiene esa API, pero (iOS 17.4+) un interruptor nativo `<input type="checkbox" switch>`
 *   da un toque háptico al activarse. Se mantiene uno oculto y se «pulsa» desde un toque real del usuario.
 *   No hay forma de comprobar desde fuera si el móvil llega a vibrar: depende del iOS y de que el
 *   «Respuesta háptica del sistema» esté activado en Ajustes > Sonidos y vibración.
 */
let label: HTMLLabelElement | null = null;

function ensureSwitch(): HTMLLabelElement {
  if (label?.isConnected) return label;
  label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.setAttribute('data-haptic-ignore', '');
  label.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  return label;
}

export function tap(): void {
  try {
    if (typeof navigator.vibrate === 'function') { navigator.vibrate(10); return; }
    ensureSwitch().click();
  } catch { /* sin soporte: no pasa nada */ }
}

const INTERACTIVE = 'button,a[href],[role="radio"],[role="switch"],select,summary,input[type="checkbox"],input[type="radio"]';

/** Con la opción activada, cada toque en un control real da un toque háptico. */
export function useHaptics() {
  const on = useSetting<boolean>('haptics', false);
  useEffect(() => {
    if (!on) return;
    const handler = (e: Event) => {
      const t = e.target as Element | null;
      if (!t?.closest || t.closest('[data-haptic-ignore]')) return;
      if (t.closest(INTERACTIVE)) tap();
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [on]);
}
