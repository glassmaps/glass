import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClusters, buildCohorts, buildEdges, markFresh, score } from "../src/lib/graph";
import { prefundFrom, readFirstIn, recentOf, type Recent } from "../src/lib/helius";
import { readLine } from "../src/lib/stream";
import { layout } from "../src/lib/layout";
import type { FirstIn, Funding, Node } from "../src/lib/types";

// real-looking base58 wallet strings (on-curve-ness is not used by the graph rules)
const W = (i: number) => `W${String(i).padStart(3, "0")}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.slice(0, 44);

const fund = (funder: string, t = 1_700_000_000, named = false): Funding => ({
  funder, funderName: named ? "Binance 2" : null, funderType: named ? "exchange" : null, amount: 0.5, signature: `sig-f-${funder}-${t}`, timestamp: t, slot: 1,
});
const buy = (slot: number, o: Partial<FirstIn> = {}): FirstIn => ({
  signature: `sig-b-${slot}-${Math.random()}`, slot, blockTime: 1_700_000_600, feePayer: "self", feeLamports: 5000, tipLamports: 0, solSpent: 1, via: "pump.fun", from: null, ...o,
});
const holder = (i: number, pct: number, funding: Funding | null, first: FirstIn | null, kind: Node["kind"] = "holder"): Node => ({
  id: W(i), kind, label: null, labelSource: null, amount: pct * 1e7, pct, rank: i, cluster: null, cohort: null, fresh: false,
  isDeployer: false, funding, first: first && first.feePayer === "self" ? { ...first, feePayer: W(i) } : first, x: 0, y: 0, r: 0,
});

test("a holder that funded another holder links them, with the funding tx as receipt", () => {
  const hs = [holder(1, 10, null, buy(100)), holder(2, 5, fund(W(1)), buy(200))];
  const { edges } = buildEdges(hs, null);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].type, "funded");
  assert.equal(edges[0].receipts[0].signature, hs[1].funding!.signature);
});

test("an unnamed funder shared by two holders becomes a hub; a named exchange never links", () => {
  const F = "FUNDERxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const hs = [
    holder(1, 4, fund(F), buy(10)), holder(2, 3, fund(F), buy(20)),
    holder(3, 2, fund("CEXxx", 1, true), buy(30)), holder(4, 2, fund("CEXxx", 2, true), buy(40)),
  ];
  const { edges, virtual } = buildEdges(hs, null);
  assert.equal(virtual.length, 1);
  assert.equal(edges.filter((e) => e.type === "shared-funder").length, 2);
  const clusters = buildClusters(hs, virtual, edges);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0].members.sort(), [W(1), W(2)].sort());
  assert.equal(clusters[0].pct, 7);
  assert.equal(hs[2].cluster, null);
});

test("a first buy that came straight from another holder is a transfer link", () => {
  const hs = [holder(1, 10, null, buy(1)), holder(2, 1, null, buy(5, { from: W(1), solSpent: 0, via: null }))];
  const { edges } = buildEdges(hs, null, "GLASS");
  assert.equal(edges[0].type, "transfer");
  assert.match(edges[0].receipts[0].what, /\$GLASS/);
});

test("deployer funding shows as a Deployer hub even for a single wallet", () => {
  const D = "DEPLOYERxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const hs = [holder(1, 8, fund(D), buy(10)), holder(2, 3, null, buy(20))];
  const { edges, virtual } = buildEdges(hs, D);
  assert.equal(virtual[0].label, "Deployer");
  assert.equal(virtual[0].isDeployer, true);
  assert.equal(edges.length, 1);
});

test("cohorts: same slot + one fee payer is high confidence, scattered buys are none", () => {
  const P = "PAYERxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const hs = [
    holder(1, 2, null, buy(500, { feePayer: P, solSpent: 1.0 })),
    holder(2, 2, null, buy(500, { feePayer: P, solSpent: 1.02 })),
    holder(3, 2, null, buy(501, { feePayer: P, solSpent: 0.99 })),
    holder(4, 2, null, buy(900)), holder(5, 2, null, buy(1300)),
  ];
  const cs = buildCohorts(hs);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].confidence, "high");
  assert.equal(cs[0].members.length, 3);
  assert.ok(cs[0].signals.some((s) => /paid the fee for 3/.test(s)));
  assert.ok(cs[0].signals.some((s) => /within \d+% of each other/.test(s)));
  assert.equal(hs[3].cohort, null);
});

test("fresh: funded within 6h before the first buy", () => {
  const hs = [holder(1, 1, fund("X", 1_700_000_000), buy(1)), holder(2, 1, fund("Y", 1_600_000_000), buy(2))];
  markFresh(hs);
  assert.equal(hs[0].fresh, true);
  assert.equal(hs[1].fresh, false);
});

test("score stays in 0..100 and every penalty is within its cap", () => {
  const hs = Array.from({ length: 40 }, (_, i) => holder(i + 1, 2.5, fund("SAME"), buy(700)));
  markFresh(hs);
  const { edges, virtual } = buildEdges(hs, null);
  const cl = buildClusters(hs, virtual, edges);
  const co = buildCohorts(hs);
  const s = score(hs, cl, co);
  assert.ok(s.total >= 0 && s.total <= 100);
  for (const i of s.items) assert.ok(i.penalty <= i.max);
  assert.equal(s.band, "heavy");
  const clean = Array.from({ length: 100 }, (_, i) => holder(i + 1, 0.5, null, buy(1000 + i * 10)));
  assert.equal(score(clean, [], []).total, 100);
});

test("layout is deterministic and keeps every bubble inside the view", () => {
  const mk = () => Array.from({ length: 60 }, (_, i) => holder(i + 1, 30 / (i + 1), null, null));
  const a = mk(), b = mk();
  layout(a, []);
  layout(b, []);
  assert.deepEqual(a.map((n) => [n.x, n.y, n.r]), b.map((n) => [n.x, n.y, n.r]));
  for (const n of a) {
    assert.ok(n.x - n.r >= -1 && n.x + n.r <= 1001, `x out of view ${n.x} ${n.r}`);
    assert.ok(n.y - n.r >= -1 && n.y + n.r <= 1001, `y out of view ${n.y} ${n.r}`);
  }
});

test("readFirstIn reads payer, fee, Jito tip, SOL spent and a wallet-to-wallet source", () => {
  const owner = "6Fq1X1xvXH9uRZyZ3n8dzUjkY5n1QYV9h1t4r1hNq1aB"; // a wallet (on curve) is needed for `from`
  const giver = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
  const tx = {
    slot: 321, blockTime: 1_700_000_999,
    transaction: {
      signatures: ["SIG1"],
      message: {
        accountKeys: [{ pubkey: owner, signer: true }, { pubkey: giver, signer: false }],
        instructions: [
          { programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" },
          { program: "system", parsed: { type: "transfer", info: { destination: "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5", lamports: 100000 } } },
        ],
      },
    },
    meta: {
      err: null, fee: 105000, preBalances: [2_000_000_000, 0], postBalances: [1_500_000_000, 0],
      preTokenBalances: [{ accountIndex: 1, mint: "M", owner: giver, uiTokenAmount: { amount: "1000", decimals: 6 } }],
      postTokenBalances: [
        { accountIndex: 1, mint: "M", owner: giver, uiTokenAmount: { amount: "0", decimals: 6 } },
        { accountIndex: 2, mint: "M", owner, uiTokenAmount: { amount: "1000", decimals: 6 } },
      ],
    },
  };
  const f = readFirstIn(tx as never, owner, "M")!;
  assert.equal(f.signature, "SIG1");
  assert.equal(f.feePayer, owner);
  assert.equal(f.tipLamports, 100000);
  assert.equal(f.solSpent, 0.5);
  assert.equal(f.via, "pump.fun");
  assert.equal(f.from, giver);
});

test("stream: a progress count is never taken for the map", async () => {
  const { readLine } = await import("../src/lib/stream");
  assert.equal(readLine('{"stage":"funding","done":37,"total":97}').kind, "stage");
  assert.equal(readLine('{"result":{"nodes":[],"edges":[],"clusters":[],"cohorts":[]}}').kind, "result");
  assert.equal(readLine('{"error":{"code":"rate","message":"slow"}}').kind, "error");
  assert.equal(readLine("  ").kind, "skip");
});

test("images: every way a token picture is written becomes URLs worth trying", async () => {
  const { expand, safe } = await import("../src/lib/image");
  const cid = "bafybeia4zlazqj7yvf3u2yvm3prs4di67m4hjtm4ytms4vgzseu6sldbma";
  assert.ok(expand(`ipfs://${cid}`).length >= 4);
  assert.ok(expand(`https://float.mypinata.cloud/ipfs/${cid}`)[0].startsWith("https://float.mypinata.cloud"));
  assert.ok(expand(`https://float.mypinata.cloud/ipfs/${cid}`).some((u) => u.startsWith("https://ipfs.io/ipfs/")));
  const wrapped = expand(`https://cdn.helius-rpc.com/cdn-cgi/image//https://float.mypinata.cloud/ipfs/${cid}`);
  assert.ok(wrapped.some((u) => u.startsWith("https://dweb.link/ipfs/" + cid)));
  assert.deepEqual(expand("ar://abc"), ["https://arweave.net/abc"]);
  assert.equal(safe("http://example.com/a.png"), null);
  assert.equal(safe("https://127.0.0.1/a.png"), null);
  assert.equal(safe("https://localhost/a.png"), null);
  assert.ok(safe("https://ipfs.io/ipfs/x"));
});

