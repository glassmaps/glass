// A mainnet-shaped stand-in for Helius (JSON-RPC + Wallet API) so the whole scan can run offline.
// Scenario: a pump.fun launch with a bonding curve, a deployer-funded cluster, a shared-funder cluster,
// a same-slot cohort paid by one wallet, an exchange wallet and organic holders.
// Run: tsx test/mock-helius.ts  (listens on :8899)
import { createServer } from "node:http";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const bytes = () => Uint8Array.from({ length: 32 }, () => Math.floor(rnd() * 256));
const wallet = () => bs58.encode(ed25519.getPublicKey(bytes()));
const offCurve = () => {
  for (;;) {
    const b = bytes();
    try {
      ed25519.Point.fromBytes(b);
    } catch {
      return bs58.encode(b);
    }
  }
};
const sig = () => bs58.encode(Uint8Array.from({ length: 64 }, () => Math.floor(rnd() * 256)));

export const MINT = wallet();
const DEPLOYER = wallet();
const CURVE = offCurve();
const FUNDER_X = wallet(); // unnamed, funds 5 holders
const PAYER = wallet(); // pays fees for a cohort
const CEX = wallet(); // named exchange funder
const CEX_HOLDER = wallet();
const DEC = 6;
const SUPPLY = 1_000_000_000 * 10 ** DEC;
const T0 = 1_761_700_000;
const S0 = 371_000_000;

type H = { owner: string; amt: number; funder: string; fundT: number; named?: boolean; slot: number; payer?: string; spent: number; tip?: number; from?: string; pre?: { from: string; lamports: number; dt: number } };
const EXCH = wallet(); // named exchange hot wallet that sends a withdrawal batch
const RELOADER = wallet(); // unnamed wallet that reloads aged wallets right before they buy
const MIDDLE = wallet(); // an outside wallet that funded three holders
const FEEWALLET = wallet(); // a bot's fee wallet every trader pays
const SNIPER = wallet(); // bought one slot after launch and dumped inside the window
const PASSED = wallet(); // got 0.5% from a launch wallet
const hs: H[] = [];
hs.push({ owner: CURVE, amt: 0.21, funder: "", fundT: 0, slot: S0, spent: 0 });
hs.push({ owner: CEX_HOLDER, amt: 0.034, funder: CEX, fundT: T0 - 9e6, named: true, slot: S0 + 9000, spent: 0 });
// deployer cluster: deployer funds 4 wallets just before launch
for (let i = 0; i < 4; i++) hs.push({ owner: wallet(), amt: 0.028 - i * 0.002, funder: DEPLOYER, fundT: T0 - 600, slot: S0 + 2, spent: 1.2, tip: 1_000_000 });
// shared funder cluster
for (let i = 0; i < 5; i++) hs.push({ owner: wallet(), amt: 0.017 - i * 0.001, funder: FUNDER_X, fundT: T0 - 3000 - i * 60, slot: S0 + 400 + i * 50, spent: 0.6 + i * 0.1 });
// cohort: one payer, same slot, same size, fresh
for (let i = 0; i < 6; i++) hs.push({ owner: wallet(), amt: 0.012, funder: wallet(), fundT: T0 - 1200, slot: S0 + 1, payer: PAYER, spent: 0.75 + (i % 2) * 0.01, tip: 500_000 });
// a transfer from the first deployer wallet
hs.push({ owner: wallet(), amt: 0.009, funder: wallet(), fundT: T0 - 4e6, slot: S0 + 800, spent: 0, from: hs[2].owner });
// launch block: two wallets bought in the very block the token was created
for (let i = 0; i < 2; i++) hs.push({ owner: wallet(), amt: 0.02, funder: wallet(), fundT: T0 - 5e6, slot: S0 - 2, spent: 1.5, named: true });
// aged wallets (funded months ago by an exchange) reloaded by one exchange batch: same minutes, same amount
for (let i = 0; i < 4; i++) hs.push({ owner: wallet(), amt: 0.011 - i * 0.0005, funder: CEX, fundT: T0 - 8e6 - i * 9e5, named: true, slot: S0 + 30 + i * 7, spent: 1.9, pre: { from: EXCH, lamports: 2_000_000_000 + i * 30_000_000, dt: 1500 - i * 70 } });
// aged wallets reloaded by one unnamed wallet an hour before buying
for (let i = 0; i < 3; i++) hs.push({ owner: wallet(), amt: 0.0105 - i * 0.0004, funder: CEX, fundT: T0 - 7e6 - i * 9e5, named: true, slot: S0 + 3000 + i * 40, spent: 0.9, pre: { from: RELOADER, lamports: 1_000_000_000, dt: 3600 + i * 30 } });
// organic holders
for (let i = 0; i < 110; i++) hs.push({ owner: wallet(), amt: 0.006 * Math.pow(0.965, i) + 0.0003, funder: wallet(), fundT: T0 - 2e6 - i * 5000, slot: S0 + 1200 + i * 337, spent: 0.05 + rnd() * 2 });

