import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('public deployment serves recorded evidence and blocks paid providers even with keys', async () => {
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '3199', PUBLIC_DEMO: '1', ETHERSCAN_API_KEY: 'test-key', OPENAI_API_KEY: 'test-key' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before startup'); })]);
    const base = 'http://127.0.0.1:3199';
    const configuration = await (await fetch(`${base}/api/config`)).json();
    assert.equal(configuration.publicDemo, true);
    assert.equal(configuration.live, false);
    assert.equal(configuration.ai, false);
    const post = (path, data) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal((await post('/api/report', { source: 'live', address: '0x1111111111111111111111111111111111111111', consent: true })).status, 403);
    assert.equal((await post('/api/ai', { consent: true })).status, 403);
    const response = await post('/api/report', { source: 'recorded' });
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.stats.transfers, 100);
    assert.equal(report.chainVerification.results.every(result => result.passed), true);
    assert.equal((await fetch(`${base}/api/config`, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  } finally { child.kill(); await once(child, 'exit'); }
});

test('public address lookups need an explicit switch, stay rate-limited, and never enable model requests', async () => {
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '3198', PUBLIC_DEMO: '1', PUBLIC_LIVE: '1', ETHERSCAN_API_KEY: 'test-key', OPENAI_API_KEY: 'test-key' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before startup'); })]);
    const base = 'http://127.0.0.1:3198';
    const configuration = await (await fetch(`${base}/api/config`)).json();
    assert.equal(configuration.live, true); assert.equal(configuration.ai, false);
    const post = (path, data) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal((await post('/api/ai', { consent: true })).status, 403);
    // Invalid lookups count toward the limit, so no request reaches Etherscan here.
    const statuses = [];
    for (let i = 0; i < 13; i++) statuses.push((await post('/api/report', { source: 'live', address: 'bad', consent: true })).status);
    assert.deepEqual(statuses, [...Array(12).fill(400), 429]);
    const address = `0x${'1'.repeat(40)}`, peer = `0x${'3'.repeat(40)}`;
    const transactions = [0, 7, 14].map(d => ({ id: `t${d}`, from: address, to: peer, wei: '80000000000000000', timestamp: 1780000000 + d * 86400 }));
    const planned = await post('/api/presend', { source: 'live', address, start: 1780000000, end: 1781300000, transactions, to: peer, amount: '0.08', asset: 'ETH', when: new Date((1780000000 + 21 * 86400) * 1000).toISOString() });
    assert.equal(planned.status, 200);
    assert.match(JSON.stringify(await planned.json()), /4 outgoing transfers/);
  } finally { child.kill(); await once(child, 'exit'); }
});
