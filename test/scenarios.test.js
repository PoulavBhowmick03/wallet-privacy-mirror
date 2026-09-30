import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis.js';
import { SAMPLE_ADDRESS as address, sampleTransactions } from '../src/sample.js';
import { whatIf, plannedTransfer, POOL_STAND_IN } from '../src/scenarios.js';
const end = Date.parse('2026-09-30T23:59:59Z') / 1000, start = end - 90 * 86400;
const report = analyze({ address, transactions: sampleTransactions(), start, end, source: 'sample' });
const scenario = id => whatIf(report).find(s => s.id === id);
const INCOMING = 'recurring:incoming:ETH:1200000000000000000';

test('stealth receiving removes incoming series and nothing outgoing', () => {
  const s = scenario('stealth');
  assert.equal(s.rows.find(r => r.key === INCOMING).status, 'removed');
  assert.ok(s.rows.filter(r => r.key.startsWith('recurring:outgoing')).every(r => r.status === 'kept'));
});
test('a privacy pool hides the payer but not the amount and rhythm', () => {
  const row = scenario('pool').rows.find(r => r.key === INCOMING);
  assert.equal(row.status, 'changed'); assert.match(row.after, new RegExp(POOL_STAND_IN.slice(-4))); assert.match(row.after, /31\.0 days/);
});
test('randomized timing is reproducible', () => { assert.deepEqual(scenario('timing'), whatIf(report).find(s => s.id === 'timing')); });
test('a planned transfer to a regular recipient strengthens that series', () => {
  const p = plannedTransfer(report, { to: `0x${'3'.repeat(40)}`, amount: '0.08', when: '2026-09-28T10:00:00Z' });
  const row = p.rows.find(r => r.key === 'recurring:outgoing:ETH:80000000000000000');
  assert.equal(row.status, 'changed'); assert.match(row.after, /^13 outgoing/);
});
test('planned transfers reject self-transfers, bad amounts, and bad assets', () => {
  assert.throws(() => plannedTransfer(report, { to: address, amount: '1', when: '2026-09-28T10:00:00Z' }), /self-transfer/);
  assert.throws(() => plannedTransfer(report, { to: `0x${'3'.repeat(40)}`, amount: '0.1234567', asset: 'USDC', when: '2026-09-28T10:00:00Z' }), /at most 6 decimals/);
  assert.throws(() => plannedTransfer(report, { to: `0x${'3'.repeat(40)}`, amount: '1', asset: 'SHIB', when: '2026-09-28T10:00:00Z' }), /Choose ETH/);
});
