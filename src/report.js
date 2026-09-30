import { readFile } from 'node:fs/promises';
import { analyze, ADDRESS } from './analysis.js';
import { sampleTransactions, SAMPLE_ADDRESS } from './sample.js';
import { fetchTransactions, fetchTokenTransfers } from './providers.js';
import { whatIf } from './scenarios.js';

const readJson = path => readFile(new URL(`../data/${path}`, import.meta.url), 'utf8').then(JSON.parse);

// Builds a report for sample, recorded, or live data. Sample and recorded reports are
// deterministic, so endpoints can rebuild them without server-side state.
export async function buildReport(input, { publicDemo = false, etherscanKey } = {}) {
  const sample = input.source === 'sample', recorded = input.source === 'recorded';
  if (!sample && !recorded && input.source !== 'live') throw new Error('Choose sample, recorded, or live data.');
  if (publicDemo && !sample && !recorded) { const e = new Error('Fresh address queries are unavailable in this public demo. Use the sample or recorded Ethereum data.'); e.status = 403; throw e; }
  if (!sample && !recorded && (!ADDRESS.test(input.address || '') || input.consent !== true)) throw new Error('Enter a valid address and confirm permission to query it.');
  if (!sample && !recorded && !etherscanKey) throw new Error('Live data needs ETHERSCAN_API_KEY in the server .env file. The sample needs no key.');
  const snapshot = recorded ? await readJson('lido-mainnet-snapshot.json') : null;
  const address = snapshot?.address || (sample ? SAMPLE_ADDRESS : input.address);
  const windowDays = Number(input.days || 90);
  if (![30, 60, 90].includes(windowDays)) throw new Error('Choose a 30, 60, or 90 day window.');
  const end = snapshot?.end || (sample ? Date.parse('2026-09-30T23:59:59Z') / 1000 : Math.floor(Date.now() / 1000));
  const start = recorded ? snapshot.start : end - windowDays * 86400;
  let transactions, fetchedCount, tokenFetchedCount = null;
  if (snapshot) { transactions = snapshot.transactions; fetchedCount = transactions.length; }
  else if (sample) { transactions = sampleTransactions(); fetchedCount = transactions.filter(t => !t.asset).length; tokenFetchedCount = transactions.length - fetchedCount; }
  else {
    const [normal, tokens] = await Promise.all([fetchTransactions(address, etherscanKey), fetchTokenTransfers(address, etherscanKey)]);
    transactions = [...normal, ...tokens.rows]; fetchedCount = normal.length; tokenFetchedCount = tokens.fetched;
  }
  const report = analyze({ address, transactions, start, end, source: recorded ? 'live' : input.source, fetchedCount, tokenFetchedCount });
  if (recorded) {
    report.source = 'recorded'; report.recordedAt = snapshot.generatedAt; report.provenance = snapshot.provenance;
    report.originalFetchMs = snapshot.elapsedMs;
    report.chainVerification = await readJson('lido-chain-verification.json');
  }
  report.days = windowDays;
  report.whatIf = whatIf(report);
  return report;
}

// A saved model run is replayed only for the exact transaction set it was recorded on.
export async function recordedModelRun(report) {
  const file = await readJson('model-runs.json').catch(() => null);
  const run = file?.runs?.[report.source === 'sample' ? `sample-${report.days}` : report.source];
  if (!run) return null;
  const ids = report.transactions.map(t => t.id).sort().join(',');
  if (ids !== [...run.transactionIds].sort().join(',')) return null;
  return { ...run.result, recorded: true, recordedAt: file.recordedAt };
}
