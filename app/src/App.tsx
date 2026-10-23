import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useInit, useSetting, useTheme } from './lib/hooks';
import Home from './pages/Home';
import Add from './pages/Add';
import Accounts from './pages/Accounts';
import Investments from './pages/Investments';
import Settings from './pages/Settings';
import Welcome from './pages/Welcome';
import { EmptyState, LargeTitle } from './components/Layout';

function Stats() {
  return (
    <>
      <LargeTitle>Estadísticas</LargeTitle>
      <EmptyState title="Próximamente" text="Aquí verás tus ingresos y gastos por periodo." />
    </>
  );
}

export default function App() {
  useInit();
  useTheme();
  const currency = useSetting<string | null>('currency', null);
  if (currency === undefined) return null; // cargando ajustes
  if (currency === null) return <Welcome />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="stats" element={<Stats />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="investments" element={<Investments />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="add" element={<Add />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
