import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useInit, usePendingBadge, useSetting, useTheme } from './lib/hooks';
import { isUnlocked, setUnlocked } from './lib/lock';
import Home from './pages/Home';
import Add from './pages/Add';
import Movements from './pages/Movements';
import Stats from './pages/Stats';
import Accounts, { AccountDetail } from './pages/Accounts';
import Investments from './pages/Investments';
import AssetNew from './pages/AssetNew';
import AssetDetail from './pages/AssetDetail';
import NetWorth from './pages/NetWorth';
import PlanPage from './pages/Plan';
import Settings from './pages/Settings';
import { AccountPage, Budgets, Categories, DataPage, Goals, Preferences, Prices, Privacy, RecurringList } from './pages/SettingsPages';
import Welcome from './pages/Welcome';
import Lock from './pages/Lock';

export default function App() {
  useInit();
  useTheme();
  usePendingBadge();
  const currency = useSetting<string | null>('currency', null);
  const pinHash = useSetting<string | null>('pinHash', null);
  const [unlocked, setU] = useState(isUnlocked());

  // Vuelve a pedir el PIN si la app estuvo más de un minuto en segundo plano.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) { setUnlocked(false); setU(false); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (currency === undefined || pinHash === undefined) return null;
  if (pinHash && !unlocked) return <Lock onUnlock={() => setU(true)} />;
  if (currency === null) return <Welcome />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="movements" element={<Movements />} />
        <Route path="stats" element={<Stats />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="investments" element={<Investments />} />
        <Route path="investments/new" element={<AssetNew />} />
        <Route path="investments/plan" element={<PlanPage />} />
        <Route path="investments/:id" element={<AssetDetail />} />
        <Route path="networth" element={<NetWorth />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/categories" element={<Categories />} />
        <Route path="settings/budgets" element={<Budgets />} />
        <Route path="settings/goals" element={<Goals />} />
        <Route path="settings/recurring" element={<RecurringList />} />
        <Route path="settings/prices" element={<Prices />} />
        <Route path="settings/data" element={<DataPage />} />
        <Route path="settings/preferences" element={<Preferences />} />
        <Route path="settings/privacy" element={<Privacy />} />
        <Route path="settings/account" element={<AccountPage />} />
      </Route>
      <Route path="add" element={<Add />} />
      <Route path="tx/:id" element={<Add />} />
      <Route path="rule/:ruleId" element={<Add />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
