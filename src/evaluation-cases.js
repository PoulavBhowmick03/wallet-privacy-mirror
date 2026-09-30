import { analyze } from './analysis.js';

const address = `0x${'1'.repeat(40)}`, a = `0x${'2'.repeat(40)}`, b = `0x${'3'.repeat(40)}`;
const origin = Date.parse('2026-09-01T00:00:00Z') / 1000;
function transaction(id, from, to, amount, offset) {
  return { id: `eval-${id}`, from, to, wei: amount, timestamp: origin + offset, failed: false, synthetic: true };
}
function make(id, description, transactions, expectedPatterns, expectedRecurring) {
  const report = analyze({ address, transactions, start: origin, end: origin + 30 * 86400, source: 'sample' });
  return { id, description, expectedPatterns, expectedRecurring, report };
}
export function evaluationCases(snapshot) {
  const value = '100000000000000000';
  return [
    make('regular-series', 'Three equal outgoing amounts to one address at seven-day intervals.',
      [0, 7, 14].map((d, i) => transaction(`regular-${i}`, address, a, value, d * 86400)), [], true),
    make('irregular-series', 'Equal outgoing amounts with one-day and sixteen-day gaps. No recurring candidate.',
      [0, 1, 17].map((d, i) => transaction(`irregular-${i}`, address, a, value, d * 86400)), [], false),
    make('equal-amount-burst', 'Three equal amounts sent to two recipients within two hours.',
      [0, 1, 2].map((h, i) => transaction(`equal-${i}`, address, i === 1 ? b : a, value, h * 3600)), ['amount_reuse', 'activity_burst'], false),
    make('received-then-sent', 'An incoming transfer precedes an outgoing transfer by one hour.',
      [transaction('receive', a, address, value, 0), transaction('send', address, b, '50000000000000000', 3600)], ['inbound_outbound_sequence'], false),
    make('sent-then-received', 'The reversed order is not a received-then-sent sequence.',
      [transaction('first-send', address, b, value, 0), transaction('later-receive', a, address, value, 3600)], [], false),
    { id: 'lido-mainnet', description: 'Recorded public protocol receipts. Dense incoming transfers support activity bursts; no outgoing transfers exist in this snapshot.',
      expectedPatterns: ['activity_burst'], expectedRecurring: false, report: snapshot },
  ];
}

export function scoreResult(item, result) {
  const found = [...new Set(result.accepted.map(f => f.category))].sort();
  const expected = item.expectedPatterns;
  const missing = expected.filter(category => !found.includes(category));
  const unexpected = found.filter(category => !expected.includes(category));
  const recurringSelected = result.selections.length > 0;
  return { found, expected, missing, unexpected, recurringSelected, expectedRecurring: item.expectedRecurring,
    passed: !missing.length && !unexpected.length && recurringSelected === item.expectedRecurring };
}
