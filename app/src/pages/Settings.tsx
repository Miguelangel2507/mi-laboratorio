import { Link } from 'react-router-dom';
import { Tag, Target, PiggyBank, Repeat, Database, SlidersHorizontal, LineChart, Lock, UserX } from 'lucide-react';
import { useSetting } from '../lib/hooks';
import { BackHeader, Group, Row, Section } from '../components/ui';

const I = (c: React.ReactNode) => <span className="mr-3 inline-flex text-accent">{c}</span>;

export default function Settings() {
  const last = useSetting<string | null>('lastBackup', null);
  return (
    <>
      <BackHeader title="Ajustes" to="/" />
      <Section title="Finanzas">
        <Group>
          <Row to="/settings/categories">{I(<Tag size={20} />)}Categorías</Row>
          <Row to="/settings/budgets">{I(<Target size={20} />)}Presupuestos</Row>
          <Row to="/settings/goals">{I(<PiggyBank size={20} />)}Metas de ahorro</Row>
          <Row to="/settings/recurring">{I(<Repeat size={20} />)}Movimientos recurrentes</Row>
          <Row to="/settings/prices">{I(<LineChart size={20} />)}Precios de fondos</Row>
        </Group>
      </Section>
      <Section title="Datos" hint={last ? `Última copia: ${new Date(last).toLocaleDateString('es-ES')}` : 'Todavía no has hecho ninguna copia.'}>
        <Group><Row to="/settings/data">{I(<Database size={20} />)}Copia, exportar e importar</Row></Group>
      </Section>
      <Section title="App">
        <Group>
          <Row to="/settings/preferences">{I(<SlidersHorizontal size={20} />)}Preferencias</Row>
          <Row to="/settings/privacy">{I(<Lock size={20} />)}Privacidad y bloqueo</Row>
          <Row to="/settings/account">{I(<UserX size={20} />)}Borrar datos</Row>
        </Group>
      </Section>
      <p className="text-center text-caption text-text-muted">Tus datos se guardan solo en este dispositivo. <Link to="/settings/data" className="text-accent">Haz copias</Link>.</p>
    </>
  );
}
