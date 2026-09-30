import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runAI } from './src/providers.js';
import { buildReport, recordedModelRun } from './src/report.js';
import { plannedTransfer } from './src/scenarios.js';
import { analyze } from './src/analysis.js';

const port = Number(process.env.PORT || 3000);
const publicDemo = process.env.VERCEL === '1' || process.env.PUBLIC_DEMO === '1';
// Public address lookups need an explicit switch in addition to a key. Model requests never run publicly.
const publicLive = publicDemo && process.env.PUBLIC_LIVE === '1';
const liveEnabled = Boolean(process.env.ETHERSCAN_API_KEY) && (!publicDemo || publicLive);
const model = process.env.OPENAI_MODEL || 'gpt-6.1-sol';
// Best-effort guards for public lookups. Serverless instances do not share memory, so these limits
// apply per instance; Etherscan's own rate limit still sits behind them. Attempts are counted,
// not successes, so invalid requests cannot be used to probe past the limit.
const LOOKUP_LIMIT = { perClient: 12, windowMs: 10 * 60 * 1000, perMinute: 40 }, CACHE_MS = 5 * 60 * 1000;
const lookups = new Map(), recentLookups = [], lookupCache = new Map();
function rateLimit(req) {
  const now = Date.now(), client = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  while (recentLookups.length && now - recentLookups[0] > 60000) recentLookups.shift();
  if (recentLookups.length >= LOOKUP_LIMIT.perMinute) return 'This demo is handling many lookups. Try again in a minute.';
  const times = (lookups.get(client) || []).filter(t => now - t < LOOKUP_LIMIT.windowMs);
  if (times.length >= LOOKUP_LIMIT.perClient) { lookups.set(client, times); return 'Too many lookups from this connection. Try again in a few minutes.'; }
  times.push(now); lookups.set(client, times); recentLookups.push(now);
  if (lookups.size > 5000) lookups.delete(lookups.keys().next().value);
  return null;
}
const reports = new Map(), inFlight = new Set();
const TTL = 15 * 60 * 1000;
const assets = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/report-view.js', ['report-view.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req, limit = 4096) {
  if (req.body && typeof req.body === 'object') {
    if (JSON.stringify(req.body).length > limit) throw new Error('Request too large.');
    return req.body;
  }
  let text = '';
  for await (const chunk of req) { text += chunk; if (text.length > limit) throw new Error('Request too large.'); }
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON request.'); }
}
export async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    // Bind to loopback, reject alternate hosts and cross-origin API callers.
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (!publicDemo && !allowedHosts.has(req.headers.host)) return json(res, 403, { error: 'This demo only accepts localhost requests.' });
    const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    if (pathname.startsWith('/api/') && req.headers.origin && !(publicDemo ? req.headers.origin === `https://${req.headers.host}` : [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin))) return json(res, 403, { error: 'Cross-origin request rejected.' });
    if (req.method === 'GET' && pathname === '/api/config') {
      const ev = await readFile(new URL('./data/model-evaluation.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => null);
      const evaluation = ev && ev.completed ? { model: ev.model, createdAt: ev.createdAt, cases: ev.cases.length, nearMiss: ev.cases.filter(c => /^(near|late|same|mixed)-/.test(c.id)).length,
        completed: ev.completed, passed: ev.passed, proposed: ev.proposed, accepted: ev.accepted, rejected: ev.rejected, cost: ev.estimatedCost } : null;
      return json(res, 200, { live: liveEnabled, ai: !publicDemo && Boolean(process.env.OPENAI_API_KEY), publicDemo, model,
        modelName: model === 'gpt-6.1-sol' ? 'GPT-6.1 Sol' : model, evaluation });
    }
    if (req.method === 'POST' && pathname === '/api/report') {
      const input = await body(req), started = performance.now();
      const publicLookup = publicLive && input.source === 'live';
      const cacheKey = publicLookup ? `${String(input.address || '').toLowerCase()}:${Number(input.days || 90)}` : null;
      const cached = cacheKey && input.consent === true && lookupCache.get(cacheKey);
      let report;
      if (cached && Date.now() - cached.created < CACHE_MS) report = structuredClone(cached.report);
      else {
        if (publicLookup) { const limited = rateLimit(req); if (limited) return json(res, 429, { error: limited }); }
        try { report = await buildReport(input, { publicDemo, allowLive: liveEnabled, etherscanKey: process.env.ETHERSCAN_API_KEY }); }
        catch (e) { if (e.status) return json(res, e.status, { error: e.message }); throw e; }
        if (cacheKey) {
          for (const [key, entry] of lookupCache) if (Date.now() - entry.created > CACHE_MS) lookupCache.delete(key);
          if (lookupCache.size >= 100) lookupCache.delete(lookupCache.keys().next().value);
          lookupCache.set(cacheKey, { report: structuredClone(report), created: Date.now() });
        }
      }
      report.elapsedMs = Math.round(performance.now() - started); report.id = randomUUID(); report.generatedAt = new Date().toISOString();
      if (publicDemo) return json(res, 200, report); // Public reports are not kept beyond the lookup cache.
      for (const [id, entry] of reports) if (Date.now() - entry.created > TTL) reports.delete(id);
      if (reports.size >= 50) reports.delete(reports.keys().next().value);
      reports.set(report.id, { report, created: Date.now(), ai: null });
      const reportId = report.id;
      setTimeout(() => reports.delete(reportId), TTL).unref?.();
      return json(res, 200, report);
    }
    // Sample and recorded reports are rebuilt here. A live report comes from memory, or from the
    // transactions the browser already holds, so planned-transfer checks work across instances.
    async function reportFor(input) {
      if (input.source === 'sample' || input.source === 'recorded') return buildReport({ source: input.source, days: input.days }, { publicDemo });
      if (!reports.has(input.reportId) && Array.isArray(input.transactions)) {
        if (input.transactions.length > 200) throw new Error('A report holds at most 200 transfers.');
        return analyze({ address: input.address, transactions: input.transactions, start: Number(input.start), end: Number(input.end), source: 'live' });
      }
      const entry = reports.get(input.reportId);
      if (!entry || Date.now() - entry.created > TTL) throw new Error('Report expired. Analyze the wallet again.');
      return entry.report;
    }
    if (req.method === 'POST' && pathname === '/api/presend') {
      const input = await body(req, 200000);
      return json(res, 200, plannedTransfer(await reportFor(input), input));
    }
    if (req.method === 'POST' && pathname === '/api/ai-recorded') {
      const input = await body(req);
      if (input.source !== 'sample' && input.source !== 'recorded') throw new Error('Recorded model runs exist only for the sample and recorded data.');
      const run = await recordedModelRun(await reportFor(input));
      return run ? json(res, 200, run) : json(res, 404, { error: 'No recorded model run matches this window. Choose the 90-day sample or the recorded data.' });
    }
    if (req.method === 'POST' && pathname === '/api/ai') {
      if (publicDemo) return json(res, 403, { error: 'Model comparison is unavailable in this public demo. No paid API request was made.' });
      const input = await body(req);
      if (input.consent !== true) throw new Error('Confirm disclosure to OpenAI before running the model.');
      if (!process.env.OPENAI_API_KEY) throw new Error('AI analysis needs OPENAI_API_KEY in the server .env file.');
      const entry = reports.get(input.reportId);
      if (!entry || Date.now() - entry.created > TTL) throw new Error('Report expired. Analyze the wallet again.');
      if (entry.ai) return json(res, 200, entry.ai);
      if (inFlight.size || inFlight.has(input.reportId)) throw new Error('An AI request is already running. Wait before trying again.');
      inFlight.add(input.reportId);
      try { entry.ai = await runAI(entry.report, process.env.OPENAI_API_KEY, model); return json(res, 200, entry.ai); }
      finally { inFlight.delete(input.reportId); }
    }
    if (req.method === 'GET' && assets.has(pathname)) {
      const [file, type] = assets.get(pathname);
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      return res.end(await readFile(fileURLToPath(new URL(`./public/${file}`, import.meta.url))));
    }
    json(res, 404, { error: 'Not found.' });
  } catch (error) { json(res, 400, { error: error.message || 'Unable to complete the request.' }); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  createServer(handler).listen(port, '127.0.0.1', () => console.log(`Wallet Privacy Mirror: http://localhost:${port}`));
}
