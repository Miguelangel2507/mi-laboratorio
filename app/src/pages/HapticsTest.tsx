import { useRef, useState } from 'react';
import { BackHeader, Group, Row, Section } from '../components/ui';

/**
 * Pantalla de diagnóstico: prueba varias formas de pedir un toque háptico, porque iOS no tiene una API oficial.
 * Desde aquí no se puede saber si el móvil vibró: lo dice quien lo prueba.
 */
type Result = Record<string, string>;

function makeSwitch(where: 'head' | 'body-hidden' | 'body-tiny'): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  label.appendChild(input);
  if (where === 'head') { label.style.display = 'none'; document.head.appendChild(label); }
  else if (where === 'body-hidden') { label.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none'; document.body.appendChild(label); }
  else { label.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.02;overflow:hidden'; document.body.appendChild(label); }
  return { label, input };
}

export default function HapticsTest() {
  const [res, setRes] = useState<Result>({});
  const native = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setRes((r) => ({ ...r, [k]: v }));
  const nav = navigator as Navigator & { standalone?: boolean };

  const run = (k: string, f: () => string) => { try { set(k, f()); } catch (e) { set(k, `error: ${e instanceof Error ? e.message : e}`); } };

  const variants: { k: string; label: string; hint: string; onClick?: () => void; onPointerDown?: () => void }[] = [
    { k: 'A', label: 'A · interruptor en <head> (oculto)', hint: 'El método más usado', onClick: () => run('A', () => { const { label } = makeSwitch('head'); label.click(); label.remove(); return 'ejecutado'; }) },
    { k: 'B', label: 'B · interruptor fuera de pantalla', hint: 'Lo que usa la opción actual', onClick: () => run('B', () => { const { label } = makeSwitch('body-hidden'); label.click(); label.remove(); return 'ejecutado'; }) },
    { k: 'C', label: 'C · interruptor diminuto visible', hint: 'Dentro de la pantalla, casi invisible', onClick: () => run('C', () => { const { label } = makeSwitch('body-tiny'); label.click(); label.remove(); return 'ejecutado'; }) },
    { k: 'D', label: 'D · pulsar el input directamente', hint: 'input.click() en vez de la etiqueta', onClick: () => run('D', () => { const { label, input } = makeSwitch('body-tiny'); input.click(); label.remove(); return 'ejecutado'; }) },
    { k: 'E', label: 'E · al apoyar el dedo (no al soltar)', hint: 'Se dispara en pointerdown', onPointerDown: () => run('E', () => { const { label } = makeSwitch('head'); label.click(); label.remove(); return 'ejecutado'; }) },
    { k: 'F', label: 'F · API de vibración del navegador', hint: 'navigator.vibrate(60)', onClick: () => run('F', () => (typeof navigator.vibrate === 'function' ? `devuelve ${navigator.vibrate(60)}` : 'no existe en este navegador')) },
  ];

  return (
    <>
      <BackHeader title="Diagnóstico de vibración" to="/settings/preferences" />
      <p className="mb-4 text-footnote text-text-muted">Pulsa cada botón varias veces y apunta cuáles hacen vibrar el iPhone. La app no puede saberlo por sí sola.</p>

      <Section title="Métodos">
        <div className="flex flex-col gap-2">
          {variants.map((v) => (
            <div key={v.k} className="card flex items-center justify-between gap-3 p-3">
              <button className="btn-secondary flex-1 text-left" onClick={v.onClick} onPointerDown={v.onPointerDown}>{v.label}</button>
              <span className="w-24 shrink-0 text-right text-caption text-text-muted">{res[v.k] ?? v.hint}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="G · Interruptor de iOS que tocas tú" hint="Toca el interruptor directamente. Si este vibra y los de arriba no, el truco programático ya no funciona en tu versión.">
        <div className="card flex min-h-tap items-center justify-between px-4">
          <span>Toca este interruptor</span>
          <input ref={native} type="checkbox" {...{ switch: '' }} aria-label="Interruptor de prueba" />
        </div>
      </Section>

      <Section title="Datos del dispositivo">
        <Group>
          <Row right={<span className="text-text-muted">{nav.standalone || matchMedia('(display-mode: standalone)').matches ? 'app instalada' : 'Safari'}</span>}>Se ejecuta en</Row>
          <Row right={<span className="text-text-muted">{typeof navigator.vibrate === 'function' ? 'sí' : 'no'}</span>}>Tiene navigator.vibrate</Row>
          <Row right={<span className="text-text-muted">{CSS.supports('appearance', 'auto') ? 'sí' : 'no'}</span>}>Admite apariencia nativa</Row>
          <Row right={<span className="max-w-[60%] truncate text-text-muted">{navigator.userAgent.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? '?'}</span>}>iOS según el navegador</Row>
        </Group>
      </Section>
    </>
  );
}
