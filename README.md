# Wallet Privacy Mirror

[Open the demo](https://wallet-privacy-mirror.vercel.app)

Inspect public ETH transfers for an Ethereum address. Each finding includes the transactions behind it.

The report shows repeated addresses, transfer amounts, and activity over time. It separates observed facts from possible explanations and unknown information.

An Ethereum address does not establish a person's identity. Regular payments do not establish salary, employment, or payment purpose.

## Try the report

The public site offers two data sources:

- **Sample:** invented transfers for exploring the interface.
- **Recorded (Lido):** 100 real ETH receipts to the Lido Execution Layer Rewards Vault.

Select a finding, address, or activity bar to inspect its transactions. Real transactions link to Etherscan. You can filter the evidence and export the report as JSON.

The public site disables fresh address queries and model comparison. Visitors cannot spend the owner's Etherscan or OpenAI API balance.

## Run locally

Use Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The sample loads without API keys.

## Query an address

Copy the configuration template:

```sh
cp .env.example .env
```

Add an `ETHERSCAN_API_KEY` to `.env`. Restart the server.

Select **Address** and enter an address you own, have permission to inspect, or know from public organization documentation.
Select the permission checkbox, then select **Analyze**.

Etherscan receives the address. The server fetches the latest 100 normal transactions on Ethereum mainnet, then filters them by the selected period.
The report can miss earlier activity within that period. When the 100-record limit applies, a notice appears.

Keys stay on the server. Never add `.env` to Git.

### What a query reveals

A live query is itself a disclosure.
Etherscan receives the queried address, your API key, and the IP address of the machine running the server.
Etherscan can associate that request with other addresses queried from the same key or IP address.
The request shows interest in that address, which matters most when the address is your own.

This project does not hide queries from Etherscan.
The sample and recorded modes make no external requests.

## What the report measures

Only successful, positive-value ETH transfers are included. Token transfers, internal calls, fees, self-transfers, and other chains are excluded.

| Finding | Rule |
| --- | --- |
| Repeated address | At least three transfers with the same address |
| Outgoing concentration | ETH sent to one recipient divided by all outgoing ETH |
| Activity timing | The busiest fixed three-hour UTC period, with at least five transfers |
| Regular transfers of a similar amount | At least three transfers in one direction, with similar amounts and regular intervals |

Recurring intervals average at least five days. Each interval stays within 20% of the mean.
The amount spread stays within 5% of the smallest amount. These thresholds are demonstration rules, not a tested classifier.

Amounts are calculated with integer wei. Evidence rows retain exact ETH values. Summary amounts round to four decimal places.

## Recorded Ethereum data

The example address is `0x388c818ca8b9251b393131c08a736a67ccb19297`.
[Lido documents it as the Execution Layer Rewards Vault](https://docs.lido.fi/deployed-contracts/).
It is a protocol contract, not a personal wallet.

The snapshot contains 100 receipts from seven addresses between September 26 and September 29, 2026.
An independent Ethereum RPC matched every recorded transaction's sender, recipient, value, timestamp, successful receipt, canonical block, and finality.
These checks establish transaction data. They do not establish payment purpose or complete history.

See [the recorded results](LIVE_RESULTS.md) and the JSON files in `data/`.

To repeat the chain checks:

```sh
npm run verify:chain
```

This command queries an Ethereum RPC and updates the chain check file.

## Optional model comparison

For local comparison, add `OPENAI_API_KEY` to `.env` and restart the server.
The default model is `gpt-6.1-sol`. You can change `OPENAI_MODEL` in `.env`.

Select **Compare with model** and read the disclosure before starting the request.
OpenAI receives transaction addresses, IDs, amounts, timestamps, and recurring-transfer candidates. API charges can apply.

The model selects existing candidates or proposes amount and timing patterns. Code checks each proposal against its cited transactions.
Displayed claims use fixed text. Rejected proposals remain visible for inspection.

The request uses `store: false`. This does not guarantee zero provider retention.
The interface reports returned token usage and an estimated cost. This project has no successful live model comparison.

## Data handling

The local server listens on `127.0.0.1`. It holds at most 50 reports in memory for up to 15 minutes.
There is no database, wallet connection, transaction signing, or application analytics.
Vercel manages hosting request logs for the public deployment.

Vercel deployments always disable fresh queries and model requests. Provider keys in the deployment environment cannot enable these requests.
Do not upload local keys. The `.vercelignore` file excludes local environment files and generated recordings.

The implementation uses [Vercel Node.js Functions](https://vercel.com/docs/functions/configuring-functions/runtime) for reports and serves the interface as static files.

## Checks

```sh
npm test
npm run test:e2e
```

Browser tests require Google Chrome. Playwright starts the local server.
Provider tests use mock responses and make no paid requests.

To prepare the six-case model evaluation without API calls:

```sh
npm run evaluate
```

To run the paid evaluation locally:

```sh
npm run evaluate -- --with-ai
```

This command makes up to six paid requests. Results are saved in `artifacts/`, which Git excludes.

## Code

| File | Purpose |
| --- | --- |
| `src/analysis.js` | ETH totals, pattern rules, and evidence |
| `src/verification.js` | Checks for model proposals |
| `src/providers.js` | Etherscan and OpenAI requests |
| `server.js` | HTTP handler and local server |
| `api/[action].js` | Vercel function entry point |
| `public/app.js` | Report interface and evidence controls |
| `public/report-view.js` | Report summary and timeline buckets |

## License

[MIT](LICENSE)
