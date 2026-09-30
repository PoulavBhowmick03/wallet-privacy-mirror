// Records real model runs for the public demo's sample (90 days) and recorded data.
// The public site replays these, labeled as recorded, and never calls the model itself.
import { writeFile } from 'node:fs/promises';
import { buildReport } from '../src/report.js';
import { runAI } from '../src/providers.js';

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
const model = process.env.OPENAI_MODEL || 'gpt-6.1-sol';
const out = { recordedAt: new Date().toISOString(), model, note: 'Real API responses, replayed on the public demo. Not regenerated per visit.', runs: {} };
for (const [key, input] of [['sample-90', { source: 'sample', days: 90 }], ['recorded', { source: 'recorded' }]]) {
  const report = await buildReport(input);
  const result = await runAI(report, process.env.OPENAI_API_KEY, model);
  out.runs[key] = { transactionIds: report.transactions.map(t => t.id), result };
  console.log(`${key}: ${result.proposed} proposed, ${result.accepted.length} accepted, ${result.rejected.length} rejected, ${result.selections.length} selected; ${result.elapsedMs} ms; $${result.cost?.lower.toFixed(4)}-${result.cost?.upper.toFixed(4)}`);
}
await writeFile(new URL('../data/model-runs.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('wrote data/model-runs.json');
