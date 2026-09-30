import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, eth } from '../src/analysis.js';
import { SAMPLE_ADDRESS as address, sampleTransactions } from '../src/sample.js';
import { fetchTransactions, fetchTokenTransfers, validateSelections, runAI, RETRY_MS } from '../src/providers.js';
const start = Date.parse('2026-07-01T00:00:00Z') / 1000, end = Date.parse('2026-09-30T23:59:59Z') / 1000;
const report = (transactions = sampleTransactions()) => analyze({ address, transactions, start, end, source: 'sample' });
test('sample findings cite fixture evidence only, with exact ETH sums', () => {
  const r = report();
  assert.equal(r.stats.transfers, 27); assert.equal(r.stats.counterparties, 7);
  assert.equal(r.stats.incoming, '3.66'); assert.equal(r.stats.outgoing, '2.651');
  assert.equal(r.interpretations.length, 4);
  assert.ok(r.findings.filter(f => f.status !== 'unknown').every(f => f.evidence.every(id => r.transactions.some(t => t.id === id))));
  assert.ok(r.transactions.every(t => t.synthetic && t.id.startsWith('sample-')));
});
test('wei formatting retains sub-ETH precision', () => { assert.equal(eth('1'), '0.000000000000000001'); assert.equal(eth('1000000000000000000'), '1'); });
test('failed, zero-value, self, unrelated, and out-of-window transfers are excluded', () => {
  const t = sampleTransactions()[0];
  assert.equal(report([{ ...t, failed: true }, { ...t, wei: '0' }, { ...t, to: address }, { ...t, from: t.to }, { ...t, timestamp: end + 1 }]).stats.transfers, 0);
});
test('empty history establishes no patterns and keeps unknowns visible', () => { const r = report([]); assert.equal(r.stats.outgoing, '0'); assert.equal(r.peers.length, 0); assert.deepEqual(r.findings.map(f => f.status), ['unknown', 'unknown', 'unknown']); });
test('two transfers do not support recurring-payment hypothesis', () => { assert.equal(report(sampleTransactions().filter(t => t.to === `0x${'3'.repeat(40)}`).slice(0, 2)).interpretations.length, 0); });
test('irregular spacing does not support recurring-payment hypothesis', () => {
  const rows = sampleTransactions().filter(t => t.to === `0x${'2'.repeat(40)}`);
  rows[1] = { ...rows[1], timestamp: rows[0].timestamp + 7 * 86400 };
  assert.equal(report(rows).interpretations.length, 0);
});
test('varying amounts do not support recurring-payment hypothesis', () => {
  const rows = sampleTransactions().filter(t => t.to === `0x${'2'.repeat(40)}`);
  rows[1] = { ...rows[1], wei: '840000000000000000' };
  assert.equal(report(rows).interpretations.length, 0);
});
test('ETH concentration evidence includes denominator transactions', () => {
  const r = report(), f = r.findings.find(f => f.id === 'concentration');
  assert.deepEqual(f.evidence, r.transactions.filter(t => t.from === address && !t.asset).map(t => t.id));
  assert.match(f.body, /47\.5%/);
});
test('live cap reports incomplete coverage', () => { const r = analyze({ address, transactions: [], start, end, source: 'live', fetchedCount: 100 }); assert.equal(r.capReached, true); });
test('invalid addresses are rejected', () => { assert.throws(() => analyze({ address: 'alice.eth', transactions: [], start, end }), /Ethereum address/); });
test('model selections must reference an allowed interpretation and its matching finding', () => {
  const r = report(), i = r.interpretations[0];
  assert.equal(validateSelections([{ findingId: i.findingId, interpretationId: i.id }], r)[0], i);
  assert.throws(() => validateSelections([{ findingId: 'identity', interpretationId: i.id }], r), /outside/);
  assert.throws(() => validateSelections([{ findingId: i.findingId, interpretationId: i.id, claim: 'salary' }], r), /outside/);
  assert.throws(() => validateSelections([{ findingId: i.findingId, interpretationId: i.id }, { findingId: i.findingId, interpretationId: i.id }], r), /outside/);
});
test('Etherscan rate limit is an error, not an empty history', async () => {
  RETRY_MS.value = 1;
  await assert.rejects(fetchTransactions(address, 'test', async () => ({ ok: true, json: async () => ({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' }) })), /Etherscan is busy/);
  RETRY_MS.value = 1100;
});
test('Etherscan no-transactions result is accepted without fabricating a finding', async () => {
  assert.deepEqual(await fetchTransactions(address, 'test', async () => ({ ok: true, json: async () => ({ status: '0', message: 'No transactions found', result: [] }) })), []);
});
test('Etherscan query stays on chain 1 and caps at 100; malformed source is rejected', async () => {
  await assert.rejects(fetchTransactions(address, 'test', async url => {
    assert.equal(url.searchParams.get('chainid'), '1'); assert.equal(url.searchParams.get('offset'), '100'); assert.equal(url.searchParams.get('sort'), 'desc');
    return { ok: true, json: async () => ({ status: '1', result: [{ hash: 'bad' }] }) };
  }), /malformed/);
});
test('AI request uses structured IDs, disables response storage, and returns real usage', async () => {
  const r = report(), i = r.interpretations[0];
  const result = await runAI(r, 'test', 'gpt-6.1-sol', async (url, opts) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const payload = JSON.parse(opts.body); assert.equal(payload.store, false); assert.equal(payload.text.format.strict, true);
    return { ok: true, json: async () => ({ status: 'completed', model: payload.model,
      output: [{ content: [{ type: 'output_text', text: JSON.stringify({ selections: [{ findingId: i.findingId, interpretationId: i.id }], proposals: [] }) }] }],
      usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 200 }, output_tokens: 50 } }) };
  });
  assert.equal(result.selections.length, 1); assert.equal(result.newFindings, 0);
  assert.ok(Math.abs(result.cost.lower - .00212) < 1e-9); assert.ok(Math.abs(result.cost.upper - .00252) < 1e-9);
});
test('incomplete AI output cannot become findings', async () => {
  await assert.rejects(runAI(report(), 'test', 'gpt-6.1-sol', async () => ({ ok: true, json: async () => ({ status: 'incomplete' }) })), /did not complete/);
});

test('stablecoin series form their own hypothesis and stay out of ETH totals', () => {
  const r = report(), f = r.findings.find(f => f.key === 'recurring:outgoing:USDC:1500000000');
  assert.ok(f); assert.match(f.body, /1500-1500 USDC/);
  assert.equal(r.stats.tokenTransfers, 3); assert.equal(r.stats.tokens.USDC.outgoing, '4500'); assert.equal(r.stats.outgoing, '2.651');
});
test('equal amounts of different assets are not one recurring series', () => {
  const rows = sampleTransactions().map(t => t.asset === 'USDC' && t.id === 'sample-026' ? { ...t, asset: 'DAI', decimals: 18 } : t);
  assert.equal(report(rows).findings.some(f => f.key?.startsWith('recurring:outgoing:USDC')), false);
});
test('token transfers keep only allowlisted stablecoin contracts, not spoofed symbols', async () => {
  const base = { hash: `0x${'a'.repeat(64)}`, from: `0x${'2'.repeat(40)}`, to: address, value: '5000000', timeStamp: '1780000000' };
  const fetcher = async () => ({ ok: true, json: async () => ({ status: '1', result: [
    { ...base, contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', tokenSymbol: 'USDC', tokenDecimal: '6' },
    { ...base, contractAddress: `0x${'9'.repeat(40)}`, tokenSymbol: 'USDC', tokenDecimal: '6' },
    { ...base, contractAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7', tokenSymbol: 'USDT', tokenDecimal: '6' },
  ] }) });
  const { rows, fetched } = await fetchTokenTransfers(address, 'key', fetcher);
  assert.equal(fetched, 3); assert.deepEqual(rows.map(r => r.asset), ['USDC', 'USDT']);
  assert.deepEqual(rows.map(r => r.id), [base.hash, `${base.hash}#2`]);
});

test('a fixed series from one counterparty is found among its other transfers', () => {
  const rows = [...sampleTransactions(), { id: 'extra-1', from: `0x${'4'.repeat(40)}`, to: address, wei: '60000000000000000', timestamp: Date.parse('2026-08-20T09:00:00Z') / 1000, failed: false, synthetic: true }];
  assert.ok(report(rows).findings.some(f => f.key === 'recurring:incoming:ETH:1200000000000000000'));
});

test('Etherscan per-second rate limits are retried, then reported plainly', async () => {
  RETRY_MS.value = 1;
  const limited = { ok: true, json: async () => ({ status: '0', message: 'NOTOK', result: 'Max calls per sec rate limit reached (3/sec)' }) };
  const ok = { ok: true, json: async () => ({ status: '0', message: 'No transactions found', result: [] }) };
  let calls = 0;
  assert.deepEqual(await fetchTransactions(address, 'key', async () => (++calls < 3 ? limited : ok)), []);
  assert.equal(calls, 3);
  await assert.rejects(fetchTransactions(address, 'key', async () => limited), /Etherscan is busy/);
  RETRY_MS.value = 1100;
});
