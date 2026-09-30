// Deliberately invented data. These IDs are not Ethereum transaction hashes.
export const SAMPLE_ADDRESS = '0x1111111111111111111111111111111111111111';
const peers = ['2', '3', '4', '5', '6', '7'].map(n => `0x${n.repeat(40)}`);
export function sampleTransactions() {
  const rows = [];
  function add(day, hour, peer, eth, direction = 'out') {
    const [whole, fraction = ''] = eth.split('.');
    rows.push({ id: `sample-${String(rows.length + 1).padStart(3, '0')}`, from: direction === 'out' ? SAMPLE_ADDRESS : peer,
      to: direction === 'out' ? peer : SAMPLE_ADDRESS, wei: `${BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'))}`,
      timestamp: Date.parse(`2026-${day}T${hour}:00:00Z`) / 1000, failed: false, synthetic: true });
  }
  ['07-03', '08-02', '09-01'].forEach(d => add(d, '09', peers[0], '0.42'));
  ['07-06', '07-13', '07-20', '07-27', '08-03', '08-10', '08-17', '08-24', '08-31', '09-07', '09-14', '09-21'].forEach((d, i) => add(d, '10', peers[1], i % 2 ? '0.08' : '0.081'));
  ['07-09', '08-09', '09-09'].forEach(d => add(d, '09', peers[2], '1.2', 'in'));
  // A synthetic burst gives the model a pattern absent from the baseline report.
  ['10', '11', '12'].forEach((hour, i) => add('07-16', hour, peers[3 + i], ['0.12', '0.035', '0.24'][i]));
  add('09-23', '19', peers[3], '0.017');
  add('09-24', '15', peers[4], '0.06', 'in');
  add('09-25', '10', peers[5], '0.013');
  // A synthetic stablecoin series: 1,500 USDC to one address on the fifth of each month.
  const landlord = `0x${'8'.repeat(40)}`;
  ['07-05', '08-05', '09-05'].forEach(d => rows.push({ id: `sample-${String(rows.length + 1).padStart(3, '0')}`, from: SAMPLE_ADDRESS, to: landlord,
    wei: '1500000000', asset: 'USDC', decimals: 6, token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    timestamp: Date.parse(`2026-${d}T08:00:00Z`) / 1000, failed: false, synthetic: true }));
  return rows.sort((a, b) => a.timestamp - b.timestamp);
}
