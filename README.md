# Glass

The bubble map with receipts. Paste any Solana token and see who really holds it. Every link between two wallets opens the transaction that proves it.

Glass shows data, never verdicts. It does not investigate people, it does not take labels in private, and every rule it applies is in this repository.

## How a scan works

1. **Holders.** Every token account of the mint (`getTokenAccounts`), summed per owner. The top 100 are mapped. Owners that are program-derived addresses (bonding curves, pool vaults, lockers) are drawn as rings and never linked or scored.
2. **Funding.** For each wallet, the first SOL it ever received (`/v1/wallet/{address}/funded-by`). Cached forever: it can't change.
3. **First buy.** For each wallet, the first transaction in which it received the token (`getTransactionsForAddress`, oldest first, filtered by mint). From it: slot, fee payer, Jito tip, SOL spent, and whether the tokens came from a pool or from another wallet.
4. **Links**, each with its transaction signature:
   - **funded**: one top holder (or the deployer) sent another its first SOL
   - **same funder**: 2+ top holders share a funder with no known name or type (exchanges never link)
   - **token transfer**: a holder's first tokens came straight from another holder
5. **Cohorts.** 3+ first buys within 2 slots, rated by shared fee payer, same size (within 12%), same Jito tip, and fresh wallets (funded under 6h before buying). This catches bundles that never transfer between their wallets.
6. **Score.** 100 minus capped penalties for top-10 share, linked share, cohort share, deployer share and fresh wallets.

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

Returns the map as JSON, open CORS, no key. Cached maps are served for 90 seconds. Uncached scans are limited per IP and per day. Add `?stream=1` for NDJSON progress lines followed by the result.

## Cost

A fresh scan of 100 wallets reads roughly 100 funding lookups (100 credits each) and 100 first-buy reads (10 credits each) on Helius, about 11,000 credits. Funding and first buys are cached permanently, so a rescan of a known token costs a fraction of that.

## License

MIT
