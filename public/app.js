import { timelineBuckets, reportOverview } from './report-view.js';
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = a => `${a.slice(0, 6)}...${a.slice(-4)}`;
const date = seconds => new Date(seconds * 1000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const units = (value, decimals = 18) => { const n = BigInt(value), scale = 10n ** BigInt(decimals), fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, ''); return `${n / scale}${fraction ? `.${fraction}` : ''}`; };
const amount = t => `${units(t.wei, t.decimals ?? 18)} ${t.asset || 'ETH'}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
let report, aiResult, config = {}, source = 'sample', filter = 'observed', busy = false, evidenceIds = [], toastTimer, scenario = 'stealth';
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result;
}
function error(message) { $('error').textContent = message; $('error').classList.toggle('hidden', !message); }
function setSource(next, load = true) {
  if (busy) return;
  source = next; $('analyze').innerHTML = 'Analyze'; $('sample-mode').classList.toggle('selected', source === 'sample'); $('recorded-mode').classList.toggle('selected', source === 'recorded'); $('days').disabled = source === 'recorded'; $('live-mode').classList.toggle('selected', source === 'live');
  $('address').readOnly = source !== 'live'; $('address').value = source === 'sample' ? '0x1111111111111111111111111111111111111111' : source === 'recorded' ? '0x388c818ca8b9251b393131c08a736a67ccb19297' : '';
  $('sample-tag').classList.toggle('hidden', source !== 'sample'); $('live-consent').classList.toggle('hidden', source !== 'live'); $('live-check').checked = false;
  $('query-note').textContent = source === 'sample' ? 'Invented transactions for trying the tool. No external requests are made.'
    : source === 'recorded' ? 'Saved mainnet history of a Lido protocol contract. Loaded from disk; no external requests.' : config.live && config.publicDemo ? 'Sends the address to this site and to Etherscan, which returns the latest 100 normal transactions and 100 token transfers. The result stays in server memory for up to 5 minutes and is not saved. Lookups are rate-limited.' : config.live ? 'Fetches the latest 100 normal transactions and 100 token transfers from Etherscan, which receives the queried address. The model comparison is a separate opt-in.' : config.publicDemo ? 'Fresh address queries are unavailable in this public demo. Use the sample or recorded Ethereum data.' : 'Live queries need ETHERSCAN_API_KEY in .env. The sample and recorded data work without keys.';
  for (const id of ['sample-mode', 'recorded-mode', 'live-mode']) $(id).setAttribute('aria-pressed', $(id).classList.contains('selected'));
  if (source === 'live') $('address').focus(); else if (load) analyze();
}
function renderFindings() {
  const findings = report.findings.filter(f => f.status === filter);
  $('findings').innerHTML = findings.length ? findings.map(f => `<article class="finding ${f.status}"><span class="status ${f.status}"><i></i>${f.status === 'hypothesis' ? 'Hypothesis' : f.status === 'unknown' ? 'Unknown' : 'Observed'}</span><h4>${esc(f.title)}</h4><p>${esc(f.body)}</p>${f.evidence.length ? `<button class="evidence-button" data-finding="${esc(f.id)}">View ${f.evidence.length} transfer${f.evidence.length === 1 ? '' : 's'}</button>` : ''}</article>`).join('') : '<div class="empty">No findings meet these rules in this window.</div>';
  document.querySelectorAll('[data-finding]').forEach(button => button.addEventListener('click', () => { const f = report.findings.find(f => f.id === button.dataset.finding); showEvidence(f.title, f.evidence, f.method); }));
  document.querySelectorAll('[data-filter]').forEach(button => { const active = button.dataset.filter === filter; button.classList.toggle('active', active); button.setAttribute('aria-selected', active); button.tabIndex = active ? 0 : -1; });
}
function counterparty(t) {
  const address = t.from.toLowerCase() === report.address ? t.to : t.from;
  return t.synthetic ? `<span title="${esc(address)}">${esc(short(address))}</span>`
    : `<a href="https://etherscan.io/address/${esc(address)}" title="${esc(address)}" target="_blank" rel="noopener noreferrer">${esc(short(address))}</a>`;
}
function renderEvidence() {
  const query = $('evidence-search').value.trim().toLowerCase();
  const all = report.transactions.filter(t => evidenceIds.includes(t.id));
  const rows = all.filter(t => `${t.id} ${t.from} ${t.to} ${date(t.timestamp)} ${new Date(t.timestamp * 1000).toISOString()}`.toLowerCase().includes(query))
    .sort((a, b) => $('evidence-sort').value === 'newest' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);
  $('evidence-rows').innerHTML = rows.map(t => `<tr><td>${t.synthetic ? esc(t.id) : `<a href="https://etherscan.io/tx/${esc(t.hash || t.id)}" target="_blank" rel="noopener noreferrer">${esc(short(t.hash || t.id))}</a>`}</td><td>${date(t.timestamp)} ${new Date(t.timestamp * 1000).toISOString().slice(11, 16)}</td><td><span class="direction ${t.from.toLowerCase() === report.address ? 'out' : 'in'}">${t.from.toLowerCase() === report.address ? 'Sent' : 'Received'}</span></td><td>${counterparty(t)}</td><td>${esc(amount(t))}</td></tr>`).join('');
  $('evidence-count').textContent = `${rows.length} of ${all.length} transfers`;
  $('evidence-empty').classList.toggle('hidden', rows.length > 0);
}
function showEvidence(title, ids, method) {
  evidenceIds = ids; $('evidence-search').value = ''; $('evidence-sort').value = 'oldest';
  $('evidence-title').textContent = title; $('evidence-method').textContent = method;
  renderEvidence();
  $('evidence-note').textContent = report.source === 'sample' ? 'Synthetic evidence. These identifiers are fixture rows, not real Ethereum transactions. No explorer links are generated.' : 'Explorer links open Ethereum mainnet transactions on Etherscan. These are source records, not independent proof of a payment\'s purpose.';
  $('evidence-dialog').showModal();
}
function renderOverview() {
  const overview = reportOverview(report);
  $('report-title').textContent = report.source === 'recorded' ? 'Lido Execution Layer Rewards Vault' : report.source === 'sample' ? 'Sample wallet' : 'Address report';
  $('report-address').textContent = report.address;
  $('overview-title').textContent = overview.title; $('overview-body').textContent = overview.body;
  $('overview-evidence').classList.toggle('hidden', !overview.top);
  $('overview-evidence').onclick = () => showEvidence('Most frequent counterparty', overview.top.evidence, 'All analyzed transfers involving the most frequent counterparty. A connection between addresses does not establish a relationship between people.');
  $('timeline-range').textContent = overview.first == null ? 'No analyzed transfers' : `${date(overview.first)} - ${date(overview.last)} (${overview.observedDays} calendar-day span of fetched records)`;
  const buckets = timelineBuckets(report);
  if (!buckets.length) { $('timeline').innerHTML = '<div class="empty">No positive-value transfers to plot. Other tokens and internal calls remain outside this report.</div>'; return; }
  const peak = Math.max(...buckets.map(b => b.evidence.length)), width = 840, left = 28, chartWidth = 780, floor = 130, barWidth = Math.min(32, chartWidth / buckets.length - 10);
  const bars = buckets.map((b, i) => {
    const center = left + (i + .5) * chartWidth / buckets.length, incomingHeight = b.incoming / peak * 90, outgoingHeight = b.outgoing / peak * 90;
    const label = new Date(b.start * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const showLabel = buckets.length <= 7 || i % 2 === 0 || i === buckets.length - 1;
    return `<g class="timeline-bucket" ${b.evidence.length ? `role="button" tabindex="0" data-bucket="${i}" aria-label="Inspect ${b.evidence.length} transfers from ${esc(date(b.start))} to ${esc(date(b.end))}"` : ''}><title>${esc(date(b.start))}: ${b.incoming} received, ${b.outgoing} sent</title><rect class="timeline-hit" x="${center - chartWidth / buckets.length / 2}" y="22" width="${chartWidth / buckets.length}" height="112"/><rect class="timeline-received" x="${center - barWidth / 2}" y="${floor - incomingHeight}" width="${barWidth}" height="${incomingHeight}" rx="3"/><rect class="timeline-sent" x="${center - barWidth / 2}" y="${floor - incomingHeight - outgoingHeight}" width="${barWidth}" height="${outgoingHeight}" rx="3"/>${b.evidence.length ? `<text class="timeline-value" text-anchor="middle" x="${center}" y="${floor - incomingHeight - outgoingHeight - 8}">${b.evidence.length}</text>` : ''}${showLabel ? `<text class="timeline-label" text-anchor="middle" x="${center}" y="151">${esc(label)}</text>` : ''}</g>`;
  }).join('');
  $('timeline').innerHTML = `<svg viewBox="0 0 ${width} 165" role="group" aria-label="${buckets.length} activity periods; received and sent transfer counts"><line class="timeline-grid" x1="${left}" x2="${left + chartWidth}" y1="40" y2="40"/><line class="timeline-grid" x1="${left}" x2="${left + chartWidth}" y1="85" y2="85"/><line class="timeline-baseline" x1="${left}" x2="${left + chartWidth}" y1="130" y2="130"/>${bars}</svg>`;
  document.querySelectorAll('[data-bucket]').forEach(node => {
    const inspect = () => { const b = buckets[Number(node.dataset.bucket)]; showEvidence(`Transfers, ${date(b.start)}${b.start !== b.end - 86399 ? ` - ${date(b.end)}` : ''}`, b.evidence, 'Counts of analyzed transfers in this UTC period. Bars describe fetched records, not complete wallet history.'); };
    node.addEventListener('click', inspect); node.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); inspect(); } });
  });
}

function renderGraph() {
  const peers = report.peers.slice(0, 8), cx = 210, cy = 170;
  const nodes = peers.map((p, i) => { const angle = i / Math.max(peers.length, 1) * Math.PI * 2 - Math.PI / 2; return { ...p, x: cx + Math.cos(angle) * 142, y: cy + Math.sin(angle) * 119 }; });
  $('graph').innerHTML = `<svg viewBox="0 0 420 345" role="group" aria-label="Wallet transfer relationship map; use counterparty buttons to inspect evidence"><title>ETH transfer connections</title>${nodes.map(p => `<path class="graph-line" d="M ${cx} ${cy} Q ${(cx + p.x) / 2 + 15} ${(cy + p.y) / 2 - 10} ${p.x} ${p.y}"/>`).join('')}<circle class="graph-center" cx="${cx}" cy="${cy}" r="38"/><text class="graph-label-center" x="${cx}" y="${cy + 4}" text-anchor="middle">${report.source === 'recorded' ? 'This contract' : 'This address'}</text>${nodes.map((p, i) => `<g class="graph-node" role="button" tabindex="0" aria-label="Inspect ${p.count} transfers with ${p.address}" data-peer="${i}"><circle class="graph-peer" cx="${p.x}" cy="${p.y}" r="${15 + Math.min(p.count, 12) / 2}"/><text x="${p.x}" y="${p.y + 4}" text-anchor="middle" class="graph-label">${String(i + 1).padStart(2, '0')}</text><text x="${p.x}" y="${p.y + 34}" text-anchor="middle" class="graph-label">${esc(short(p.address))}</text><text x="${p.x}" y="${p.y + 47}" text-anchor="middle" class="graph-count-label">${p.count} transfer${p.count === 1 ? '' : 's'}</text></g>`).join('')}</svg>${report.peers.length > 8 ? `<p class="graph-truncation">Showing the 8 most frequent of ${report.peers.length} counterparties. Export includes all.</p>` : ''}`;
  $('graph-count').textContent = `${report.peers.length} address${report.peers.length === 1 ? '' : 'es'}`;
  $('graph-detail').textContent = peers.length ? 'Select an address to list its transfers.' : 'No positive-value ETH connections in this window.';
  document.querySelectorAll('[data-peer]').forEach(node => {
    const inspect = () => { const p = nodes[Number(node.dataset.peer)]; $('graph-detail').textContent = `${short(p.address)} | ${p.incoming} ETH in / ${p.outgoing} ETH out${p.tokenTransfers ? ` | ${plural(p.tokenTransfers, 'stablecoin transfer')}` : ''}`; showEvidence(`Transfers with ${short(p.address)}`, p.evidence, 'Every successful, positive-value ETH and stablecoin transfer between these two addresses in the analyzed window.'); };
    node.addEventListener('click', inspect); node.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); inspect(); } });
  });
}
function renderReport() {
  $('results').classList.remove('hidden'); document.body.classList.add('has-report'); $('data-badge').textContent = report.source === 'sample' ? 'Synthetic data' : report.source === 'recorded' ? 'Recorded mainnet snapshot' : 'Ethereum mainnet';
  $('report-range').textContent = `Window: ${date(report.start)} - ${date(report.end)}`;
  $('runtime').textContent = `${report.source === 'recorded' ? 'Loaded' : 'Analyzed'} in ${report.elapsedMs} ms`;
  $('provenance').classList.toggle('hidden', report.source !== 'recorded');
  if (report.source === 'recorded') {
    const checks = report.chainVerification.results;
    $('provenance').innerHTML = `This is a saved snapshot of the Lido Execution Layer Rewards Vault, a public protocol contract (<a href="https://docs.lido.fi/deployed-contracts/" target="_blank" rel="noopener noreferrer">address source</a>). It is not a fresh query or a person's wallet. Fetched ${esc(report.recordedAt)} in ${report.originalFetchMs} ms; ${checks.filter(r => r.passed).length} of ${checks.length} transactions matched an independent mainnet RPC.`;
  }
  $('cap-warning').classList.toggle('hidden', !report.capReached); $('cap-warning').textContent = 'The 100-transaction cap was reached. Earlier activity in this period may be missing. Findings describe the fetched sample only.';
  const coins = Object.entries(report.stats.tokens || {});
  const coinNote = report.coverage.stablecoins.fetched == null ? 'Not fetched for this snapshot' : coins.length ? coins.map(([k, v]) => `${k} ${Number(v.outgoing).toLocaleString('en-US')} out, ${Number(v.incoming).toLocaleString('en-US')} in`).join(' | ') : 'USDC, USDT, DAI';
  $('stats').innerHTML = [['Transfers', report.stats.transfers, '', 'Successful, positive value'], ['Counterparties', report.stats.counterparties, '', 'Distinct addresses'], ['Received', report.stats.incoming, 'ETH', 'Excludes fees'], ['Sent', report.stats.outgoing, 'ETH', 'Excludes fees'], ['Stablecoin transfers', report.stats.tokenTransfers, '', coinNote]].map(([label, value, unit, note]) => `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${esc(Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 }))}<small>${unit}</small></div><div class="stat-note">${note}</div></div>`).join('');
  for (const status of ['observed', 'hypothesis', 'unknown']) $(`${status}-count`).textContent = report.findings.filter(f => f.status === status).length;
  renderCoverage();
  filter = 'observed'; renderFindings(); renderGraph(); renderOverview(); renderScenario(); preparePresend();
  $('ai-result').classList.add('hidden'); $('ai-open').classList.toggle('hidden', Boolean(config.publicDemo));
  $('ai-open').textContent = config.ai ? 'Run live comparison' : 'Set up model comparison';
  $('ai-recorded').classList.toggle('hidden', !(report.source === 'recorded' || (report.source === 'sample' && report.days === 90)));
  $('method-content').innerHTML = `<p>${report.source === 'sample' ? 'Synthetic fixture: dates and transfers are invented, not claims about a real wallet.' : report.source === 'recorded' ? 'Source: a saved Etherscan V2 txlist snapshot on chain 1. Token transfers were not fetched for this snapshot.' : 'Source: Etherscan V2 txlist and tokentx on chain 1, latest 100 records each, descending. Token transfers count only for the USDC, USDT, and DAI contract addresses. Dates are filtered after fetching; earlier activity may be missing.'}</p>${report.limitations.map(l => `<p>${esc(l)}</p>`).join('')}<p>Amounts are calculated as integer wei. Displayed metrics round to four decimals; evidence rows retain exact amounts. Analysis is read-only. No wallet connection, signing, analytics, or database is used. Reports remain in server memory for up to 15 minutes (maximum 50 reports).</p><p>AI is a separate opt-in: addresses, transaction IDs, amounts, timestamps, and candidates are sent to OpenAI. The request uses store:false; this is not a guarantee of zero provider retention. The model selects existing hypotheses or proposes typed patterns with evidence IDs. Code checks amounts, timing, and direction. Displayed claims use fixed wording.</p><p>Additional findings must pass evidence checks. Additional means absent from the baseline, not beyond what rules could find. Cost is an estimate range derived from returned token usage, not an invoice. The range accounts for standard input vs. cache-write pricing.</p><p>API references: <a href="https://docs.etherscan.io/api-reference/endpoint/txlist" target="_blank" rel="noopener noreferrer">Etherscan normal transactions</a> | <a href="https://developers.openai.com/api/docs/models/gpt-6.1-sol" target="_blank" rel="noopener noreferrer">GPT-6.1 Sol</a> | <a href="https://developers.openai.com/api/docs/guides/structured-outputs" target="_blank" rel="noopener noreferrer">Structured outputs</a>.</p>`;
}
function renderAIResult(result) {
  const cost = result.cost ? `$${result.cost.lower.toFixed(5)}-$${result.cost.upper.toFixed(5)} estimated` : 'Cost unavailable for this model';
  const accepted = result.accepted || [], rejected = result.rejected || [];
  const metrics = `<div class="comparison-metrics"><div><strong>${result.proposed || 0}</strong><span>Model proposals</span></div><div><strong>${accepted.length}</strong><span>Passed checks</span></div><div><strong>${rejected.length}</strong><span>Rejected proposals</span></div></div>`;
  const cards = accepted.map(f => `<article class="finding ai-finding"><span class="status"><i></i>Model proposal, passed checks</span><h4>${esc(f.title)}</h4><p>${esc(f.body)}</p><button class="evidence-button" data-ai-evidence="${esc(f.id)}">View ${f.evidence.length} transfers</button></article>`).join('');
  $('ai-result').innerHTML = `${result.recorded ? `<p class="notice info">Recorded run from ${esc(date(Date.parse(result.recordedAt) / 1000))}. This is a saved API response for this exact data, not a new request.</p>` : ''}<p><strong>${esc(result.model)}</strong> | ${(result.elapsedMs / 1000).toFixed(2)} s | ${esc(cost)}</p>${metrics}<p>Baseline: ${report.interpretations.length} recurring-transfer hypotheses. AI selected: ${result.selections.length}.</p>${result.selections.length ? `<ul>${result.selections.map(s => `<li>${esc(s.title)} <button class="evidence-button" data-ai-selection="${esc(s.id)}">View evidence</button></li>`).join('')}</ul>` : '<p>The model selected no baseline hypotheses.</p>'}${cards || '<p>No additional patterns survived the checks.</p>'}${rejected.length ? `<details class="rejected-proposals"><summary>Show ${rejected.length} rejected proposal${rejected.length === 1 ? '' : 's'}</summary>${rejected.map(r => `<p><strong>${esc(r.id)} | ${esc(r.category)}</strong><br>${esc(r.reason)}${r.evidence.length ? `<br><button class="evidence-button" data-ai-rejected="${esc(r.id)}">View cited transfers</button>` : ''}</p>`).join('')}</details>` : ''}<p>${esc(result.note)}</p>${result.usage ? `<p>Input: ${result.usage.input_tokens} tokens | Cached: ${result.usage.input_tokens_details?.cached_tokens || 0} | Output: ${result.usage.output_tokens}</p>` : ''}${result.cost ? `<p>${esc(result.cost.note)}</p>` : ''}`;
  $('ai-result').classList.remove('hidden');
  document.querySelectorAll('[data-ai-evidence]').forEach(b => b.addEventListener('click', () => { const f = accepted.find(f => f.id === b.dataset.aiEvidence); showEvidence(f.title, f.evidence, `${f.method} ${f.verification}`); }));
  document.querySelectorAll('[data-ai-selection]').forEach(b => b.addEventListener('click', () => { const s = result.selections.find(s => s.id === b.dataset.aiSelection); showEvidence(s.title, s.evidence, 'AI selected this existing rule-backed hypothesis. Its evidence is the same as the baseline. Payment purpose remains unverified.'); }));
  document.querySelectorAll('[data-ai-rejected]').forEach(b => b.addEventListener('click', () => { const r = rejected.find(r => r.id === b.dataset.aiRejected); showEvidence(`Rejected ${r.id}`, r.evidence, `${r.reason} Only cited records present in this report are shown. This proposal is not an accepted finding.`); }));
}
function renderCoverage() {
  const c = report.coverage, coins = c.stablecoins.assets.join(', ');
  const tokenText = c.stablecoins.fetched == null ? `Stablecoin transfers were not fetched for this snapshot` : `${plural(c.stablecoins.analyzed, 'stablecoin transfer')} (${coins})`;
  const capText = report.source === 'live' ? ` from the latest ${c.eth.fetched} normal transactions and ${c.stablecoins.fetched} token transfers (100 maximum each)` : '';
  $('coverage').innerHTML = `<div><span class="coverage-label">Included</span>${plural(c.eth.analyzed, 'ETH transfer')}, ${esc(tokenText)}${capText}.</div><div><span class="coverage-label">Not visible here</span>Other tokens and NFTs, internal calls and smart-account activity, L2s and other chains, your other addresses, wallet and RPC metadata.</div>`;
}
function scenarioRows(rows, showKept) {
  const label = { removed: 'Removed', changed: 'Changed', kept: 'Unchanged', added: 'New' };
  return rows.filter(r => showKept || r.status !== 'kept').map(r => `<li class="diff ${r.status}"><span class="diff-tag">${label[r.status]}</span><div><strong>${esc(r.title)}</strong>${r.status === 'changed' || r.status === 'added' ? `<p>${esc(r.after)}</p>` : ''}</div></li>`).join('');
}
function renderScenario() {
  $('scenario-tabs').innerHTML = report.whatIf.map(s => `<button type="button" role="tab" data-scenario="${s.id}" class="${s.id === scenario ? 'selected' : ''}" aria-selected="${s.id === scenario}">${esc(s.label)}</button>`).join('');
  document.querySelectorAll('[data-scenario]').forEach(b => b.addEventListener('click', () => { scenario = b.dataset.scenario; renderScenario(); }));
  const s = report.whatIf.find(s => s.id === scenario);
  const parts = [s.removed && `removes ${plural(s.removed, 'finding')}`, s.changed && `changes ${plural(s.changed, 'finding')}`, s.added && `adds ${plural(s.added, 'finding')}`].filter(Boolean);
  const summary = parts.length ? parts.join(', ').replace(/^./, c => c.toUpperCase()) : 'Changes no finding';
  $('scenario-result').innerHTML = `<p class="scenario-summary">${summary}. ${s.kept} unchanged.</p><p class="muted">${esc(s.description)}</p><ul class="diff-list">${scenarioRows(s.rows, true)}</ul><p class="notice">${esc(s.caveat)}</p>`;
}
function preparePresend() {
  $('presend-result').innerHTML = ''; $('presend-error').classList.add('hidden');
  const series = report.findings.find(f => f.status === 'hypothesis' && f.key.startsWith('recurring:outgoing'));
  const rows = series ? report.transactions.filter(t => series.evidence.includes(t.id)) : [];
  if (rows.length) {
    const last = rows.at(-1), next = last.timestamp + Math.round((last.timestamp - rows[0].timestamp) / (rows.length - 1));
    $('presend-to').value = last.to; $('presend-amount').value = units(last.wei, last.decimals ?? 18); $('presend-asset').value = last.asset || 'ETH';
    $('presend-when').value = new Date(next * 1000).toISOString().slice(0, 16);
    $('presend-hint').textContent = 'Prefilled with the next transfer in a regular series from this report. Edit any field.';
  } else {
    $('presend-to').value = ''; $('presend-amount').value = ''; $('presend-asset').value = 'ETH';
    $('presend-when').value = new Date(report.end * 1000).toISOString().slice(0, 16);
    $('presend-hint').textContent = 'This report has no outgoing series to prefill. Enter a planned transfer.';
  }
}
async function checkPresend() {
  $('presend-error').classList.add('hidden'); $('presend-run').disabled = true;
  try {
    const own = report.source === 'live' ? { address: report.address, start: report.start, end: report.end,
      transactions: report.transactions.map(({ id, from, to, wei, timestamp, asset, decimals }) => ({ id, from, to, wei, timestamp, asset, decimals })) } : {};
    const result = await api('/api/presend', { ...own, source: report.source, days: report.days, reportId: report.id, to: $('presend-to').value.trim(),
      amount: $('presend-amount').value.trim(), asset: $('presend-asset').value, when: `${$('presend-when').value}:00Z` });
    const changed = result.rows.filter(r => r.status !== 'kept');
    $('presend-result').innerHTML = changed.length ? `<p class="scenario-summary">This transfer would change ${plural(changed.length, 'finding')}.</p><ul class="diff-list">${scenarioRows(result.rows, false)}</ul>`
      : '<p class="scenario-summary">No finding changes. This transfer adds nothing to a visible pattern in this window.</p>';
  } catch (e) { $('presend-error').textContent = e.message; $('presend-error').classList.remove('hidden'); }
  finally { $('presend-run').disabled = false; }
}
async function analyze() {
  if (busy) return;
  busy = true; error(''); $('results').classList.add('hidden'); $('loading').classList.remove('hidden'); $('analyze').disabled = true; $('report').setAttribute('aria-busy', 'true'); for (const id of ['sample-mode', 'recorded-mode', 'live-mode']) $(id).disabled = true;
  try { report = await api('/api/report', { source, address: $('address').value.trim(), days: Number($('days').value), consent: $('live-check').checked }); aiResult = null; renderReport(); }
  catch (e) { error(e.message); }
  finally { busy = false; $('loading').classList.add('hidden'); $('analyze').disabled = false; $('report').setAttribute('aria-busy', 'false'); for (const id of ['sample-mode', 'recorded-mode', 'live-mode']) $(id).disabled = id === 'live-mode' && !config.live && Boolean(config.publicDemo); }
}
$('wallet-form').addEventListener('submit', e => { e.preventDefault(); analyze(); });
$('presend-form').addEventListener('submit', e => { e.preventDefault(); checkPresend(); });
$('ai-recorded').addEventListener('click', async () => {
  $('ai-recorded').disabled = true;
  try { const result = await api('/api/ai-recorded', { source: report.source, days: report.days }); aiResult = result; renderAIResult(result); }
  catch (e) { $('ai-result').innerHTML = `<p class="error">${esc(e.message)}</p>`; $('ai-result').classList.remove('hidden'); }
  finally { $('ai-recorded').disabled = false; }
});
$('sample-mode').addEventListener('click', () => setSource('sample')); $('live-mode').addEventListener('click', () => setSource('live')); $('recorded-mode').addEventListener('click', () => setSource('recorded'));
document.querySelectorAll('[data-filter]').forEach(button => { button.addEventListener('click', () => { filter = button.dataset.filter; renderFindings(); }); button.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const tabs = [...document.querySelectorAll('[data-filter]')], index = tabs.indexOf(button), next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; next.click(); next.focus(); } }); });
$('evidence-close').addEventListener('click', () => $('evidence-dialog').close()); $('ai-close').addEventListener('click', () => $('ai-dialog').close());
$('method-nav').addEventListener('click', () => { $('boundaries').scrollIntoView({ behavior: 'smooth' }); $('method-details').open = true; });
$('export').addEventListener('click', () => { const blob = new Blob([JSON.stringify({ ...report, ai: aiResult }, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `mirror-${report.source}-report.json`; a.click(); URL.revokeObjectURL(url); });
$('ai-open').addEventListener('click', () => { $('ai-check').checked = false; $('ai-error').classList.add('hidden'); $('ai-config-note').textContent = config.ai ? `Model: ${config.model}. API access and billing are determined by your OpenAI account.` : 'Add OPENAI_API_KEY to .env and restart the server. Default model: gpt-6.1-sol. Keys stay on the server.'; $('ai-run').disabled = !config.ai; $('ai-dialog').showModal(); });
$('ai-run').addEventListener('click', async () => {
  $('ai-error').classList.add('hidden');
  if (!$('ai-check').checked) { $('ai-error').textContent = 'Confirm the disclosure before making this API request.'; $('ai-error').classList.remove('hidden'); return; }
  const activeReport = report; $('ai-run').disabled = true; $('ai-run').textContent = 'Comparing...';
  try {
    const result = await api('/api/ai', { reportId: activeReport.id, consent: true });
    if (report.id !== activeReport.id) throw new Error('The report changed during comparison. Run the comparison for the current report.');
    aiResult = result; renderAIResult(result); $('ai-dialog').close();
  } catch (e) { $('ai-error').textContent = e.message; $('ai-error').classList.remove('hidden'); }
  finally { $('ai-run').disabled = !config.ai; $('ai-run').textContent = 'Run comparison'; }
});
try { config = await api('/api/config');
  if (config.publicDemo) {
    $('live-mode').disabled = !config.live;
    $('data-handling').textContent = config.live
      ? 'Address lookups go to Etherscan and are not saved by this site. No wallet connection or model requests. Page views are counted with Vercel Web Analytics, which never sees looked-up addresses. Hosting request logs are managed by Vercel.'
      : 'Sample and recorded data only. No wallet connection or paid API requests. Page views are counted with Vercel Web Analytics. Hosting request logs are managed by Vercel.';
    $('ai-desc').textContent = 'This public demo replays saved model runs and makes no model requests. Run the project locally with your own API key for live comparisons.';
  }
  $('ai-model').textContent = `(${config.modelName || config.model})`;
  const ev = config.evaluation;
  if (ev) $('eval-line').textContent = `Evaluation: ${ev.passed} of ${ev.completed} attempts passed across ${ev.cases} fixed cases, ${ev.nearMiss} of them near-miss traps. ${ev.proposed} proposals, ${ev.accepted} passed checks, ${ev.rejected} rejected. Estimated cost $${ev.cost.lower.toFixed(2)}-$${ev.cost.upper.toFixed(2)}.`;
  setSource('sample', false); await analyze(); } catch (e) { error(`Could not load the report: ${e.message}`); }

$('evidence-search').addEventListener('input', renderEvidence);
$('evidence-sort').addEventListener('change', renderEvidence);
$('copy-address').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(report.address); $('toast').textContent = 'Address copied'; }
  catch { $('toast').textContent = 'Clipboard unavailable. Select the address to copy it.'; }
  clearTimeout(toastTimer); $('toast').classList.remove('hidden'); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 2500);
});