const pre = (from: string, t: number, sol = 2, name: string | null = null) => ({
  from, fromName: name, fromType: name ? "Centralized Exchange" : null, lamports: sol * 1e9, signature: `sig-p-${from}-${t}-${sol}`, slot: 1, blockTime: t,
});

test("one unnamed wallet paying the fee for several first buys becomes a fee-payer hub; a named relayer does not", () => {
  const P = "PAYERxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const R = "RELAYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const hs = [
    holder(1, 3, null, buy(10, { feePayer: P })), holder(2, 3, null, buy(11, { feePayer: P })),
    holder(3, 3, null, buy(12, { feePayer: R })), holder(4, 3, null, buy(13, { feePayer: R })),
  ];
  const { edges, virtual } = buildEdges(hs, null, "", new Set([R]));
  assert.equal(edges.filter((e) => e.type === "paid").length, 2);
  assert.equal(virtual.length, 1);
  assert.equal(virtual[0].label, "Fee payer");
});

test("aged wallets reloaded by one unnamed wallet right before buying are linked; a reload weeks old is not", () => {
  const S = "SOURCExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const t = 1_700_000_600;
  const hs = [holder(1, 4, null, buy(10)), holder(2, 4, null, buy(11)), holder(3, 4, null, buy(12))];
  hs[0].prefund = pre(S, t - 600);
  hs[1].prefund = pre(S, t - 1200);
  hs[2].prefund = pre(S, t - 40 * 86400);
  const { edges } = buildEdges(hs, null);
  const pf = edges.filter((e) => e.type === "prefunded");
  assert.equal(pf.length, 2);
  assert.match(pf[0].receipts[0].what, /min before its first buy/);
});

