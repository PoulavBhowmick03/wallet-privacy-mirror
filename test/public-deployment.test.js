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

test('public model runs fail closed without the shared store, and enforce daily limits with it', async () => {
  const { createServer } = await import('node:http');
  // A minimal stand-in for Upstash's REST pipeline endpoint.
  const store = new Map();
  const redis = createServer(async (req, res) => {
    let text = ''; for await (const c of req) text += c;
    const out = JSON.parse(text).map(([cmd, key, value, ...rest]) => {
      if (cmd === 'SET') { if (rest.includes('NX') && store.has(key)) return { result: null }; store.set(key, value); return { result: 'OK' }; }
      if (cmd === 'INCR') { const n = Number(store.get(key) || 0) + 1; store.set(key, String(n)); return { result: n }; }
      if (cmd === 'GET') return { result: store.get(key) ?? null };
      return { error: 'unsupported' };
    });
    res.end(JSON.stringify(out));
  }).listen(3196);
  const start = env => spawn(process.execPath, ['server.js'], { env: { ...process.env, PUBLIC_DEMO: '1', PUBLIC_AI: '1', OPENAI_API_KEY: 'test-key', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = child => Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before startup'); })]);
  const closed = start({ PORT: '3195', KV_REST_API_URL: '', KV_REST_API_TOKEN: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' });
  const open = start({ PORT: '3194', KV_REST_API_URL: 'http://127.0.0.1:3196', KV_REST_API_TOKEN: 't', AI_PER_CLIENT_DAILY: '2', AI_DAILY_CAP: '5' });
  try {
    await ready(closed); await ready(open);
    assert.equal((await (await fetch('http://127.0.0.1:3195/api/config')).json()).ai, false);
    assert.equal((await fetch('http://127.0.0.1:3195/api/ai', { method: 'POST', body: '{"consent":true}' })).status, 403);
    // One transfer makes runAI stop before any OpenAI request, so only the limiter is exercised.
    const address = `0x${'1'.repeat(40)}`;
    const payload = { consent: true, source: 'live', address, start: 0, end: 2e9, transactions: [{ id: 'one', from: address, to: `0x${'3'.repeat(40)}`, wei: '1', timestamp: 1780000000 }] };
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await fetch('http://127.0.0.1:3194/api/ai', { method: 'POST', body: JSON.stringify(payload) })).status);
    assert.deepEqual(statuses, [400, 400, 429]);
    assert.equal((await (await fetch('http://127.0.0.1:3194/api/config')).json()).aiLimits.perDay, 5);
  } finally { for (const c of [closed, open]) { c.kill(); await once(c, 'exit'); } redis.close(); }
});
