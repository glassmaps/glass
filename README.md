# Glass

The bubble map with receipts. Paste any Solana token and see who really holds it. Every link between two wallets opens the transaction that proves it.

Glass shows data, never verdicts. It does not investigate people, it does not take labels in private, and every rule it applies is in this repository.

## How a scan works

1. **Holders.** Every token account of the mint (`getTokenAccounts`), summed per owner. The top 100 are mapped. Owners that are program-derived addresses (bonding curves, pool vaults, lockers) are drawn as rings and never linked or scored.
2. **Funding.** For each wallet, the first SOL it ever received (`/v1/wallet/{address}/funded-by`). Cached forever: it can't change.
3. **First buy.** For each wallet, the oldest transactions of its own token accounts (`getTransactionsForAddress`, falling back to `getSignaturesForAddress` + `getTransaction`). From the first receipt: slot, fee payer, Jito tip, SOL spent, and whether the tokens came from a pool or from another wallet.
4. **Reload.** The last SOL the wallet received before that first buy. Aged wallets hide behind old funding; the reload is what paid for the buy.
5. **Links**, each with its transaction signature:
   - **funded**: one top holder (or the deployer) sent another its first SOL
   - **same funder**: 2+ top holders share a funder with no known name or type (exchanges never link)
   - **token transfer**: a holder's first tokens came straight from another holder
   - **fee paid by**: another holder, the deployer, or one unnamed wallet paying for 2+ holders paid the fee of a first buy
   - **loaded before buying**: the reload came from another holder, the deployer, or one unnamed wallet shared by 2+ holders (within 72h)
   - **exchange batch**: 3+ reloads from the same exchange hot wallet, at most 10 minutes apart, amounts within 10%
6. **Cohorts.** 3+ first buys within 2 slots, or 2+ in the token's creation block, rated by shared fee payer, same size (within 12%), same Jito tip, fresh wallets and reloads under 6h before buying. This catches bundles that never transfer between their wallets.
7. **Score.** 100 minus capped penalties for top-10 share, linked share, cohort share, deployer share and fresh wallets.

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

Returns the map as JSON, open CORS, no key. Cached maps are served for 90 seconds. Uncached scans are limited per IP and per day. Add `?stream=1` for NDJSON: progress lines `{ "stage", "done", "total" }`, then one `{ "result": map }` or `{ "error": { "code", "message" } }`.

## Cost

A fresh scan of 100 wallets reads roughly 100 funding lookups (100 credits each) and 100 first-buy reads (10 credits each) on Helius, about 11,000 credits. Funding and first buys are cached permanently, so a rescan of a known token costs a fraction of that.

## License

MIT
