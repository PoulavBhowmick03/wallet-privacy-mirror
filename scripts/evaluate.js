import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { evaluationCases, scoreResult } from '../src/evaluation-cases.js';
import { runAI } from '../src/providers.js';

const withAI = process.argv.includes('--with-ai');
const runsArg = process.argv.indexOf('--runs'), runs = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 1;
if (!Number.isInteger(runs) || runs < 1 || runs > 5) throw new Error('--runs must be between 1 and 5.');
const model = process.env.OPENAI_MODEL || 'gpt-6.1-sol';
const snapshot = JSON.parse(await readFile(new URL('../data/lido-mainnet-snapshot.json', import.meta.url), 'utf8'));
const cases = evaluationCases(snapshot);
const summary = { createdAt: new Date().toISOString(), model, mode: withAI ? 'live-model-evaluation' : 'plan-only', runsPerCase: runs,
  scope: `${cases.length} predefined cases, ${runs} model attempt(s) per case. Category coverage after pattern checks; not general accuracy or unconstrained inference. Synthetic cases are invented; the Lido case contains recorded public transactions. Near-miss cases test whether evidence checks reject over-claims.`, cases: [] };
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const save = () => writeFile(new URL('../artifacts/evaluation-results.json', import.meta.url), JSON.stringify(summary, null, 2));
let blocked = null;
for (const item of cases) {
  const record = { id: item.id, description: item.description, expectedPatterns: item.expectedPatterns, expectedRecurring: item.expectedRecurring,
    transfers: item.report.transactions.length, baselineFindings: item.report.findings.filter(f => f.status !== 'unknown').length,
    baselineRecurring: item.report.interpretations.length, attempts: [] };
  for (let n = 0; withAI && n < runs; n++) {
    if (blocked) { record.attempts.push({ aiStatus: 'not-run-after-failure' }); continue; }
    try {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured.');
      const ai = await runAI(item.report, process.env.OPENAI_API_KEY, model);
      const score = scoreResult(item, ai);
      record.attempts.push({ aiStatus: 'completed', result: ai, score });
      console.log(`${item.id} #${n + 1}: ${score.passed ? 'PASS' : 'FAIL'}; ${ai.proposed} proposed, ${ai.accepted.length} accepted, ${ai.rejected.length} rejected; ${ai.elapsedMs} ms`);
    } catch (e) { blocked = e.message; record.attempts.push({ aiStatus: 'failed', error: e.message }); console.log(`${item.id} #${n + 1}: ${e.message}`); }
  }
  summary.cases.push(record);
  await save(); // Preserve completed runs even if a later call fails.
}
const done = summary.cases.flatMap(c => c.attempts.filter(a => a.aiStatus === 'completed').map(a => ({ ...a, id: c.id })));
summary.completed = done.length; summary.passed = done.filter(a => a.score.passed).length;
summary.proposed = done.reduce((n, a) => n + a.result.proposed, 0);
summary.accepted = done.reduce((n, a) => n + a.result.accepted.length, 0);
summary.rejected = done.reduce((n, a) => n + a.result.rejected.length, 0);
summary.rejections = done.flatMap(a => a.result.rejected.map(r => ({ case: a.id, category: r.category, reason: r.reason })));
summary.estimatedCost = done.length && done.every(a => a.result.cost) ? {
  lower: done.reduce((sum, a) => sum + a.result.cost.lower, 0), upper: done.reduce((sum, a) => sum + a.result.cost.upper, 0) } : null;
summary.blocked = blocked;
await save();
console.log(`${summary.mode}: ${summary.passed}/${summary.completed} attempts passed; ${summary.proposed} proposals, ${summary.accepted} accepted, ${summary.rejected} rejected. Results: artifacts/evaluation-results.json`);
if (blocked) process.exitCode = 1;
