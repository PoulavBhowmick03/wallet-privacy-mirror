export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// Ethereum mainnet stablecoins analyzed next to ETH. Other tokens stay out of scope.
export const STABLECOINS = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6 },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { symbol: 'DAI', decimals: 18 },
};
export const LIMITATIONS = [
  'An address does not establish a person, employer, salary, location, or payment purpose.',
  'Only successful, positive-value, normal ETH transactions and USDC, USDT, and DAI transfers are analyzed. Other tokens, internal calls, fees, other chains, and zero-value interactions are excluded.',
  'One counterparty can represent many people. Several addresses can belong to one person. This report does not resolve ownership.',
  'The live report uses at most the latest 100 normal transactions and the latest 100 token transfers, filtered to the selected period. It is not a complete wallet history.',
];
export const short = address => `${address.slice(0, 6)}...${address.slice(-4)}`;
// Formats an integer amount in base units. `wei` holds base units for every asset, not only ETH.
export function units(value, decimals = 18) {
  const n = BigInt(value), scale = 10n ** BigInt(decimals), whole = n / scale;
  const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
export const eth = wei => units(wei, 18);
export const assetOf = t => t.asset || 'ETH';
export const amountText = t => `${units(t.wei, t.decimals ?? 18)} ${assetOf(t)}`;
const isEth = t => assetOf(t) === 'ETH';
const sum = rows => rows.reduce((n, row) => n + BigInt(row.wei), 0n);
const days = seconds => seconds / 86400;
// Groups transfers whose amounts stay within 5% of the group's smallest amount, in time order.
function amountClusters(transfers) {
  const clusters = [];
  for (const t of [...transfers].sort((a, b) => BigInt(a.wei) < BigInt(b.wei) ? -1 : BigInt(a.wei) > BigInt(b.wei) ? 1 : 0)) {
    const last = clusters.at(-1), v = BigInt(t.wei);
    if (last && (v - BigInt(last[0].wei)) * 100n <= BigInt(last[0].wei) * 5n) last.push(t); else clusters.push([t]);
  }
  return clusters.map(c => c.sort((a, b) => a.timestamp - b.timestamp));
}
export function analyze({ address, transactions, start, end, source, fetchedCount = transactions.filter(isEth).length, tokenFetchedCount = null }) {
  if (!ADDRESS.test(address)) throw new Error('Enter a 0x Ethereum address with 40 hexadecimal characters.');
  const wallet = address.toLowerCase();
  const rows = transactions.filter(t => !t.failed && BigInt(t.wei) > 0n && t.timestamp >= start && t.timestamp <= end
    && ADDRESS.test(t.from) && ADDRESS.test(t.to) && t.from.toLowerCase() !== t.to.toLowerCase()
    && (t.from.toLowerCase() === wallet || t.to.toLowerCase() === wallet)).sort((a, b) => a.timestamp - b.timestamp);
  const groups = new Map();
  for (const row of rows) {
    const direction = row.from.toLowerCase() === wallet ? 'out' : 'in';
    const peer = (direction === 'out' ? row.to : row.from).toLowerCase();
    if (!groups.has(peer)) groups.set(peer, { address: peer, rows: [], incoming: [], outgoing: [] });
    const group = groups.get(peer); group.rows.push(row); group[direction === 'out' ? 'outgoing' : 'incoming'].push(row);
  }
  const peers = [...groups.values()].sort((a, b) => b.rows.length - a.rows.length || a.address.localeCompare(b.address));
  const findings = [], interpretations = [];
  // `key` identifies a finding across re-analyses (what-if scenarios, planned transfers).
  const add = (id, key, title, body, evidence, method) => findings.push({ id, key, status: 'observed', title, body, evidence: evidence.map(t => t.id), method });
  const repeat = peers.find(g => g.rows.length >= 3);
  if (repeat) add('repeat', 'repeat', 'Repeated counterparty', `${repeat.rows.length} transfers connect this wallet and ${short(repeat.address)} in this window. This establishes an on-chain connection, not a personal relationship.`, repeat.rows, 'Group successful ETH and stablecoin transfers by counterparty address. Minimum: 3 transfers.');
  const outgoing = rows.filter(t => t.from.toLowerCase() === wallet && isEth(t));
  const ethOut = g => sum(g.outgoing.filter(isEth));
  const largest = [...peers].sort((a, b) => ethOut(a) > ethOut(b) ? -1 : ethOut(a) < ethOut(b) ? 1 : 0)[0];
  if (largest && sum(outgoing) > 0n) {
    const percent = Number(ethOut(largest) * 1000n / sum(outgoing)) / 10;
    add('concentration', 'concentration', 'Outgoing value concentration', `${percent}% of outgoing ETH value (${eth(ethOut(largest))} ETH) went to ${short(largest.address)}. This share excludes fees and all token activity.`, outgoing, 'Sum exact integer wei by recipient; divide by total outgoing wei. Display percentage truncated to one decimal.');
  }
  if (rows.length >= 5) {
    const buckets = Array.from({ length: 8 }, (_, i) => ({ hour: i * 3, rows: rows.filter(t => Math.floor(new Date(t.timestamp * 1000).getUTCHours() / 3) === i) }));
    const peak = buckets.sort((a, b) => b.rows.length - a.rows.length)[0];
    add('timing', 'timing', 'Transfer timing', `${peak.rows.length} of ${rows.length} transfers occurred between ${String(peak.hour).padStart(2, '0')}:00 and ${String(peak.hour + 3).padStart(2, '0')}:00 UTC. Automation and counterparties can determine these times; they do not establish your timezone.`, peak.rows, 'Count timestamps in eight fixed 3-hour UTC buckets; report the largest. No location inference.');
  }
  for (const group of peers) {
    for (const [direction, list] of [['outgoing', group.outgoing], ['incoming', group.incoming]]) {
      for (const asset of [...new Set(list.map(assetOf))]) {
       // Cluster by amount first: one counterparty can send a fixed monthly amount plus unrelated transfers.
       for (const transfers of amountClusters(list.filter(t => assetOf(t) === asset))) {
        if (transfers.length < 3) continue;
        const gaps = transfers.slice(1).map((t, i) => days(t.timestamp - transfers[i].timestamp));
        const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const values = transfers.map(t => BigInt(t.wei));
        const min = values.reduce((a, b) => a < b ? a : b), max = values.reduce((a, b) => a > b ? a : b);
        if (average < 5 || gaps.some(g => Math.abs(g - average) > average * 0.2) || (max - min) * 100n > min * 5n) continue;
        const id = `cadence-${interpretations.length + 1}`;
        const evidence = transfers.map(t => t.id), decimals = transfers[0].decimals ?? 18;
        const title = `Regular ${direction} ${asset} transfers of a similar amount`;
        const body = `${transfers.length} ${direction} transfers involving ${short(group.address)}, ${units(min, decimals)}-${units(max, decimals)} ${asset}, about ${average.toFixed(1)} days apart. A scheduled payment or automated movement is possible. Purpose and ownership remain unknown.`;
        let key = `recurring:${direction}:${asset}:${min}`;
        while (findings.some(f => f.key === key)) key += '+';
        findings.push({ id, key, status: 'hypothesis', title, body, evidence, method: 'At least 3 transfers of one asset in one direction; each interval within 20% of its mean (at least 5 days); amount spread at most 5% of minimum. Pattern detection does not establish payment purpose.' });
        interpretations.push({ id: `recurring-${id}`, findingId: id, title, body, evidence });
       }
      }
    }
  }
  findings.push(...[
    ['identity', 'Owner identity', 'Not established. Public transfer data does not identify the person controlling an address.'],
    ['purpose', 'Payment purpose', 'Not established. Similar amounts and intervals do not identify salary, rent, purchases, or self-transfers.'],
    ['location', 'Owner location', 'Not established. UTC activity patterns are not reliable evidence of a person\'s location.'],
  ].map(([id, title, body]) => ({ id, key: `unknown:${id}`, title, body, status: 'unknown', evidence: [], method: 'No identity, purpose, or location evidence is collected.' })));
  const tokens = rows.filter(t => !isEth(t));
  const tokenTotals = {};
  for (const t of tokens) {
    const entry = tokenTotals[assetOf(t)] ??= { decimals: t.decimals ?? 18, count: 0, incoming: 0n, outgoing: 0n };
    entry.count++; entry[t.from.toLowerCase() === wallet ? 'outgoing' : 'incoming'] += BigInt(t.wei);
  }
  return {
    address: wallet, source, start, end, fetchedCount, capReached: source === 'live' && fetchedCount >= 100,
    tokenCapReached: source === 'live' && tokenFetchedCount != null && tokenFetchedCount >= 100,
    transactions: rows, findings, interpretations, limitations: LIMITATIONS,
    stats: { transfers: rows.length, counterparties: peers.length, incoming: eth(sum(rows.filter(t => t.to.toLowerCase() === wallet && isEth(t)))), outgoing: eth(sum(outgoing)),
      ethTransfers: rows.length - tokens.length, tokenTransfers: tokens.length,
      tokens: Object.fromEntries(Object.entries(tokenTotals).map(([k, v]) => [k, { count: v.count, incoming: units(v.incoming, v.decimals), outgoing: units(v.outgoing, v.decimals) }])) },
    coverage: { eth: { fetched: fetchedCount, analyzed: rows.length - tokens.length, cap: 100 },
      stablecoins: { fetched: tokenFetchedCount, analyzed: tokens.length, cap: 100, assets: Object.values(STABLECOINS).map(s => s.symbol) } },
    peers: peers.map(g => ({ address: g.address, count: g.rows.length, incoming: eth(sum(g.incoming.filter(isEth))), outgoing: eth(sum(g.outgoing.filter(isEth))), tokenTransfers: g.rows.filter(t => !isEth(t)).length, evidence: g.rows.map(t => t.id) })),
  };
}