test("an exchange batch needs the same exchange, the same minutes and the same amount", () => {
  const X = "BINANCExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const t = 1_700_000_000;
  const hs = [1, 2, 3, 4, 5].map((i) => holder(i, 2, null, buy(10 + i)));
  hs[0].prefund = pre(X, t, 2.0, "Binance Hot Wallet 2");
  hs[1].prefund = pre(X, t + 120, 2.05, "Binance Hot Wallet 2");
  hs[2].prefund = pre(X, t + 300, 1.98, "Binance Hot Wallet 2");
  hs[3].prefund = pre(X, t + 360, 9.0, "Binance Hot Wallet 2"); // different amount: out
  hs[4].prefund = pre(X, t + 9000, 2.0, "Binance Hot Wallet 2"); // hours later: out
  const { edges, virtual } = buildEdges(hs, null);
  assert.equal(edges.filter((e) => e.type === "batch").length, 3);
  assert.equal(virtual[0].label, "Binance Hot Wallet 2 batch");
});

test("two buys in the token's creation block are a high-confidence launch cohort", () => {
  const hs = [holder(1, 6, null, buy(500)), holder(2, 5, null, buy(500)), holder(3, 1, null, buy(900))];
  const cs = buildCohorts(hs, 500);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].confidence, "high");
  assert.ok(cs[0].signals.some((s) => /created/.test(s)));
});

const xf = (direction: "in" | "out", counterparty: string, mint: string, amount: number) => ({
  signature: `sig-x-${counterparty}-${amount}-${Math.random()}`, timestamp: 1_700_000_000, direction, counterparty, mint, symbol: null, amount,
});
// on-curve wallets: middlemen must be real wallets, not program accounts
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519.js";
const realWallet = (n: number) => bs58.encode(ed25519.getPublicKey(Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + n) % 256)));

test("a transfer between two top holders, of anything, links them; one receipt per transfer", () => {
  const hs = [holder(1, 4, null, null), holder(2, 4, null, null), holder(3, 4, null, null)];
  const SOLM = "So11111111111111111111111111111111111111112";
  const x = new Map([[W(1), [xf("out", W(2), SOLM, 1.5)]], [W(2), [xf("in", W(1), SOLM, 1.5)]]]);
  const { edges } = buildEdges(hs, null, "", new Set(), x, "MINT");
  const moved = edges.filter((e) => e.type === "moved");
  assert.equal(moved.length, 1);
  assert.match(moved[0].receipts[0].what, /1\.5 SOL/);
});

