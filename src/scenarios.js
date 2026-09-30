import { analyze, ADDRESS, STABLECOINS } from './analysis.js';

// Counterfactuals re-run the same rules on the same fetched window after one change.
// They show which current findings a countermeasure would remove. They do not model the
// new patterns a countermeasure can create, which each caveat names instead.
export const POOL_STAND_IN = '0x00000000000000000000000000000000000000f1';
// Deterministic pseudo-random value in [0, 1) from a string, so renders are reproducible.
function seeded(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 100000) / 100000; }

export const SCENARIOS = [
  { id: 'stealth', label: 'Stealth addresses',
    description: 'Payers send each incoming transfer to a new one-time address (ERC-5564). None of those receipts land on this address.',
    caveat: 'Moving funds out of the one-time addresses can link them again, for example by paying their gas from this address.',
    transform: (rows, wallet) => rows.filter(t => t.from.toLowerCase() === wallet) },
  { id: 'pool', label: 'Privacy pool',
    description: 'Incoming transfers arrive as withdrawals from a shielded pool such as Railgun or Privacy Pools, so the payer is hidden.',
    caveat: `Amounts and timing stay public. This view shows the pool as ${POOL_STAND_IN.slice(0, 6)}...${POOL_STAND_IN.slice(-4)}, a stand-in address.`,
    transform: (rows, wallet) => rows.map(t => t.from.toLowerCase() === wallet ? t : { ...t, from: POOL_STAND_IN }) },
  { id: 'separate', label: 'Second account',
    description: 'Outgoing transfers to any address paid three or more times move to a separate account.',
    caveat: 'Funding that account from this one links the two accounts again.',
    transform: (rows, wallet) => {
      const counts = new Map();
      for (const t of rows) if (t.from.toLowerCase() === wallet) counts.set(t.to.toLowerCase(), (counts.get(t.to.toLowerCase()) || 0) + 1);
      return rows.filter(t => !(t.from.toLowerCase() === wallet && counts.get(t.to.toLowerCase()) >= 3));
    } },
  { id: 'timing', label: 'Random timing',
    description: 'Each transfer is delayed by a random 0 to 3 days and sent at a random hour.',
    caveat: 'Illustrative: uses a fixed random seed. Amounts and counterparties stay visible, and longer cycles can survive small delays.',
    extendEnd: 4 * 86400,
    transform: rows => rows.map(t => {
      const day = Math.floor(t.timestamp / 86400) * 86400;
      return { ...t, timestamp: day + Math.floor(seeded(`${t.id}:d`) * 4) * 86400 + Math.floor(seeded(`${t.id}:h`) * 24) * 3600 + (t.timestamp % 3600) };
    }) },
];

// Compares two analyses of the same window by finding key. Unknown-tier findings never change.
export function diffFindings(before, after) {
  const current = before.findings.filter(f => f.status !== 'unknown'), next = after.findings.filter(f => f.status !== 'unknown');
  const byKey = new Map(next.map(f => [f.key, f]));
  const rows = current.map(f => {
    const g = byKey.get(f.key);
    if (!g) return { key: f.key, status: 'removed', finding: f.status, title: f.title, before: f.body };
    if (g.body !== f.body || g.evidence.length !== f.evidence.length) return { key: f.key, status: 'changed', finding: f.status, title: g.title, before: f.body, after: g.body };
    return { key: f.key, status: 'kept', finding: f.status, title: f.title, before: f.body };
  });
  for (const g of next) if (!current.some(f => f.key === g.key)) rows.push({ key: g.key, status: 'added', finding: g.status, title: g.title, after: g.body });
  const count = s => rows.filter(r => r.status === s).length;
  return { rows, removed: count('removed'), changed: count('changed'), kept: count('kept'), added: count('added') };
}

const rerun = (report, transactions, end = report.end) =>
  analyze({ address: report.address, transactions, start: report.start, end, source: report.source });

export function whatIf(report) {
  return SCENARIOS.map(({ transform, extendEnd = 0, ...s }) => ({ ...s, ...diffFindings(report, rerun(report, transform(report.transactions, report.address), report.end + extendEnd)) }));
}

// Adds one planned outgoing transfer to the analyzed window and reports what it would change.
export function plannedTransfer(report, { to, amount, asset = 'ETH', when }) {
  if (!ADDRESS.test(to || '')) throw new Error('Enter the recipient as a 0x address with 40 hexadecimal characters.');
  if (to.toLowerCase() === report.address) throw new Error('A transfer to the same address is a self-transfer. The report excludes those.');
  const coin = asset === 'ETH' ? { symbol: 'ETH', decimals: 18 } : Object.values(STABLECOINS).find(c => c.symbol === asset);
  if (!coin) throw new Error('Choose ETH, USDC, USDT, or DAI.');
  if (!/^\d+(\.\d+)?$/.test(String(amount || '')) || String(amount).split('.')[1]?.length > coin.decimals) throw new Error(`Enter a positive ${coin.symbol} amount with at most ${coin.decimals} decimals.`);
  const [whole, fraction = ''] = String(amount).split('.');
  const value = BigInt(whole) * 10n ** BigInt(coin.decimals) + BigInt(fraction.padEnd(coin.decimals, '0') || '0');
  if (value <= 0n) throw new Error('Enter an amount above zero.');
  const timestamp = Math.floor(Date.parse(when) / 1000);
  if (!Number.isFinite(timestamp) || timestamp < report.start || timestamp > report.end + 365 * 86400) throw new Error('Choose a time inside the report window or within a year after it.');
  const planned = { id: 'planned-transfer', from: report.address, to: to.toLowerCase(), wei: String(value), timestamp, failed: false, synthetic: true, planned: true,
    ...(coin.symbol === 'ETH' ? {} : { asset: coin.symbol, decimals: coin.decimals }) };
  const diff = diffFindings(report, rerun(report, [...report.transactions, planned], Math.max(report.end, timestamp)));
  return { planned: { to: planned.to, amount: String(amount), asset: coin.symbol, timestamp }, ...diff };
}
