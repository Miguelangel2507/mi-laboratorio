import type { Asset, Quote, Trade } from './db';

export interface Holding { quantity: number; costCents: number; realizedCents: number }

const unitsToCents = (qty: number, priceE5: number) => Math.round((qty * priceE5) / 1000);

/** Precio medio ponderado: las ventas reducen el coste en proporción y generan ganancia realizada. */
export function holding(trades: Trade[]): Holding {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));
  let quantity = 0, costCents = 0, realizedCents = 0;
  for (const t of sorted) {
    if (t.side === 'buy') {
      quantity += t.quantity;
      costCents += unitsToCents(t.quantity, t.priceE5);
    } else if (quantity > 0) {
      const q = Math.min(t.quantity, quantity);
      const removed = Math.round(costCents * (q / quantity));
      realizedCents += unitsToCents(q, t.priceE5) - removed;
      costCents -= removed;
      quantity -= q;
    }
    quantity = Math.round(quantity * 1e6) / 1e6;
    if (quantity <= 0) { quantity = 0; costCents = 0; }
  }
  return { quantity, costCents, realizedCents };
}

export const avgPriceE5 = (h: Holding) => (h.quantity > 0 ? Math.round((h.costCents * 1000) / h.quantity) : 0);

export interface AssetView {
  asset: Asset; quantity: number; costCents: number; valueCents: number; pnlCents: number; pnlPct: number | null;
  realizedCents: number; priceE5: number | null; priceDate: string | null; noPrice: boolean;
}

export function assetView(asset: Asset, trades: Trade[], quotes: Map<string, Quote>): AssetView {
  if (asset.type === 'other' || asset.type === 'debt') {
    const v = asset.valueCents ?? 0;
    return { asset, quantity: 1, costCents: v, valueCents: v, pnlCents: 0, pnlPct: null, realizedCents: 0, priceE5: null, priceDate: null, noPrice: false };
  }
  const h = holding(trades.filter((t) => t.assetId === asset.id));
  const q = quotes.get(asset.key);
  const priceE5 = q?.priceE5 ?? asset.manualPriceE5 ?? null;
  const noPrice = priceE5 === null;
  const valueCents = noPrice ? h.costCents : unitsToCents(h.quantity, priceE5);
  const pnlCents = valueCents - h.costCents;
  return {
    asset, quantity: h.quantity, costCents: h.costCents, valueCents, pnlCents,
    pnlPct: h.costCents > 0 && !noPrice ? pnlCents / h.costCents : null,
    realizedCents: h.realizedCents, priceE5, priceDate: q?.priceE5 != null ? q.priceDate : null, noPrice,
  };
}

/** Valor con signo para el patrimonio: las deudas restan. */
export const signedValue = (v: AssetView) => (v.asset.type === 'debt' ? -v.valueCents : v.valueCents);

export const TYPE_LABEL: Record<Asset['type'], string> = {
  fund: 'Fondo', stock: 'Acción', etf: 'ETF', crypto: 'Cripto', other: 'Bien', debt: 'Deuda',
};
