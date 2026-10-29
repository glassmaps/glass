import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClusters, buildCohorts, buildEdges, markFresh, score } from "../src/lib/graph";
import { readFirstIn } from "../src/lib/helius";
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
