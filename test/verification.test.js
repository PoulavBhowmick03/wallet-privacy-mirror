import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis.js';
import { verifyProposals } from '../src/verification.js';
import { runAI } from '../src/providers.js';
const wallet = `0x${'1'.repeat(40)}`, a = `0x${'2'.repeat(40)}`, b = `0x${'3'.repeat(40)}`;
const tx = (id, from, to, wei, timestamp) => ({ id, from, to, wei, timestamp, failed: false, synthetic: true });
const rows = [tx('a', a, wallet, '1000000000000000000', 1000), tx('b', wallet, a, '100000000000000000', 1600),
  tx('c', wallet, b, '100000000000000000', 2200), tx('d', wallet, b, '200000000000000000', 90000)];
const report = analyze({ address: wallet, transactions: rows, start: 0, end: 100000, source: 'sample' });
const proposal = (category, evidence) => ({ category, evidence });
test('new typed amount pattern survives exact-value and direction checks', () => {
  const r = verifyProposals([proposal('amount_reuse', ['b', 'c'])], report);
  assert.equal(r.accepted.length, 1); assert.equal(r.rejected.length, 0);
  assert.match(r.accepted[0].body, /exactly 0\.1 ETH/); assert.match(r.accepted[0].body, /2 distinct recipients/);
  assert.match(r.accepted[0].body, /do not establish/);
});
test('same amount must be outgoing to distinct recipients', () => {
  for (const evidence of [['a', 'b'], ['b', 'd'], ['c', 'd']]) assert.equal(verifyProposals([proposal('amount_reuse', evidence)], report).accepted.length, 0);
});
test('one wei difference cannot pass equal-value check', () => {
  const changed = { ...report, transactions: report.transactions.map(t => t.id === 'c' ? { ...t, wei: '100000000000000001' } : t) };
  assert.equal(verifyProposals([proposal('amount_reuse', ['b', 'c'])], changed).rejected.length, 1);
});
test('burst checks full span, not adjacent gaps', () => {
  assert.equal(verifyProposals([proposal('activity_burst', ['c', 'a', 'b'])], report).accepted.length, 1);
  assert.equal(verifyProposals([proposal('activity_burst', ['b', 'c', 'd'])], report).accepted.length, 0);
  assert.equal(verifyProposals([proposal('activity_burst', ['a', 'b'])], report).accepted.length, 0);
});
test('received-then-sent check does not claim forwarding or related funds', () => {
  const f = verifyProposals([proposal('inbound_outbound_sequence', ['b', 'a'])], report).accepted[0];
  assert.ok(f); assert.match(f.body, /does not show that the same funds moved onward/);
  for (const ids of [['b', 'c'], ['a', 'd'], ['a', 'b', 'c']]) assert.equal(verifyProposals([proposal('inbound_outbound_sequence', ids)], report).rejected.length, 1);
  const simultaneous = { ...report, transactions: report.transactions.map(t => t.id === 'b' ? { ...t, timestamp: 1000 } : t) };
  assert.equal(verifyProposals([proposal('inbound_outbound_sequence', ['a', 'b'])], simultaneous).rejected.length, 1);
});
test('unknown, duplicate, and fabricated citations are rejected', () => {
  const r = verifyProposals([proposal('amount_reuse', ['b', 'missing']), proposal('activity_burst', ['a', 'a', 'b']),
    proposal('salary', ['a', 'b']), { ...proposal('amount_reuse', ['b', 'c']), claim: 'same owner' }, null], report);
  assert.equal(r.accepted.length, 0); assert.equal(r.rejected.length, 5);
  assert.ok(r.rejected.every(r => r.evidence.every(id => rows.some(t => t.id === id))));
});
test('duplicate and overlapping patterns cannot inflate accepted count', () => {
  const r = verifyProposals([proposal('amount_reuse', ['b', 'c']), proposal('amount_reuse', ['c', 'b']),
    proposal('activity_burst', ['a', 'b', 'c']), proposal('activity_burst', ['c', 'b', 'a'])], report);
  assert.equal(r.accepted.length, 2); assert.equal(r.rejected.length, 2);
});
test('amount verifier expands evidence to all equal-value outgoing records', () => {
  const extended = { ...report, transactions: [...report.transactions, tx('e', wallet, b, '100000000000000000', 91000)] };
  assert.deepEqual(verifyProposals([proposal('amount_reuse', ['b', 'c'])], extended).accepted[0].evidence, ['b', 'c', 'e']);
});
test('bounded proposals and empty results are handled explicitly', () => {
  assert.throws(() => verifyProposals(Array(6).fill(proposal('amount_reuse', ['b', 'c'])), report), /invalid proposal/);
  assert.deepEqual(verifyProposals([], report), { accepted: [], rejected: [], proposed: 0 });
});
test('AI can propose checked patterns without any baseline recurring hypothesis', async () => {
  assert.equal(report.interpretations.length, 0);
  const result = await runAI(report, 'mock', 'gpt-6.1-sol', async (url, options) => {
    const payload = JSON.parse(options.body);
    assert.ok(payload.text.format.schema.properties.proposals); assert.equal(payload.model, 'gpt-6.1-sol');
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ selections: [],
      proposals: [proposal('amount_reuse', ['b', 'c']), proposal('activity_burst', ['b', 'c', 'd'])] }) }] }] }) };
  });
  assert.equal(result.newFindings, 1); assert.equal(result.proposed, 2); assert.equal(result.rejected.length, 1);
  assert.match(result.note, /not impossible to find with code/);
});
test('insufficient records do not incur an AI call', async () => {
  await assert.rejects(runAI({ ...report, transactions: [] }, 'mock', 'gpt-6.1-sol', () => { throw new Error('must not call'); }), /No AI request was sent/);
});
