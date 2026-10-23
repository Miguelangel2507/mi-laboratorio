import type { Account, Asset, Quote, Trade, Transaction } from './db';
import { accountBalance } from './domain';
import { convertCents, type Rates } from './fx';
import { assetView, signedValue, type AssetView } from './invest';

export interface NetWorthResult { cents: number; accountsCents: number; assetsCents: number; excluded: number; views: AssetView[] }

export function computeNetWorth(
  d: { accounts: Account[]; txs: Transaction[]; assets: Asset[]; trades: Trade[]; quotes: Quote[] },
  main: string, rates?: Rates,
): NetWorthResult {
  const qmap = new Map(d.quotes.map((q) => [q.key, q]));
  let accountsCents = 0, assetsCents = 0, excluded = 0;
  for (const a of d.accounts) {
    if (a.archived) continue;
    const c = convertCents(accountBalance(a, d.txs), a.currency, main, rates);
    if (c === null) excluded++; else accountsCents += c;
  }
  const views = d.assets.map((a) => assetView(a, d.trades, qmap));
  for (const v of views) {
    const c = convertCents(signedValue(v), v.asset.currency, main, rates);
    if (c === null) excluded++; else assetsCents += c;
  }
  return { cents: accountsCents + assetsCents, accountsCents, assetsCents, excluded, views };
}