const accounts = hs.map((h) => ({ address: offCurve(), mint: MINT, owner: h.owner, amount: Math.round(h.amt * SUPPLY), delegated_amount: 0, frozen: false }));
const byOwner = new Map(hs.map((h) => [h.owner, h]));
const byAccount = new Map(accounts.map((a) => [a.address, byOwner.get(a.owner)!]));
const fundSig = new Map(hs.map((h) => [h.owner, sig()]));

function firstTx(h: H) {
  const payer = h.payer || h.owner;
  const keys = [{ pubkey: payer, signer: true }, ...(payer !== h.owner ? [{ pubkey: h.owner, signer: true }] : [])];
  const src = h.from || CURVE;
  const raw = String(Math.round(h.amt * SUPPLY));
  const ix: unknown[] = [{ programId: h.from ? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" : "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" }];
  if (h.tip) ix.push({ program: "system", parsed: { type: "transfer", info: { destination: "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5", lamports: h.tip } } });
  const pre = keys.map(() => 3_000_000_000);
  const post = keys.map((k) => (k.pubkey === h.owner ? 3_000_000_000 - Math.round(h.spent * 1e9) : 3_000_000_000));
  return {
    slot: h.slot, transactionIndex: 0, blockTime: T0 + (h.slot - S0) * 0.4,
    transaction: { signatures: [sig()], message: { accountKeys: keys, instructions: ix } },
    meta: {
      err: null, fee: 5000 + (h.tip ? 20000 : 0), preBalances: pre, postBalances: post, innerInstructions: [],
      preTokenBalances: [{ accountIndex: 5, mint: MINT, owner: src, uiTokenAmount: { amount: String(SUPPLY), decimals: DEC } }],
      postTokenBalances: [
        { accountIndex: 5, mint: MINT, owner: src, uiTokenAmount: { amount: String(SUPPLY - Number(raw)), decimals: DEC } },
        { accountIndex: 6, mint: MINT, owner: h.owner, uiTokenAmount: { amount: raw, decimals: DEC } },
      ],
    },
  };
}

function rpc(method: string, params: any) {
  switch (method) {
    case "getAsset":
      if (params.id !== MINT) return { error: { code: -32000, message: "Asset not found" } };
      return {
        result: {
          id: MINT, interface: "FungibleToken",
          content: { metadata: { name: "Example Launch", symbol: "EXMPL" }, files: [], links: {} },
          token_info: { supply: SUPPLY, decimals: DEC, symbol: "EXMPL" },
        },
      };
    case "getTokenAccounts": {
      const page = params.page || 1, limit = params.limit || 1000;
      return { result: { total: accounts.length, limit, page, token_accounts: accounts.slice((page - 1) * limit, page * limit) } };
    }
    case "getTransactionsForAddress": {
      const [addr] = params;
      if (addr === MINT && params[1]?.filters?.slot) {
        // the launch window: the deployer creates and buys 3%, two wallets buy 2% each in the same block,
        // one passes 0.5% to a fresh wallet, and a sniper buys 1% one slot later and dumps it inside the window
        const tb = (o: string, a: number) => ({ accountIndex: 6, mint: MINT, owner: o, uiTokenAmount: { amount: String(Math.round(a * SUPPLY)), decimals: DEC } });
        const cv = (a: number) => ({ accountIndex: 5, mint: MINT, owner: CURVE, uiTokenAmount: { amount: String(Math.round(a * SUPPLY)), decimals: DEC } });
        const tx = (slot: number, idx: number, payer: string, pre: unknown[], post: unknown[], ix: unknown[] = [], spent = 0) => ({
          slot, transactionIndex: idx, blockTime: T0 - 1,
          transaction: { signatures: [sig()], message: { accountKeys: [{ pubkey: payer, signer: true }], instructions: ix } },
          meta: { err: null, fee: 5000, preBalances: [5e9], postBalances: [5e9 - spent], innerInstructions: [], preTokenBalances: pre, postTokenBalances: post },
        });
        const L = hs.filter((h) => h.slot === S0 - 2);
        const data = [
          tx(S0 - 2, 0, DEPLOYER, [], [cv(0.97), tb(DEPLOYER, 0.03)], [{ program: "spl-token", parsed: { type: "initializeMint2", info: { mint: MINT } } }], 1.1e9),
          tx(S0 - 2, 1, L[0].owner, [cv(0.97)], [cv(0.95), tb(L[0].owner, 0.02)], [], 1.5e9),
          tx(S0 - 2, 2, L[1].owner, [cv(0.95)], [cv(0.93), tb(L[1].owner, 0.02)], [], 1.5e9),
          tx(S0 - 1, 0, SNIPER, [cv(0.93)], [cv(0.92), tb(SNIPER, 0.01)], [], 0.7e9),
          tx(S0 - 1, 1, L[0].owner, [tb(L[0].owner, 0.02)], [tb(L[0].owner, 0.015), { ...tb(PASSED, 0.005), accountIndex: 7 }]),
          tx(S0, 0, SNIPER, [cv(0.92), tb(SNIPER, 0.01)], [cv(0.93), tb(SNIPER, 0)]),
        ];
        return { result: { data, paginationToken: null } };
      }
      if (addr === MINT) {
        return { result: { data: [{ slot: S0 - 2, blockTime: T0 - 1, transaction: { signatures: [sig()], message: { accountKeys: [{ pubkey: DEPLOYER, signer: true }], instructions: [] } }, meta: { err: null, fee: 5000, preBalances: [0], postBalances: [0] } }], paginationToken: null } };
      }
      // a holder's token account: its oldest transaction is the first receipt
      const ha = byAccount.get(addr);
      if (ha) return { result: { data: [firstTx(ha)], paginationToken: null } };
      const h = byOwner.get(addr);
      const sys = (slot: number, ts: number, from: string, to: string, lamports: number) => ({
        slot, blockTime: Math.round(ts),
        transaction: { signatures: [sig()], message: { accountKeys: [{ pubkey: from, signer: true }, { pubkey: to, signer: false }], instructions: [{ program: "system", parsed: { type: "transfer", info: { source: from, destination: to, lamports } } }] } },
        meta: { err: null, fee: 5000, preBalances: [0, 0], postBalances: [0, lamports], innerInstructions: [] },
      });
      // a wallet, oldest first: its first SOL in is the funding
      if (h && params[1]?.sortOrder !== "desc" && !params[1]?.filters?.tokenAccounts) {
        if (!h.funder) return { result: { data: [], paginationToken: null } };
        return { result: { data: [sys(S0 - 5000, h.fundT, h.funder, h.owner, 500_000_000)], paginationToken: null } };
      }
      // a wallet, newest first: its recent SOL moves, and the reload right before its first buy
      if (h && params[1]?.sortOrder === "desc") {
        const i = hs.indexOf(h);
        const data: unknown[] = [];
        const old = T0 - 86400 * (1 + (i % 5));
        if (i > 2) data.push(sys(h.slot + 900, T0 + 5000, h.owner, FEEWALLET, 10_000_000));
        if (i >= 30 && i <= 33) data.push(sys(h.slot - 90000, old, h.owner, hs[i + 1].owner, 1_250_000_000));
        if (i >= 40 && i <= 42) data.push(sys(h.slot - 90000, old, MIDDLE, h.owner, 800_000_000));
        if (h.pre) data.push(sys(h.slot - Math.round(h.pre.dt / 0.4), T0 + (h.slot - S0) * 0.4 - h.pre.dt, h.pre.from, h.owner, h.pre.lamports));
        // the whole history of a young wallet: its funding and its first buy are in the same window
        if (h.funder) data.push(sys(S0 - 5000 - (h.pre ? 2_000_000 : 0), h.fundT, h.funder, h.owner, 500_000_000));
        data.push(firstTx(h));
        data.sort((a: any, b: any) => b.slot - a.slot);
        return { result: { data, paginationToken: null } };
      }
      // the old owner-level call with a token filter: refused, like the real provider did for most wallets
      if (h) return { error: { code: -32602, message: "mock: owner-level token filter refused" } };
      return { result: { data: [], paginationToken: null } };
    }
    default:
      return { error: { code: -32601, message: `mock: ${method} not implemented` } };
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  let body = "";
  for await (const c of req) body += c;
  const send = (code: number, o: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(o));
  };
  await new Promise((r) => setTimeout(r, 8 + Math.random() * 25)); // a little network latency
  const fb = url.pathname.match(/^\/v1\/wallet\/([^/]+)\/funded-by$/);
  if (fb) {
    const h = byOwner.get(fb[1]);
    if (!h || !h.funder) return send(404, { error: "No funding transaction found", code: 404 });
    return send(200, {
      funder: h.funder, funderName: h.named ? "Binance 2" : null, funderType: h.named ? "exchange" : null,
      mint: "So11111111111111111111111111111111111111111", symbol: "SOL", amount: 0.5, amountRaw: "500000000", decimals: 9,
      date: new Date(h.fundT * 1000).toISOString(), signature: fundSig.get(h.owner), timestamp: h.fundT, slot: S0 - 5000,
    });
  }
  const tr = url.pathname.match(/^\/v1\/wallet\/([^/]+)\/transfers$/);
  if (tr) {
    const i = hs.findIndex((h) => h.owner === tr[1]);
    const data: unknown[] = [];
    const t = (direction: string, counterparty: string, mint: string, amount: number) => data.push({ signature: sig(), timestamp: T0 - 86400 * (1 + (i % 5)), direction, counterparty, mint, symbol: mint === MINT ? "EXMPL" : "SOL", amount, amountRaw: "0", decimals: 9 });
    const SOLM = "So11111111111111111111111111111111111111112";
    // organic holders 30..33 passed SOL to each other weeks ago
    if (i >= 30 && i <= 33) t("out", hs[i + 1].owner, SOLM, 1.25);
    // one middleman funded three organic holders
    if (i >= 40 && i <= 42) t("in", MIDDLE, SOLM, 0.8);
    // everyone paid a trading bot's fee wallet: never a middleman
    if (i > 2) t("out", FEEWALLET, SOLM, 0.01);
    return send(200, { data, pagination: { hasMore: false, nextCursor: null } });
  }
  if (url.pathname === "/v1/wallet/batch-identity") {
    const { addresses } = JSON.parse(body || "{}");
    return send(200, (addresses || []).filter((a: string) => a === CEX_HOLDER || a === EXCH || a === CEX).map((a: string) => ({ address: a, type: "exchange", name: a === EXCH ? "Binance Hot Wallet 2" : "Binance 2", category: "Centralized Exchange", tags: [] })));
  }
  if (req.method === "POST") {
    const j = JSON.parse(body);
    return send(200, { jsonrpc: "2.0", id: j.id, ...rpc(j.method, j.params) });
  }
  send(404, { error: "not found" });
});

server.listen(8899, () => console.log(`mock helius on :8899  mint=${MINT}`));
