import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { evaluationCases, scoreResult } from '../src/evaluation-cases.js';
import { runAI } from '../src/providers.js';

const withAI = process.argv.includes('--with-ai');
const model = process.env.OPENAI_MODEL || 'gpt-6.1-sol';
const snapshot = JSON.parse(await readFile(new URL('../data/lido-mainnet-snapshot.json', import.meta.url), 'utf8'));
const cases = evaluationCases(snapshot);
const summary = { createdAt: new Date().toISOString(), model, mode: withAI ? 'live-model-evaluation' : 'plan-only',
  scope: 'Six predefined cases, one model attempt per case. Category coverage after pattern checks; not general accuracy or unconstrained inference. Synthetic cases are invented; the Lido case contains recorded public transactions.', cases: [] };
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
let blocked = null;
for (const item of cases) {
  const record = { id: item.id, description: item.description, expectedPatterns: item.expectedPatterns, expectedRecurring: item.expectedRecurring,
    transfers: item.report.transactions.length, baselineFindings: item.report.findings.filter(f => f.status !== 'unknown').length,
    baselineRecurring: item.report.interpretations.length, aiStatus: withAI ? 'pending' : 'not-run' };
  if (withAI && !blocked) {
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
      const ai = await runAI(item.report, process.env.OPENAI_API_KEY, model);
      record.aiStatus = 'completed'; record.result = ai; record.score = scoreResult(item, ai);
      console.log(`${item.id}: ${record.score.passed ? 'PASS' : 'FAIL'}; ${ai.accepted.length} accepted, ${ai.rejected.length} rejected; ${ai.elapsedMs} ms`);
    } catch (e) { blocked = e.message; record.aiStatus = 'failed'; record.error = e.message; console.log(`${item.id}: ${e.message}`); }
  } else if (blocked) record.aiStatus = 'not-run-after-failure';
  summary.cases.push(record);
  // Preserve completed runs even if a later call fails.
  await writeFile(new URL('../artifacts/evaluation-results.json', import.meta.url), JSON.stringify(summary, null, 2));
}
const completed = summary.cases.filter(c => c.aiStatus === 'completed');
summary.completed = completed.length; summary.passed = completed.filter(c => c.score.passed).length;
summary.estimatedCost = completed.every(c => c.result.cost) && completed.length ? {
  lower: completed.reduce((sum, c) => sum + c.result.cost.lower, 0), upper: completed.reduce((sum, c) => sum + c.result.cost.upper, 0),
} : null;
summary.blocked = blocked;
await writeFile(new URL('../artifacts/evaluation-results.json', import.meta.url), JSON.stringify(summary, null, 2));
console.log(`${summary.mode}: ${completed.length}/${cases.length} model runs complete. Results: artifacts/evaluation-results.json`);
if (blocked) process.exitCode = 1;
