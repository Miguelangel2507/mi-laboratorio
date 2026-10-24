import { useEffect, useState } from 'react';
import { setSetting } from '../lib/db';
import { DEFAULT_ALERTS, disableAlerts, enableAlerts, normalizeUrl, sendTest, supportProblem, type AlertsConfig, type Result } from '../lib/alerts';
import { DEFAULT_PLAN } from '../lib/plan';
import { useSetting } from '../lib/hooks';
import { isIOS, isStandalone } from '../lib/storage';
import { BackHeader, Field, Group, Row, Section, Skeleton } from '../components/ui';
import type { PlanConfig } from '../lib/db';

export default function AlertsPage() {
  const saved = useSetting<AlertsConfig>('alerts', DEFAULT_ALERTS);
  const plan = useSetting<PlanConfig>('plan', DEFAULT_PLAN);
  const [cfg, setCfg] = useState<AlertsConfig>(DEFAULT_ALERTS);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (saved) setCfg(saved); }, [saved]);
  if (!saved || !plan) return <Skeleton />;

  const problem = supportProblem();
  const perm = typeof Notification === 'undefined' ? 'no disponible' : Notification.permission === 'granted' ? 'concedido' : Notification.permission === 'denied' ? 'denegado' : 'sin pedir';
  const urlOk = !!normalizeUrl(cfg.workerUrl);
  const run = async (f: () => Promise<Result>) => { setBusy(true); setRes(null); setRes(await f()); setBusy(false); };

  return (
    <>
      <BackHeader title="Avisos" to="/settings" />
      <Section title="Estado">
        <Group>
          <Row right={<span className={isStandalone() ? 'text-income' : 'text-warning'}>{isStandalone() ? 'Sí' : 'No'}</span>}>Instalada en la pantalla de inicio</Row>
          <Row right={<span className={perm === 'concedido' ? 'text-income' : 'text-warning'}>{perm}</span>}>Permiso de notificaciones</Row>
          <Row right={<span className={saved.enabled ? 'text-income' : 'text-text-muted'}>{saved.enabled ? 'Activados' : 'Desactivados'}</span>}>Avisos</Row>
        </Group>
        {problem && <p role="alert" className="mt-2 text-footnote text-warning">{problem}</p>}
        {isIOS() && !isStandalone() && !problem && <p className="mt-2 text-footnote text-warning">Para recibir avisos en el iPhone abre la app desde el icono de la pantalla de inicio, no desde Safari.</p>}
      </Section>

      <Section title="Servicio de avisos" hint="Es una pequeña función gratuita en tu cuenta de Cloudflare que manda el aviso a la hora indicada. Solo recibe textos genéricos, nunca tus importes ni saldos. Guía de instalación en worker/README.md del repositorio.">
        <div className="card flex flex-col gap-3 p-4">
          <Field label="Dirección del servicio"><input className="field" inputMode="url" autoCapitalize="off" value={cfg.workerUrl} onChange={(e) => setCfg({ ...cfg, workerUrl: e.target.value })} placeholder="https://mi-patrimonio-avisos.tu-usuario.workers.dev" aria-label="Dirección del servicio" /></Field>
          <Field label="Código secreto" hint="El mismo que pusiste en Cloudflare (OWNER_TOKEN). Se guarda solo en este móvil y no entra en las copias."><input className="field" type="password" autoCapitalize="off" value={cfg.token} onChange={(e) => setCfg({ ...cfg, token: e.target.value })} aria-label="Código secreto" /></Field>
          {cfg.workerUrl && !urlOk && <p role="alert" className="text-footnote text-danger">La dirección debe empezar por https://</p>}
        </div>
      </Section>

      <Section title="Qué avisar">
        <Group>
          <label className="flex min-h-tap items-center justify-between px-4"><span>El día de tu plan de inversión{plan.active ? ` (día ${plan.day})` : ' (plan desactivado)'}</span>
            <input type="checkbox" role="switch" className="size-6" checked={cfg.planReminder} onChange={(e) => setCfg({ ...cfg, planReminder: e.target.checked })} aria-label="Avisar el día del plan" /></label>
          <label className="flex min-h-tap items-center justify-between px-4"><span>Copia de seguridad cada domingo</span>
            <input type="checkbox" role="switch" className="size-6" checked={cfg.backupReminder} onChange={(e) => setCfg({ ...cfg, backupReminder: e.target.checked })} aria-label="Avisar de la copia" /></label>
          <label className="flex min-h-tap items-center justify-between px-4"><span>Hora del aviso</span>
            <select className="bg-transparent text-text-muted outline-none" value={cfg.hour} onChange={(e) => setCfg({ ...cfg, hour: Number(e.target.value) })} aria-label="Hora del aviso">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select></label>
        </Group>
      </Section>

      {res && <p role={res.ok ? 'status' : 'alert'} className={`mb-3 text-footnote ${res.ok ? 'text-income' : 'text-danger'}`}>{res.ok ? res.message : res.error}</p>}
      <div className="flex flex-col gap-2">
        <button className="btn-primary" disabled={busy} onClick={() => run(async () => { await setSetting('alerts', cfg); return enableAlerts(cfg, plan); })}>{saved.enabled ? 'Guardar cambios' : 'Activar avisos'}</button>
        <button className="btn-secondary" disabled={busy || !saved.enabled} onClick={() => run(() => sendTest(saved))}>Enviar aviso de prueba</button>
        {saved.enabled && <button className="btn-secondary text-danger" disabled={busy} onClick={() => run(() => disableAlerts(saved))}>Desactivar avisos</button>}
      </div>
      <p className="mt-4 text-footnote text-text-muted">Los avisos de dentro de la app (presupuestos, aportaciones por confirmar, copia) funcionan siempre, sin servicio.</p>
    </>
  );
}
