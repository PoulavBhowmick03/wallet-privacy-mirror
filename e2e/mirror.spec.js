import { test, expect } from '@playwright/test';
test('sample report, status filters, evidence, graph, export, and AI setup', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#data-badge')).toContainText('Synthetic');
  await expect(page.locator('.finding')).toHaveCount(3);
  await page.locator('[data-finding="repeat"]').click();
  await expect(page.locator('#evidence-rows tr')).toHaveCount(12);
  await expect(page.locator('#evidence-rows a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close evidence' }).click();
  await page.getByRole('tab', { name: /Hypotheses/ }).click();
  await expect(page.locator('.finding')).toHaveCount(4);
  await page.getByRole('tab', { name: /Unknown/ }).click();
  await expect(page.locator('.finding')).toHaveCount(3);
  await expect(page.locator('.evidence-button')).toHaveCount(0);
  await page.locator('[data-peer="0"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#evidence-dialog')).toBeVisible(); await page.keyboard.press('Escape');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click();
  expect((await downloadPromise).suggestedFilename()).toBe('mirror-sample-report.json');
  await page.locator('#ai-open').click(); await expect(page.locator('#ai-dialog')).toBeVisible();
  await expect(page.locator('#ai-dialog')).toContainText('another disclosure'); await page.keyboard.press('Escape');
  await page.locator('#days').selectOption('30'); await page.locator('#analyze').click();
  await expect(page.locator('#report-range')).toContainText('31 Aug 2026');
  expect(errors).toEqual([]);
});
test('live querying requires explicit consent and validation', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#results')).toBeVisible();
  await page.locator('#live-mode').click(); await page.locator('#address').fill('0x1111111111111111111111111111111111111111');
  await page.locator('#analyze').click(); await expect(page.locator('#error')).toContainText('confirm permission');
  await page.locator('#live-check').check(); await page.locator('#address').fill('bad'); await page.locator('#analyze').click();
  await expect(page.locator('#error')).toContainText('valid address');
});
test('mobile report fits viewport and evidence remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.locator('#results')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.evidence-button').first().click(); await expect(page.locator('#evidence-dialog')).toBeVisible();
  await page.screenshot({ path: 'artifacts/mobile-evidence.png' });
});
test('capture desktop report', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto('/');
  await expect(page.locator('#results')).toBeVisible(); await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
});
test('AI consent gates the request and the comparison exposes its evidence checks', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { live: false, ai: true, model: 'gpt-6.1-sol' } }));
  let calls = 0;
  await page.route('**/api/ai', async route => {
    calls++; expect(route.request().postDataJSON().consent).toBe(true);
    await route.fulfill({ json: { model: 'gpt-6.1-sol', elapsedMs: 120, selections: [], newFindings: 0, proposed: 0, accepted: [], rejected: [],
      note: 'Mocked browser test result.', cost: null, usage: { input_tokens: 10, output_tokens: 2 } } });
  });
  await page.goto('/'); await expect(page.locator('#results')).toBeVisible(); await page.locator('#ai-open').click();
  await page.locator('#ai-run').click(); await expect(page.locator('#ai-error')).toContainText('Confirm the disclosure'); expect(calls).toBe(0);
  await page.locator('#ai-check').check(); await page.locator('#ai-run').click();
  await expect(page.locator('#ai-result')).toContainText('No additional patterns survived'); expect(calls).toBe(1);
});
test('API rejects cross-origin callers and traversal cannot disclose server files', async ({ request }) => {
  const crossOrigin = await request.post('/api/report', { headers: { Origin: 'https://example.com' }, data: { source: 'sample' } });
  expect(crossOrigin.status()).toBe(403);
  expect((await request.get('/server.js')).status()).toBe(404);
  expect((await request.get('/.env')).status()).toBe(404);
});
test('accepted and rejected AI patterns expose evidence and survive export', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { live: false, ai: true, model: 'gpt-6.1-sol' } }));
  const result = { model: 'mock-model', elapsedMs: 100, selections: [], proposed: 2, newFindings: 1,
    accepted: [{ id: 'proposal-1', title: 'Several transfers occurred close together', body: 'Mock pattern result for UI testing.',
      evidence: ['sample-019', 'sample-020', 'sample-021'], method: 'At least three transfers within six hours.', verification: 'Checked synthetic records.' }],
    rejected: [{ id: 'proposal-2', category: 'amount_reuse', reason: 'The cited amounts differ.', evidence: ['sample-019', 'sample-020'] }],
    note: 'Mocked browser result, not live AI output.', usage: null, cost: null };
  await page.route('**/api/ai', route => route.fulfill({ json: result }));
  await page.goto('/'); await expect(page.locator('#results')).toBeVisible();
  await page.locator('#ai-open').click(); await page.locator('#ai-check').check(); await page.locator('#ai-run').click();
  await expect(page.locator('.ai-finding')).toHaveCount(1);
  await page.locator('[data-ai-evidence="proposal-1"]').click();
  await expect(page.locator('#evidence-rows tr')).toHaveCount(3); await expect(page.locator('#evidence-method')).toContainText('six hours');
  await page.keyboard.press('Escape');
  await page.locator('.rejected-proposals summary').click(); await expect(page.locator('.rejected-proposals')).toContainText('amounts differ');
  await page.locator('[data-ai-rejected="proposal-2"]').click(); await expect(page.locator('#evidence-rows tr')).toHaveCount(2);
  await expect(page.locator('#evidence-method')).toContainText('not an accepted finding'); await page.keyboard.press('Escape');
  const downloadPromise = page.waitForEvent('download'); await page.locator('#export').click();
  const download = await downloadPromise, stream = await download.createReadStream();
  let contents = ''; for await (const chunk of stream) contents += chunk;
  expect(JSON.parse(contents).ai).toEqual(result);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('recorded public contract history is clearly labeled and provides explorer evidence', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#results')).toBeVisible();
  await page.locator('#recorded-mode').click();
  await expect(page.locator('#data-badge')).toContainText('Recorded mainnet');
  await expect(page.locator('#provenance')).toContainText('Lido Execution Layer Rewards Vault');
  await expect(page.locator('#provenance')).toContainText('saved snapshot');
  await expect(page.locator('#days')).toBeDisabled();
  await expect(page.locator('#stats')).toContainText('100');
  await page.locator('[data-finding="repeat"]').click();
  await expect(page.locator('#evidence-rows tr')).toHaveCount(68);
  await expect(page.locator('#evidence-rows a').first()).toHaveAttribute('href', /^https:\/\/etherscan.io\/tx\/0x/);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/real-history-mobile.png', fullPage: true });
});
test('timeline periods expose their evidence and search can narrow and reset cited rows', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#overview-title')).toContainText('12 transfers');
  await page.locator('[data-bucket]').first().focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#evidence-dialog')).toBeVisible();
  await expect(page.locator('#evidence-method')).toContainText('UTC period');
  await page.keyboard.press('Escape');
  await page.locator('#overview-evidence').click();
  await expect(page.locator('#evidence-rows tr')).toHaveCount(12);
  await page.locator('#evidence-search').fill('sample-004');
  await expect(page.locator('#evidence-rows tr')).toHaveCount(1);
  await expect(page.locator('#evidence-count')).toHaveText('1 of 12 transfers');
  await page.locator('#evidence-search').fill('does-not-exist');
  await expect(page.locator('#evidence-empty')).toBeVisible();
  await page.locator('#evidence-search').fill('');
  await page.locator('#evidence-sort').selectOption('newest');
  await expect(page.locator('#evidence-rows tr').first()).toContainText('sample-015');
  await page.keyboard.press('Escape'); await page.locator('#overview-evidence').click();
  await expect(page.locator('#evidence-search')).toHaveValue('');
  await expect(page.locator('#evidence-sort')).toHaveValue('oldest');
  await expect(page.locator('#evidence-rows tr')).toHaveCount(12);
});
test('switching back from recorded history loads the sample with its correct overview', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#results')).toBeVisible();
  await page.locator('#recorded-mode').click();
  await expect(page.locator('#overview-title')).toContainText('100 public receipts');
  await expect(page.locator('#timeline-range')).toContainText('4 calendar-day');
  await expect(page.locator('[data-bucket]')).toHaveCount(4);
  await page.locator('#sample-mode').click();
  await expect(page.locator('#data-badge')).toContainText('Synthetic');
  await expect(page.locator('#overview-title')).toContainText('12 transfers');
  await expect(page.locator('#provenance')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('what-if scenarios, planned transfers, and the recorded model run work without external requests', async ({ page }) => {
  const external = []; page.on('request', r => { if (!r.url().startsWith('http://localhost') && !r.url().startsWith('http://127.0.0.1')) external.push(r.url()); });
  await page.goto('/'); await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#coverage')).toContainText('3 stablecoin transfers');
  await page.locator('[data-scenario="stealth"]').click();
  await expect(page.locator('#scenario-result .diff.removed')).toContainText('Regular incoming ETH transfers');
  await page.locator('[data-scenario="pool"]').click();
  await expect(page.locator('#scenario-result .diff.changed')).toContainText('0x0000...00f1');
  await expect(page.locator('#presend-to')).toHaveValue(`0x${'3'.repeat(40)}`);
  await page.locator('#presend-run').click();
  await expect(page.locator('#presend-result')).toContainText('13 outgoing transfers');
  await page.locator('#presend-to').fill('0x1111111111111111111111111111111111111111'); await page.locator('#presend-run').click();
  await expect(page.locator('#presend-error')).toContainText('self-transfer');
  await page.locator('#ai-recorded').click();
  await expect(page.locator('#ai-result')).toContainText('Recorded run');
  await expect(page.locator('#ai-result')).toContainText('gpt-6.1-sol');
  expect(external).toEqual([]);
});
