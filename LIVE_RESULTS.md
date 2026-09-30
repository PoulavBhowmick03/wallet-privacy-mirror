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

Model: `gpt-6.1-sol` through the OpenAI Responses API, with `store: false`, low reasoning effort, and a strict JSON schema.
Runs recorded on September 30, 2026.

### Fixed evaluation

11 cases, 3 attempts each, 33 requests. Full results: [data/model-evaluation.json](data/model-evaluation.json).

| Measurement | Result |
| --- | --- |
| Attempts that matched the expected patterns | 33 of 33 |
| Near-miss attempts with a false finding | 0 of 15 |
| Model proposals | 12 |
| Proposals that passed the evidence checks | 12 |
| Proposals rejected by the evidence checks | 0 |
| Median request time | 2086 ms (range 1671 to 11722 ms) |
| Estimated cost, all 33 requests | $0.107 to $0.126 |

The model made no over-claim in these cases, so the evidence checks rejected nothing in live runs.
Unit tests confirm that the checks reject each near-miss pattern.
Eleven fixed cases do not measure general model accuracy.

### Saved runs on the public site

| Data | Proposals | Passed checks | Hypotheses selected | Time | Tokens in / out | Estimated cost |
| --- | --- | --- | --- | --- | --- | --- |
| Sample, 90 days | 2 | 2 | 4 of 4 | 3966 ms | 4079 / 143 | $0.0096 to $0.0116 |
| Recorded Lido data | 1 | 1 | none available | 8201 ms | 20271 / 532 | $0.0378 to $0.0458 |

Costs are estimates from returned token counts, not billed amounts.

## View the records

Select **Recorded (Lido)** in the app. Evidence controls list the saved transactions and link to Etherscan.
The report loads saved data without a new Etherscan request.
