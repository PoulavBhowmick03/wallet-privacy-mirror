// Captures the running app in the states the demo video needs, plus the page-space
// boxes of the elements the video points at. Requires `npm run dev` on :3000.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const OUT = new URL('./shots/', import.meta.url).pathname;
const URL_ = 'http://localhost:3000/';
const SCALE = 3;
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE, colorScheme: 'light', reducedMotion: 'reduce' });
const page = await context.newPage();
const states = {};

async function boxes(map) {
  return page.evaluate(map => Object.fromEntries(Object.entries(map).map(([name, sel]) => {
    const el = document.querySelector(sel);
    if (!el) return [name, null];
    const r = el.getBoundingClientRect();
    return [name, { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }];
  })), map);
}
async function settle() { await page.waitForTimeout(400); await page.mouse.move(1439, 899); }
async function load() { await page.goto(URL_); await page.locator('#results').waitFor(); await settle(); }
async function full(name, map) {
  await page.evaluate(() => scrollTo(0, 0)); await settle();
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  states[name] = { kind: 'full', y: 0, height, boxes: await boxes(map) };
}
async function viewport(name, map) {
  await settle();
  await page.screenshot({ path: `${OUT}${name}.png` });
  const y = await page.evaluate(() => scrollY);
  states[name] = { kind: 'viewport', y, height: 900, boxes: await boxes(map) };
}

const reportBoxes = {
  queryPanel: '.query-panel', sourceToggle: '.source-toggle', sample: '#sample-mode', recorded: '#recorded-mode', live: '#live-mode',
  address: '.address-wrap', analyze: '#analyze', queryNote: '#query-note', nav: '.section-nav',
  reportHead: '.report-head', overviewMain: '.overview-main', title: '#report-title', badge: '#data-badge', stats: '#stats', overview: '.overview',
  overviewTitle: '#overview-title', boundary: '.overview-boundary', findings: '#findings-section', tabs: '.tabs',
  tabObserved: '[data-filter=observed]', tabHypo: '[data-filter=hypothesis]', tabUnknown: '[data-filter=unknown]',
  f1: '#findings .finding:nth-child(1)', f2: '#findings .finding:nth-child(2)', f3: '#findings .finding:nth-child(3)',
  viewRepeat: '[data-finding=repeat]', map: '#map-section', graph: '#graph svg', node0: '[data-peer="0"]', node1: '[data-peer="1"]', node2: '[data-peer="2"]',
  activity: '#activity-section', timeline: '#timeline svg', ai: '#ai-section', aiOpen: '#ai-open', limits: '#boundaries',
  coverage: '#coverage', whatif: '#whatif-section', scnStealth: '[data-scenario=stealth]', scnPool: '[data-scenario=pool]',
  whatifRemoved: '#scenario-result .diff.removed', whatifChanged: '#scenario-result .diff.changed', whatifSummary: '#scenario-result .scenario-summary', whatifList: '#scenario-result .diff-list',
  presend: '#presend-section', presendForm: '#presend-form', presendRun: '#presend-run', presendResult: '#presend-result', presendLast: '#presend-result .diff:last-child',
  aiRecorded: '#ai-recorded', aiResult: '#ai-result', metrics: '#ai-result .comparison-metrics', evalLine: '#eval-line', aiNotice: '#ai-result .notice', aiCards: '#ai-result .ai-finding',
};

// 1. Sample report and its hypotheses tab.
await load();
await full('report', reportBoxes);
await page.locator('[data-filter=hypothesis]').click();
await full('hypo', { ...reportBoxes, view3: '[data-finding="cadence-3"]', view1: '[data-finding="cadence-1"]' });
await page.locator('[data-filter=unknown]').click();
await full('unknown', reportBoxes);

// 2. Evidence dialog for the monthly incoming pattern, captured at the scroll it opens from.
await page.locator('[data-filter=hypothesis]').click();
await page.evaluate(() => scrollTo(0, document.querySelector('#findings-section').getBoundingClientRect().top + scrollY - 90));
await viewport('hypo-vp', { view3: '[data-finding="cadence-3"]' });
await page.locator('[data-finding="cadence-3"]').click();
await page.locator('#evidence-dialog').waitFor();
await viewport('evidence', { dialog: '#evidence-dialog', title: '#evidence-title', method: '#evidence-method', table: '.evidence-scroll', row1: '#evidence-rows tr:nth-child(1)', rows: '#evidence-rows', note: '#evidence-note', count: '#evidence-count', search: '#evidence-search', close: '#evidence-close' });
await page.keyboard.press('Escape');

// 2b. Countermeasures, a planned transfer, and the recorded model run, in the order the video shows them.
await load();
await page.locator('[data-scenario=pool]').click();
await full('whatif-pool', reportBoxes);
await page.locator('#presend-run').click(); await page.locator('#presend-result .diff-list').waitFor();
await full('presend', reportBoxes);
await page.locator('#ai-recorded').click(); await page.locator('#ai-result .comparison-metrics').waitFor();
await full('model', reportBoxes);
await load();

// 3. Counterparty hover.
await page.evaluate(() => scrollTo(0, 0));
await page.locator('[data-peer="0"]').hover();
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}map-hover.png`, fullPage: true });
states['map-hover'] = { ...states.report, kind: 'full' };

// 4. Recorded Lido snapshot.
await page.locator('#recorded-mode').click();
await page.locator('#data-badge', { hasText: 'Recorded' }).waitFor();
await full('recorded', { ...reportBoxes, provenance: '#provenance', cap: '#cap-warning' });

// 5. Live mode: consent gate.
await page.locator('#live-mode').click();
await page.locator('#address').fill('0x388c818ca8b9251b393131c08a736a67ccb19297');
await page.evaluate(() => document.activeElement.blur());
await full('live', { ...reportBoxes, consent: '#live-consent' });

// 6. Model comparison consent dialog (no request is sent).
await load();
await page.evaluate(() => scrollTo(0, document.querySelector('#ai-section').getBoundingClientRect().top + scrollY - 300));
await viewport('ai-vp', { aiOpen: '#ai-open' });
await page.locator('#ai-open').click();
await page.locator('#ai-dialog').waitFor();
await viewport('ai', { dialog: '#ai-dialog', note: '#ai-config-note', consent: '#ai-dialog .consent', run: '#ai-run', title: '#ai-dialog-title' });

await writeFile(`${OUT}states.json`, JSON.stringify({ width: 1440, scale: SCALE, states }, null, 1));
await browser.close();
console.log('captured', Object.keys(states).join(', '));
