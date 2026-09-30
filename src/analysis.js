export const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const LIMITATIONS = [
  'An address does not establish a person, employer, salary, location, or payment purpose.',
  'Only successful, positive-value, normal ETH transactions are analyzed. Token transfers, internal calls, fees, other chains, and zero-value interactions are excluded.',
  'One counterparty can represent many people. Several addresses can belong to one person. This report does not resolve ownership.',
  'The live report uses at most the latest 100 normal transactions, filtered to the selected period. It is not a complete wallet history.',
];
export const short = address => `${address.slice(0, 6)}...${address.slice(-4)}`;
export function eth(wei) {
  const n = BigInt(wei), whole = n / 10n ** 18n;
  const fraction = (n % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
const sum = rows => rows.reduce((n, row) => n + BigInt(row.wei), 0n);
const days = seconds => seconds / 86400;
export function analyze({ address, transactions, start, end, source, fetchedCount = transactions.length }) {
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
  const add = (id, title, body, evidence, method) => findings.push({ id, status: 'observed', title, body, evidence: evidence.map(t => t.id), method });
  const repeat = peers.find(g => g.rows.length >= 3);
  if (repeat) add('repeat', 'Repeated counterparty', `${repeat.rows.length} transfers connect this wallet and ${short(repeat.address)} in this window. This establishes an on-chain connection, not a personal relationship.`, repeat.rows, 'Group successful ETH transfers by counterparty address. Minimum: 3 transfers.');
  const outgoing = rows.filter(t => t.from.toLowerCase() === wallet);
  const largest = [...peers].sort((a, b) => sum(a.outgoing) > sum(b.outgoing) ? -1 : sum(a.outgoing) < sum(b.outgoing) ? 1 : 0)[0];
  if (largest && sum(outgoing) > 0n) {
    const percent = Number(sum(largest.outgoing) * 1000n / sum(outgoing)) / 10;
    add('concentration', 'Outgoing value concentration', `${percent}% of outgoing ETH value (${eth(sum(largest.outgoing))} ETH) went to ${short(largest.address)}. This share excludes fees and all token activity.`, outgoing, 'Sum exact integer wei by recipient; divide by total outgoing wei. Display percentage truncated to one decimal.');
  }
  if (rows.length >= 5) {
    const buckets = Array.from({ length: 8 }, (_, i) => ({ hour: i * 3, rows: rows.filter(t => Math.floor(new Date(t.timestamp * 1000).getUTCHours() / 3) === i) }));
    const peak = buckets.sort((a, b) => b.rows.length - a.rows.length)[0];
    add('timing', 'Transfer timing', `${peak.rows.length} of ${rows.length} transfers occurred between ${String(peak.hour).padStart(2, '0')}:00 and ${String(peak.hour + 3).padStart(2, '0')}:00 UTC. Automation and counterparties can determine these times; they do not establish your timezone.`, peak.rows, 'Count timestamps in eight fixed 3-hour UTC buckets; report the largest. No location inference.');
  }
  for (const group of peers) {
    for (const [direction, transfers] of [['outgoing', group.outgoing], ['incoming', group.incoming]]) {
      if (transfers.length < 3) continue;
      const gaps = transfers.slice(1).map((t, i) => days(t.timestamp - transfers[i].timestamp));
      const average = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const values = transfers.map(t => BigInt(t.wei));
      const min = values.reduce((a, b) => a < b ? a : b), max = values.reduce((a, b) => a > b ? a : b);
      if (average < 5 || gaps.some(g => Math.abs(g - average) > average * 0.2) || (max - min) * 100n > min * 5n) continue;
      const id = `cadence-${interpretations.length + 1}`;
      const evidence = transfers.map(t => t.id);
      const title = `Regular ${direction} transfers of a similar amount`;
      const body = `${transfers.length} ${direction} transfers involving ${short(group.address)}, ${eth(min)}-${eth(max)} ETH, about ${average.toFixed(1)} days apart. A scheduled payment or automated movement is possible. Purpose and ownership remain unknown.`;
      findings.push({ id, status: 'hypothesis', title, body, evidence, method: 'At least 3 transfers in one direction; each interval within 20% of its mean (at least 5 days); amount spread at most 5% of minimum. Pattern detection does not establish payment purpose.' });
      interpretations.push({ id: `recurring-${id}`, findingId: id, title, body, evidence });
    }
  }
  findings.push(...[
    ['identity', 'Owner identity', 'Not established. Public transfer data does not identify the person controlling an address.'],
    ['purpose', 'Payment purpose', 'Not established. Similar amounts and intervals do not identify salary, rent, purchases, or self-transfers.'],
    ['location', 'Owner location', 'Not established. UTC activity patterns are not reliable evidence of a person\'s location.'],
  ].map(([id, title, body]) => ({ id, title, body, status: 'unknown', evidence: [], method: 'No identity, purpose, or location evidence is collected.' })));
  return {
    address: wallet, source, start, end, fetchedCount, capReached: source === 'live' && fetchedCount >= 100,
    transactions: rows, findings, interpretations, limitations: LIMITATIONS,
    stats: { transfers: rows.length, counterparties: peers.length, incoming: eth(sum(rows.filter(t => t.to.toLowerCase() === wallet))), outgoing: eth(sum(outgoing)) },
    peers: peers.map(g => ({ address: g.address, count: g.rows.length, incoming: eth(sum(g.incoming)), outgoing: eth(sum(g.outgoing)), evidence: g.rows.map(t => t.id) })),
  };
}