test("a middleman needs 2+ holders and money moving like a bundle; a fee wallet everyone pays never counts", () => {
  const hs = [1, 2, 3, 4, 5, 6].map((i) => holder(i, 2, null, null));
  const SOLM = "So11111111111111111111111111111111111111112";
  const M = realWallet(1), FEE = realWallet(2);
  const x = new Map(hs.map((h, i) => [h.id, [
    ...(i < 3 ? [xf("in", M, SOLM, 0.8)] : []),
    xf("out", FEE, SOLM, 0.01),
  ]]));
  const { edges, virtual } = buildEdges(hs, null, "", new Set(), x, "MINT");
  assert.equal(edges.filter((e) => e.type === "moved").length, 3);
  assert.equal(virtual.length, 1);
  assert.equal(virtual[0].label, "Middleman");
});

test("what the launch bundle still holds is scored, within its cap", () => {
  const hs = [holder(1, 1, null, null)];
  const s = score(hs, [], [], 30);
  const it = s.items.find((i) => i.key === "launch")!;
  assert.equal(it.penalty, it.max);
});

test("one transaction draws one line: a funding that is also a transfer between holders shows once", () => {
  const hs = [holder(1, 10, null, buy(100)), holder(2, 5, fund(W(1)), buy(200))];
  const sig = hs[1].funding!.signature;
  const xf = new Map([[W(2), [{ signature: sig, timestamp: 1_700_000_000, direction: "in" as const, counterparty: W(1), mint: "So11111111111111111111111111111111111111112", symbol: "SOL", amount: 0.5 }]]]);
  const { edges } = buildEdges(hs, null, "", new Set(), xf);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].type, "funded");
});

test("a reload is read from the recent window only when the window reaches back past the buy", () => {
  const rec: Recent = { xfers: [], sols: [{ from: "R", lamports: 2e9, signature: "s1", slot: 90, blockTime: 1 }], oldestSlot: 80, complete: false };
  assert.equal(prefundFrom(rec, "me", 100, "buy").found?.from, "R");
  assert.equal(prefundFrom(rec, "me", 100, "buy").covered, true);
  assert.equal(prefundFrom({ ...rec, oldestSlot: 150 }, "me", 100, "buy").covered, false);
  assert.equal(prefundFrom(rec, "me", 85, "buy").found, null);
});

test("stream: a partial map is shown, never taken for the finished one", () => {
  const map = { nodes: [], edges: [] };
  assert.equal(readLine(JSON.stringify({ partial: map })).kind, "partial");
  assert.equal(readLine(JSON.stringify({ result: map })).kind, "result");
});

test("a young wallet's whole history gives its funding and first buy in one read", async () => {
  const me = W(7), F = W(8), MINT = "MINTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const sys = (slot: number, from: string, to: string, lamports: number) => ({
    slot, blockTime: 1_700_000_000 + slot,
    transaction: { signatures: [`s${slot}`], message: { accountKeys: [{ pubkey: from, signer: true }, { pubkey: to, signer: false }], instructions: [{ program: "system", parsed: { type: "transfer", info: { source: from, destination: to, lamports } } }] } },
    meta: { err: null, fee: 5000, preBalances: [0, 0], postBalances: [0, lamports], innerInstructions: [] },
  });
  const buyTx = {
    slot: 30, blockTime: 1_700_000_030,
    transaction: { signatures: ["s30"], message: { accountKeys: [{ pubkey: me, signer: true }], instructions: [{ programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" }] } },
    meta: { err: null, fee: 5000, preBalances: [2e9], postBalances: [1e9], innerInstructions: [], preTokenBalances: [], postTokenBalances: [{ accountIndex: 2, mint: MINT, owner: me, uiTokenAmount: { amount: "1000", decimals: 6 } }] },
  };
  const data = [sys(40, me, F, 1e8), buyTx, sys(20, F, me, 9e8), sys(10, F, me, 5e8)];
  const real = globalThis.fetch;
  globalThis.fetch = (async (_u: unknown, o: { body: string }) => {
    const j = JSON.parse(o.body);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: j.id, result: { data, paginationToken: null } }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const r = await recentOf(me, MINT, 40);
    assert.equal(r.complete, true);
    assert.equal(r.funding?.signature, "s10");
    assert.equal(r.first?.signature, "s30");
    assert.equal(prefundFrom(r, me, 30, "s30").found?.signature, "s20");
  } finally {
    globalThis.fetch = real;
  }
});
