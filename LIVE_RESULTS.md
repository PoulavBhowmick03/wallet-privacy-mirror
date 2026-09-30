# Recorded Ethereum results

Data fetched on September 29, 2026.

## Address and source

Lido Execution Layer Rewards Vault: `0x388c818ca8b9251b393131c08a736a67ccb19297`.

The name comes from [Lido's deployed contract documentation](https://docs.lido.fi/deployed-contracts/).
This is a public protocol contract, not a personal wallet.

## ETH transfers

| Measurement | Result |
| --- | --- |
| Successful ETH receipts | 100 |
| Sender addresses | 7 |
| ETH received | 9.968603357942605998 |
| Outgoing normal ETH transfers | 0 |
| First recorded transfer | 2026-09-26 01:28:47 UTC |
| Last recorded transfer | 2026-09-29 16:42:23 UTC |
| Fetch and report time | 2260 ms |

The fetch time is one measurement, not a latency benchmark.
The 100-record limit applies. This is not complete history for the selected 90-day period.
Internal transfers are outside this report.

One sender accounts for 68 receipts. Twenty receipts occurred between 09:00 and 12:00 UTC.
These observations do not establish a personal relationship or the owner's time zone.
The rules found no recurring-transfer candidate.

## Independent chain checks

[PublicNode's Ethereum RPC](https://ethereum-rpc.publicnode.com) matched all 100 records.
The checks cover sender, recipient, exact value, timestamp, successful receipt, canonical block, and finality.
The RPC returned chain ID 1 and contract code at this address.
The checks took 23699 ms.

Full records: [transaction snapshot](data/lido-mainnet-snapshot.json) and [chain checks](data/lido-chain-verification.json).

## Model comparison

No successful live model result is available. The attempted request returned no model output or token usage.
No model score, measured runtime, or measured token cost is claimed.
The evaluation script includes six predefined cases but no measured model scores.

## View the records

Select **Recorded (Lido)** in the app. Evidence controls list the saved transactions and link to Etherscan.
The report loads saved data without a new Etherscan request.
