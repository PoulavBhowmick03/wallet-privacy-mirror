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
