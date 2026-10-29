# Glass

The bubble map with receipts. Paste any Solana token and see who really holds it. Every link between two wallets opens the transaction that proves it.

Glass shows data, never verdicts. It does not investigate people, it does not take labels in private, and every rule it applies is in this repository.

## How a scan works

1. **Holders.** Every token account of the mint (`getTokenAccounts`), summed per owner. The top 100 are mapped. Owners that are program-derived addresses (bonding curves, pool vaults, lockers) are drawn as rings and never linked or scored.
2. **Wallet history.** For each wallet, its last 60 transactions including its token accounts (`getTransactionsForAddress`, `tokenAccounts: "balanceChanged"`), biggest holders first, all in parallel under one rate limiter. For a young wallet this is its whole history, so funding, first buy, reload and transfers come from one read.
3. **Funding.** The first SOL the wallet ever received. For older wallets read separately (oldest first). Cached forever: it can't change.
4. **First buy.** The oldest transactions of the wallet's own token accounts, falling back to `getSignaturesForAddress` + `getTransaction`. From the first receipt: slot, fee payer, Jito tip, SOL spent, and whether the tokens came from a pool or from another wallet.
5. **Reload.** The last SOL the wallet received before that first buy. Aged wallets hide behind old funding; the reload is what paid for the buy.
6. **Links**, each with its transaction signature:
   - **funded**: one top holder (or the deployer) sent another its first SOL
   - **same funder**: 2+ top holders share a funder with no known name or type (exchanges never link)
   - **token transfer**: a holder's first tokens came straight from another holder
   - **fee paid by**: another holder, the deployer, or one unnamed wallet paying for 2+ holders paid the fee of a first buy
   - **loaded before buying**: the reload came from another holder, the deployer, or one unnamed wallet shared by 2+ holders (within 72h)
   - **exchange batch**: 3+ reloads from the same exchange hot wallet, at most 10 minutes apart, amounts within 10%
   - **moved**: any transfer between two top holders, of any token or SOL; and middlemen, unnamed wallets that sent to or collected from 2+ holders
   - one transaction draws one line: when it fits several rules, the strongest one shows
7. **Cohorts.** 3+ first buys within 2 slots, or 2+ in the token's creation block, rated by shared fee payer, same size (within 12%), same Jito tip, fresh wallets and reloads under 6h before buying. This catches bundles that never transfer between their wallets.
8. **Score.** 100 minus capped penalties for top-10 share, linked share, cohort share, deployer share and fresh wallets.

All thresholds live in [`src/config/site.ts`](src/config/site.ts). All rules live in [`src/lib/graph.ts`](src/lib/graph.ts) and are pinned by [`test/graph.test.ts`](test/graph.test.ts). The live site renders its [method page](src/app/method/page.tsx) from the same constants.

## Layout

```
src/
  app/          routes: /, /t/[mint], /method, /api/map, /api/v1/map (public, CORS), /api/card (share image)
  components/   map canvas, map screen, chrome, search
  config/       thresholds, score rules, known program and tip accounts
  lib/          helius client, scan pipeline, graph rules, layout, cache
test/           unit tests and a mainnet-shaped mock of Helius
```

## Run it

```
cp .env.example .env.local     # add HELIUS_API_KEY
npm install
npm run dev
```

Offline, against the mock chain:

```
npx tsx test/mock-helius.ts    # prints a mint
HELIUS_API_KEY=x HELIUS_RPC_URL=http://127.0.0.1:8899 HELIUS_API_URL=http://127.0.0.1:8899 npm run dev
```

Tests: `npm test`. Types: `npm run lint`.

## Public API

```
GET /api/v1/map/{mint}
```

Returns the map as JSON, open CORS, no key. Cached maps are served for 90 seconds. Uncached scans are limited per IP and per day. Add `?stream=1` for NDJSON: progress lines `{ "stage", "done", "total" }`, partial maps `{ "partial": map }` as soon as holders are known and again as links land, then one `{ "result": map }` or `{ "error": { "code", "message" } }`.

## Speed and cost

The bubbles are on screen as soon as holders are read, under a second. Links then land live. All chain reads go through one pacer per Helius limit class ([`src/lib/limiter.ts`](src/lib/limiter.ts)), so a scan runs at your plan's full rate and never loses time to 429s. Set the rates to your plan:

| Plan | HELIUS_RPC_RPS | HELIUS_DAS_RPS | HELIUS_WALLET_RPS |
|---|---|---|---|
| Developer | 45 | 9 | 9 |
| Business | 190 | 45 | 45 |
| Professional | 480 | 95 | 95 |

A fresh scan of 100 young wallets is about 110 calls: roughly 2.5 seconds on Developer, under 1 second on Business. Older wallets add up to two calls each. History reads cost 10 credits each, so a fresh scan is about 1,500 to 3,500 credits. Funding and first buys are cached permanently and histories for 6 hours, so a rescan, or a wallet already seen in another token, is close to free.

## License

MIT
