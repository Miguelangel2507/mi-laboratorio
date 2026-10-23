import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { db } from '../lib/db';
import { useMoney } from '../lib/hooks';
import { BackHeader, Skeleton } from '../components/ui';
import { EmptyState } from '../components/Layout';
import { TxList } from './Home';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export default function Movements() {
  const money = useMoney();
  const txs = useLiveQuery(() => db.transactions.toArray(), []);
  const cats = useLiveQuery(() => db.categories.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);

  const list = useMemo(() => {
    if (!txs || !cats || !accounts) return [];
    const nq = norm(q.trim());
    const name = (id: number | null) => cats.find((c) => c.id === id)?.name ?? '';
    return [...txs]
      .filter((t) => !nq || norm(`${t.note} ${name(t.categoryId)} ${accounts.find((a) => a.id === t.accountId)?.name ?? ''} ${t.date} ${(t.amountCents / 100).toFixed(2)}`).includes(nq))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.id ?? 0) - (a.id ?? 0));
  }, [txs, cats, accounts, q]);

  if (!txs || !cats) return <Skeleton h="h-40" />;
  return (
    <>
      <BackHeader title="Movimientos" to="/" />
      <label className="field mb-4 flex items-center gap-2">
        <Search size={18} className="text-text-muted" />
        <input aria-label="Buscar" type="search" className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Buscar por nota, categoría, cuenta o importe" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {list.length === 0 ? (
        <EmptyState title={q ? 'Sin resultados' : 'Aún no hay movimientos'} text={q ? 'Prueba con otra palabra.' : 'Pulsa + para apuntar el primero.'} />
      ) : (
        <>
          <p className="mb-2 text-footnote text-text-muted">{list.length} {list.length === 1 ? 'movimiento' : 'movimientos'}</p>
          <TxList txs={list.slice(0, limit)} catName={(id) => cats.find((c) => c.id === id)?.name ?? 'Sin categoría'} money={money} />
          {list.length > limit && <button className="btn-secondary mt-3 w-full" onClick={() => setLimit(limit + 100)}>Ver más</button>}
        </>
      )}
    </>
  );
}
