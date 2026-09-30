import { amountText } from './analysis.js';

export const PATTERNS = ['amount_reuse', 'activity_burst', 'inbound_outbound_sequence'];
export const PATTERN_RULES = {
  amount_reuse: 'At least two outgoing transfers of exactly the same amount of the same asset (compare asset and baseUnits) to at least two different recipients.',
  activity_burst: 'At least three distinct transfers within a six-hour span.',
  inbound_outbound_sequence: 'Exactly two transfers: an incoming transfer followed strictly later by an outgoing transfer within 24 hours. This is temporal order only, not evidence that the received funds were forwarded.',
};

// The model supplies a category and evidence IDs, never displayed prose.
// Acceptance means the typed pattern holds in the fetched records, not a motive or identity.
export function verifyProposals(proposals, report) {
  if (!Array.isArray(proposals) || proposals.length > 5) throw new Error('The model returned an invalid proposal list.');
  const accepted = [], rejected = [], seen = new Set();
  const byId = new Map(report.transactions.map(t => [t.id, t]));
  for (const [index, proposal] of proposals.entries()) {
    const id = `proposal-${index + 1}`;
    const reject = reason => rejected.push({ id, reason, category: PATTERNS.includes(proposal?.category) ? proposal.category : 'unsupported',
      evidence: Array.isArray(proposal?.evidence) ? proposal.evidence.filter(e => typeof e === 'string' && byId.has(e)).slice(0, 100) : [] });
    if (!proposal || Object.keys(proposal).sort().join(',') !== 'category,evidence' || !PATTERNS.includes(proposal.category)) { reject('Unsupported claim shape or category. No free-form claims are accepted.'); continue; }
    if (!Array.isArray(proposal.evidence) || proposal.evidence.length < 2 || proposal.evidence.length > 100 || new Set(proposal.evidence).size !== proposal.evidence.length) { reject('Evidence must contain 2-100 distinct transaction IDs.'); continue; }
    if (proposal.evidence.some(e => typeof e !== 'string' || !byId.has(e))) { reject('An evidence ID is outside this report.'); continue; }
    const rows = proposal.evidence.map(e => byId.get(e)).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    let evidence = rows.map(t => t.id), title, body, key;
    if (proposal.category === 'amount_reuse') {
      const asset = t => t.asset || 'ETH';
      if (rows.some(t => t.from.toLowerCase() !== report.address || asset(t) !== asset(rows[0]) || BigInt(t.wei) !== BigInt(rows[0].wei)) || new Set(rows.map(t => t.to.toLowerCase())).size < 2) { reject('The cited transfers are not equal-value outgoing transfers of one asset to distinct recipients.'); continue; }
      // Expand to all matching rows, so subsets cannot inflate the finding count.
      const matching = report.transactions.filter(t => t.from.toLowerCase() === report.address && asset(t) === asset(rows[0]) && BigInt(t.wei) === BigInt(rows[0].wei));
      evidence = matching.map(t => t.id); key = `amount_reuse:${asset(rows[0])}:${BigInt(rows[0].wei)}`;
      title = `The same ${asset(rows[0])} amount went to different addresses`;
      body = `${matching.length} outgoing transfers of exactly ${amountText(rows[0])} went to ${new Set(matching.map(t => t.to.toLowerCase())).size} distinct recipients in the fetched window. Equal amounts do not establish shared ownership or payment purpose.`;
    } else if (proposal.category === 'activity_burst') {
      const span = rows.at(-1).timestamp - rows[0].timestamp;
      if (rows.length < 3 || span > 6 * 3600) { reject('The cited records do not contain at least three transfers within six hours.'); continue; }
      // Merge overlapping burst proposals, rather than counting every subset.
      if (accepted.some(f => f.category === 'activity_burst' && f.evidence.some(e => evidence.includes(e)))) { reject('This burst overlaps an already accepted burst.'); continue; }
      key = `activity_burst:${evidence.slice().sort().join(',')}`;
      title = 'Several transfers occurred close together';
      body = `${rows.length} cited transfers occurred within ${Math.ceil(span / 60)} minutes. This records a burst in the fetched activity, not evidence of a single person, session, or automated process.`;
    } else {
      const gap = rows.length === 2 ? rows[1].timestamp - rows[0].timestamp : 0;
      if (rows.length !== 2 || rows[0].to.toLowerCase() !== report.address || rows[1].from.toLowerCase() !== report.address || gap <= 0 || gap > 86400) { reject('The records are not an incoming transfer followed by an outgoing transfer within 24 hours.'); continue; }
      key = `inbound_outbound_sequence:${evidence.join(',')}`;
      title = 'An outgoing transfer followed a receipt';
      body = `A receipt of ${amountText(rows[0])} preceded an outgoing transfer of ${amountText(rows[1])} by ${Math.ceil(gap / 60)} minutes. Timing alone does not show that the same funds moved onward or that these transactions are related.`;
    }
    if (seen.has(key)) { reject('Duplicate of an already accepted pattern.'); continue; }
    seen.add(key);
    accepted.push({ id, category: proposal.category, status: 'observed', title, body, evidence,
      method: PATTERN_RULES[proposal.category], verification: 'Pattern checked against fetched records. Payment purpose and ownership remain unknown.' });
  }
  return { accepted, rejected, proposed: proposals.length };
}
