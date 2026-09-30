export function timelineBuckets(report) {
  if (!report.transactions.length) return [];
  const timestamps = report.transactions.map(t => t.timestamp);
  const firstDay = Math.floor(Math.min(...timestamps) / 86400) * 86400;
  const lastDay = Math.floor(Math.max(...timestamps) / 86400) * 86400;
  const step = lastDay - firstDay > 14 * 86400 ? 7 * 86400 : 86400;
  const buckets = [];
  for (let start = firstDay; start <= lastDay; start += step) {
    const rows = report.transactions.filter(t => t.timestamp >= start && t.timestamp < start + step);
    const incoming = rows.filter(t => t.to.toLowerCase() === report.address);
    buckets.push({ start, end: Math.min(start + step - 1, lastDay + 86399),
      incoming: incoming.length, outgoing: rows.length - incoming.length, evidence: rows.map(t => t.id) });
  }
  return buckets;
}

export function reportOverview(report) {
  const top = report.peers[0];
  const timestamps = report.transactions.map(t => t.timestamp);
  const first = timestamps.length ? Math.min(...timestamps) : null;
  const last = timestamps.length ? Math.max(...timestamps) : null;
  const observedDays = first == null ? 0 : Math.floor(last / 86400) - Math.floor(first / 86400) + 1;
  const recurring = report.findings.filter(f => f.status === 'hypothesis').length;
  const title = !top ? 'No transfer pattern in this window.'
    : report.source === 'recorded' ? `${report.stats.transfers} public receipts. ${report.stats.counterparties} connected addresses.`
    : `${top.count} transfers connect the same two addresses.`;
  const body = !top ? 'No successful, positive-value ETH transfers meet this report\'s boundaries. That does not mean the address has no other activity.'
    : report.source === 'recorded' ? 'This protocol contract makes its incoming ETH activity visible. Its published identity comes from Lido documentation, not from transaction patterns or AI.'
    : 'An observer can see the connection, amounts, and timing. The transactions alone do not explain who controls either address or what the payments were for.';
  return { title, body, first, last, observedDays, recurring, top };
}
