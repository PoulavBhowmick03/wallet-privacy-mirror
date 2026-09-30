import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineBuckets, reportOverview } from '../public/report-view.js';
import { analyze } from '../src/analysis.js';
import { sampleTransactions, SAMPLE_ADDRESS } from '../src/sample.js';
const report = analyze({ address: SAMPLE_ADDRESS, transactions: sampleTransactions(), start: 0, end: Infinity, source: 'sample' });
test('timeline accounts for every transfer exactly once and retains direction', () => {
  const buckets = timelineBuckets(report);
  const ids = buckets.flatMap(b => b.evidence);
  assert.equal(ids.length, report.transactions.length); assert.equal(new Set(ids).size, ids.length);
  assert.equal(buckets.reduce((n, b) => n + b.incoming, 0), 4);
  assert.equal(buckets.reduce((n, b) => n + b.outgoing, 0), 20);
  assert.ok(buckets.length <= 14);
});
test('timeline contains empty days and records around UTC midnight separately', () => {
  const rows = [{ ...report.transactions[0], timestamp: 86399 }, { ...report.transactions[1], timestamp: 86400 }, { ...report.transactions[2], timestamp: 3 * 86400 }];
  const buckets = timelineBuckets({ ...report, transactions: rows });
  assert.deepEqual(buckets.map(b => b.evidence.length), [1, 1, 0, 1]);
});
test('overview reports observed coverage, not the selected query span', () => {
  const rows = [{ ...report.transactions[0], timestamp: 86400 }, { ...report.transactions[1], timestamp: 2 * 86400 }];
  assert.equal(reportOverview({ ...report, transactions: rows }).observedDays, 2);
  const empty = reportOverview({ ...report, transactions: [], peers: [] });
  assert.equal(empty.observedDays, 0); assert.equal(empty.first, null);
  assert.match(empty.body, /does not mean the address has no other activity/);
});
