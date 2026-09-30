import { readFile, writeFile } from 'node:fs/promises';

const endpoint = 'https://ethereum-rpc.publicnode.com';
const report = JSON.parse(await readFile(new URL('../data/lido-mainnet-snapshot.json', import.meta.url), 'utf8'));
async function rpc(method, params) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}.`);
  const data = await response.json();
  if (data.error || data.result == null) throw new Error(`RPC did not return ${method}.`);
  return data.result;
}
const started = performance.now();
const chainId = await rpc('eth_chainId', []);
if (chainId !== '0x1') throw new Error('Independent RPC is not on Ethereum mainnet.');
const finalized = await rpc('eth_getBlockByNumber', ['finalized', false]);
const code = await rpc('eth_getCode', [report.address, 'finalized']);
const results = [];
for (let offset = 0; offset < report.transactions.length; offset += 5) {
  const batch = await Promise.all(report.transactions.slice(offset, offset + 5).map(async t => {
    try {
      const tx = await rpc('eth_getTransactionByHash', [t.id]);
      const receipt = await rpc('eth_getTransactionReceipt', [t.id]);
      const block = await rpc('eth_getBlockByHash', [tx.blockHash, false]);
      const canonical = await rpc('eth_getBlockByNumber', [tx.blockNumber, false]);
      const checks = { hash: tx.hash === t.id, from: tx.from.toLowerCase() === t.from,
        to: tx.to?.toLowerCase() === t.to, value: BigInt(tx.value).toString() === t.wei,
        timestamp: Number(BigInt(block.timestamp)) === t.timestamp, success: receipt.status === '0x1',
        receiptTransaction: receipt.transactionHash === t.id, blockHash: receipt.blockHash === tx.blockHash,
        canonicalBlock: canonical.hash === tx.blockHash, finalized: BigInt(tx.blockNumber) <= BigInt(finalized.number) };
      return { id: t.id, blockNumber: tx.blockNumber, checks, passed: Object.values(checks).every(Boolean) };
    } catch (e) { return { id: t.id, passed: false, error: e.message }; }
  }));
  results.push(...batch);
  if (results.length % 25 === 0) console.log(`${results.length}/${report.transactions.length} records checked`);
}
const verification = { rpc: endpoint, chainId, checkedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started),
  contractCodePresent: code !== '0x', finalizedBlock: finalized.number, results,
  scope: 'Every transaction in the saved 100-record snapshot. Compares addresses, exact wei value, block time, receipt success, canonical block, and finality. Does not establish payment purpose or completeness of wallet history.' };
await writeFile(new URL('../data/lido-chain-verification.json', import.meta.url), JSON.stringify(verification, null, 2));
console.log(`${results.filter(r => r.passed).length}/${results.length} transactions match independent mainnet RPC. Contract code present: ${verification.contractCodePresent}.`);
if (results.some(r => !r.passed)) process.exitCode = 1;
