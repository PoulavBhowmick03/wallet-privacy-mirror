import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluationCases, scoreResult } from '../src/evaluation-cases.js';
import { runAI } from '../src/providers.js';
const snapshot = JSON.parse(await readFile(new URL('../data/lido-mainnet-snapshot.json', import.meta.url), 'utf8'));
test('recorded snapshot is real, internally consistent, and linked to an official source', () => {
  assert.equal(snapshot.source, 'live'); assert.equal(snapshot.transactions.length, 100);
  assert.ok(snapshot.transactions.every(t => !t.synthetic && /^0x[0-9a-f]{64}$/.test(t.id)));
  assert.equal(new Set(snapshot.transactions.map(t => t.id)).size, 100);
  assert.equal(snapshot.provenance.source, 'https://docs.lido.fi/deployed-contracts/');
  assert.ok(snapshot.transactions.every(t => t.to === snapshot.address));
});
test('predefined cases include negative patterns and a recorded chain case', () => {
  const cases = evaluationCases(snapshot);
  assert.equal(cases.length, 6); assert.equal(cases[0].report.interpretations.length, 1);
  assert.equal(cases[1].report.interpretations.length, 0);
  assert.deepEqual(cases[4].expectedPatterns, []); assert.equal(cases[5].report, snapshot);
});
test('evaluation records missed patterns and unexpected patterns, not just accepted count', () => {
  const item = evaluationCases(snapshot)[2];
  assert.equal(scoreResult(item, { accepted: [{ category: 'amount_reuse' }, { category: 'activity_burst' }], selections: [] }).passed, true);
  const missing = scoreResult(item, { accepted: [], selections: [] }); assert.equal(missing.passed, false); assert.equal(missing.missing.length, 2);
  const wrong = scoreResult(item, { accepted: [{ category: 'inbound_outbound_sequence' }], selections: [] }); assert.equal(wrong.unexpected.length, 1);
});
test('credit exhaustion is reported as billing failure, not a fabricated AI report', async () => {
  await assert.rejects(runAI(snapshot, 'mock', 'gpt-6.1-sol', async () => ({ ok: false, status: 429,
    json: async () => ({ error: { code: 'credit_balance_exhausted', type: 'insufficient_quota' } }) })), /Add API credits/);
});
