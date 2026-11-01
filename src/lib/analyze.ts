import { limits, METHOD_VERSION, rules, site } from "@/config/site";
import { BURN } from "@/config/known";
import * as cache from "./cache";
import { isAddress, isOnCurve } from "./address";
import type { LaunchBuy } from "./launch";
import { buildLaunch } from "./launch-view";
import { deployerOf, firstIn, fundingOf, getAsset, getHolders, identities, launchBuys, prefundFrom, prefundOf, recentOf, UpstreamError, type Recent, type Xfer } from "./helius";
import { market } from "./market";
import { mapLimit } from "./pool";
import { buildClusters, buildCohorts, buildEdges, markFresh, score } from "./graph";
import { layout } from "./layout";
import type { FirstIn, Funding, MapResult, Node, PreFund, Stage } from "./types";

export class ScanError extends Error {
  constructor(public code: "bad-address" | "not-token" | "no-holders" | "config" | "upstream", message: string) {
    super(message);
  }
}

const selfLabels = (): Record<string, string> => {
  try {
    return JSON.parse(process.env.SELF_LABELS || "{}");
  } catch {
    return {};
  }
};

/** Our own token, by mint once it is live, by ticker before that. Kept out of public lists. */
export const isOwn = (mint: string, symbol?: string | null) =>
  (Boolean(site.tokenMint) && mint === site.tokenMint) || (symbol || "").replace(/^\$/, "").toUpperCase() === site.ticker;

export const mapKey = (mint: string) => `map:${METHOD_VERSION}:${mint}`;

export async function cachedMap(mint: string) {
  return cache.get<MapResult>(mapKey(mint));
}

export async function analyze(
  mint: string,
  onStage: (s: Stage) => void = () => {},
  onPartial: (m: MapResult) => void = () => {},
): Promise<MapResult> {
  const t0 = Date.now();
  const left = () => 46_000 - (Date.now() - t0);
  if (!isAddress(mint)) throw new ScanError("bad-address", "That is not a Solana address.");
  if (!process.env.HELIUS_API_KEY && !process.env.HELIUS_RPC_URL) throw new ScanError("config", "The data key is not set on this deployment.");

  // ---------------------------------------------------------------- token, holders, birth, market: all at once
  onStage({ stage: "token" });
  const birthP = (async () => {
    const k = `dep2:${mint}`;
    const hit = await cache.get<{ d: Awaited<ReturnType<typeof deployerOf>> }>(k);
    if (hit) return hit.d;
    const d = await deployerOf(mint).catch(() => null);
    if (d) await cache.set(k, { d });
    return d;
  })();
  const mktP = market(mint);
  let asset: Awaited<ReturnType<typeof getAsset>>;
  try {
    asset = await getAsset(mint);
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 400) throw new ScanError("not-token", "No token lives at that address.");
    throw new ScanError("upstream", "The chain data provider did not answer. Try again in a moment.");
  }
  if (!asset) throw new ScanError("not-token", "No token lives at that address.");

  onStage({ stage: "holders" });
  const { byOwner, accounts, partial } = await getHolders(mint, limits.holderPages, (count) => onStage({ stage: "holders", count }));
  if (!byOwner.size) throw new ScanError("no-holders", "This token has no holders yet.");
  const birth = await birthP;
  // price data never holds the map back: partial maps show it once it lands, the final map waits at most 2.5s for it
  let mkt: Awaited<typeof mktP> = null;
  mktP.then((m) => { mkt = m; }).catch(() => {});
  const deployer = birth?.deployer ?? null;

  const scale = 10 ** asset.decimals;
  const supply = asset.supply || [...byOwner.values()].reduce((s, v) => s + v, 0) / scale;
  const top = [...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, limits.holders);

  const notes: string[] = [];
  if (partial) notes.push(`This token has more than ${(limits.holderPages * 1000).toLocaleString("en-US")} token accounts. The holder count is a lower bound; the top ${limits.holders} are still exact.`);

  const self = isOwn(mint, asset.symbol);
  const own = self ? selfLabels() : {};

  const nodes: Node[] = top.map(([owner, raw], i) => {
    const onCurve = isOnCurve(owner);
    const kind: Node["kind"] = BURN.has(owner) ? "burn" : onCurve ? "holder" : "program";
    return {
      id: owner, kind,
      label: own[owner] || (kind === "burn" ? "Burned" : kind === "program" ? "Program account" : null),
      labelSource: own[owner] ? "self" : kind !== "holder" ? "rule" : null,
      amount: raw / scale, pct: supply ? (raw / scale / supply) * 100 : 0, rank: i + 1,
      cluster: null, cohort: null, fresh: false, isDeployer: owner === deployer,
      funding: null, first: null, x: 0, y: 0, r: 0,
    };
  });

  // the launch window reads the mint's own history: start it now, it runs beside everything else
  type LBW = Omit<LaunchBuy, "bought" | "sold" | "sentOut" | "received"> & { bought: string; sold: string; sentOut: string; received: string };
  type LB = { b: LBW[]; moves: { from: string; to: string; raw: string; signature: string; slot: number }[]; createSig: string | null; full: boolean };
  const launchP = (async (): Promise<LB | null> => {
    if (!birth?.slot) return null;
    try {
      const key = `lb3:${mint}`;
      const hit = await cache.get<LB>(key);
      if (hit) return hit;
      const r = await launchBuys(mint, birth.slot, rules.launchWindowSlots);
      const v: LB = {
        b: [...r.buys.values()].map((x) => ({ ...x, bought: x.bought.toString(), sold: x.sold.toString(), sentOut: x.sentOut.toString(), received: x.received.toString() })),
        moves: r.moves.map((m) => ({ ...m, raw: m.raw.toString() })),
        createSig: r.createSig, full: r.full,
      };
      // a token minutes old may not be fully indexed yet: only remember the window once it is settled
      const settled = birth.time > 0 && Date.now() / 1000 - birth.time > 180;
      if (settled && !r.full) await cache.set(key, v);
      return v;
    } catch {
      return null;
    }
  })();

  // known names: exchanges are not people, so they never join a cluster
  const named = await identities(nodes.filter((n) => n.kind === "holder").map((n) => n.id));
  for (const n of nodes) {
    const it = named.get(n.id);
    if (n.kind !== "holder" || !it?.name || n.labelSource === "self") continue;
    n.label = it.name;
    n.labelSource = "helius";
    const t = `${it.type || ""} ${it.category || ""}`.toLowerCase();
    if (/exchange|cex|custod/.test(t)) n.kind = "exchange";
  }
  for (const n of nodes) if (n.isDeployer && !n.label) { n.label = "Deployer"; n.labelSource = "rule"; }
  const people = nodes.filter((n) => n.kind === "holder");

  // ---------------------------------------------------------------- assemble a map from whatever is known so far
  const xfers = new Map<string, Xfer[]>();
  const known = new Set<string>();
  let launch: MapResult["launch"] = null;
  let firstMissing = 0, firstErr = "", limited = false;
  // an outside wallet is only allowed to join holders once its name has been checked:
  // an exchange must never show up as a shared funder, not even for a second
  const checked = new Set<string>();
  const outsideNow = () => {
    const out = new Set<string>();
    for (const n of people) {
      if (n.funding && !byOwner.has(n.funding.funder)) out.add(n.funding.funder);
      if (n.prefund && !byOwner.has(n.prefund.from)) out.add(n.prefund.from);
      if (n.first && n.first.feePayer !== n.id && !byOwner.has(n.first.feePayer)) out.add(n.first.feePayer);
    }
    const touch = new Map<string, number>();
    for (const list of xfers.values()) for (const cp of new Set(list.map((t) => t.counterparty))) if (!byOwner.has(cp)) touch.set(cp, (touch.get(cp) || 0) + 1);
    for (const [a, c] of touch) if (c >= 2) out.add(a);
    return out;
  };
  let inflight: Promise<void> | null = null;
  const lookup = (): Promise<void> => {
    if (inflight) return inflight;
    const todo = [...outsideNow()].filter((a) => !checked.has(a)).slice(0, 500);
    if (!todo.length) return Promise.resolve();
    inflight = identities(todo)
      .then((names) => {
        for (const a of todo) checked.add(a);
        for (const a of names.keys()) known.add(a);
        for (const n of people) {
          const f = n.funding && names.get(n.funding.funder);
          if (n.funding && f) { n.funding.funderName = f.name || null; n.funding.funderType = f.type || f.category || null; }
          const pf = n.prefund && names.get(n.prefund.from);
          if (n.prefund && pf) { n.prefund.fromName = pf.name || null; n.prefund.fromType = pf.type || pf.category || null; }
        }
      })
      .catch(() => { for (const a of todo) checked.add(a); })
      .finally(() => { inflight = null; });
    return inflight;
  };
  const assemble = (final: boolean): MapResult => {
    // the rules mutate nodes; partial maps work on copies so the next pass starts clean,
    // and leave out every outside wallet whose name is not checked yet
    const ok = (a: string) => byOwner.has(a) || checked.has(a);
    const ns: Node[] = final ? nodes : nodes.map((n) => ({
      ...n, cluster: null, cohort: null,
      funding: n.funding && ok(n.funding.funder) ? n.funding : null,
      prefund: n.prefund && ok(n.prefund.from) ? n.prefund : null,
      first: n.first && n.first.feePayer !== n.id && !ok(n.first.feePayer) ? { ...n.first, feePayer: n.id } : n.first,
    }));
    const xf = final ? xfers : new Map([...xfers].map(([id, l]) => [id, l.filter((t) => ok(t.counterparty))]));
    markFresh(ns);
    const built = buildEdges(ns, deployer, asset!.symbol, known, xf, mint);
    const edges = self ? [] : built.edges;
    const virtual = self ? [] : built.virtual;
    const clusters = self ? [] : buildClusters(ns, virtual, edges);
    const cohorts = self ? [] : buildCohorts(ns, birth?.slot ?? null);
    const sc = score(ns, clusters, cohorts, launch?.pctHeld ?? 0, self);
    const all = [...ns, ...virtual];
    layout(all, edges);
    return {
      v: 1, method: METHOD_VERSION,
      token: {
        mint, name: asset!.name, symbol: asset!.symbol, image: asset!.image, decimals: asset!.decimals, supply, deployer,
        priceUsd: mkt?.priceUsd ?? null, mcapUsd: mkt?.mcapUsd ?? null, liquidityUsd: mkt?.liquidityUsd ?? null, pairUrl: mkt?.pairUrl ?? null,
        pairAddress: mkt?.pairAddress ?? null, volume24hUsd: mkt?.volume24hUsd ?? null, createdSlot: birth?.slot ?? null,
      },
      holdersTotal: byOwner.size, partial,
      nodes: all, edges, clusters, cohorts, score: sc,
      scannedAt: Date.now(), ms: Date.now() - t0, self, notes: [...notes],
      complete: final ? firstMissing <= people.length * 0.2 : false,
      launch,
    };
  };

  // ---------------------------------------------------------------- per-wallet reads, biggest holders first, all paced by the limiter
  const recent = new Map<string, Recent>();
  const readsP = (async () => {
  const k = (p: string, id: string) => `${p}:${id}`;
  const [fbHits, faHits, rcHits] = await Promise.all([
    cache.getMany<{ f: Funding | null }>(people.map((n) => k("fb2", n.id))),
    cache.getMany<{ t: FirstIn | null }>(people.map((n) => `fa:${mint}:${n.id}`)),
    cache.getMany<{ r: Recent }>(people.map((n) => k("rc", n.id))),
  ]);
  people.forEach((n, i) => {
    if (fbHits[i]) n.funding = fbHits[i]!.f;
    if (faHits[i]?.t) n.first = faHits[i]!.t;
    if (rcHits[i]) recent.set(n.id, rcHits[i]!.r);
  });

  // one wallet = one history read when its whole history fits the window (fresh and bundler wallets do);
  // aged wallets add one read for their first SOL and one for their first buy
  let done = 0;
  const total = people.length;
  let lastPartial = Date.now();
  const tick = () => {
    onStage({ stage: "links", done: ++done, total });
    if (done % 8 === 0) void lookup();
    if (Date.now() - lastPartial > 1100) {
      lastPartial = Date.now();
      for (const [id, r] of recent) xfers.set(id, r.xfers);
      onPartial(assemble(false));
    }
  };
  const note = (e: unknown) => {
    firstMissing++;
    if (e instanceof UpstreamError && e.status === 429) limited = true;
    if (!firstErr) firstErr = (e instanceof Error ? e.message : String(e)).replace(/api-key=[^&\s]+/g, "api-key=…").replace(/\s+/g, " ").slice(0, 120);
  };
  await mapLimit(people, 24, async (n, i) => {
    if (left() < 0) { if (!n.first) firstMissing++; tick(); return; }
    let r = recent.get(n.id);
    if (!r) {
      try {
        r = await recentOf(n.id, mint);
        recent.set(n.id, r);
        await cache.set(k("rc", n.id), { r }, 6 * 3600);
      } catch {
        /* the wallet reads below still run */
      }
    }
    const tasks: Promise<unknown>[] = [];
    if (!fbHits[i]) {
      if (r && r.funding !== undefined) {
        n.funding = r.funding;
        tasks.push(cache.set(k("fb2", n.id), { f: n.funding }));
      } else {
        tasks.push(fundingOf(n.id).then((f) => { n.funding = f; return cache.set(k("fb2", n.id), { f }); }).catch(() => {}));
      }
    }
    if (!n.first) {
      if (r && r.first !== undefined && r.first) {
        n.first = r.first;
        tasks.push(cache.set(`fa:${mint}:${n.id}`, { t: n.first }));
      } else {
        const accts = (accounts.get(n.id) || []).map((a) => a.address);
        tasks.push(firstIn(n.id, mint, accts, 3).then((t) => { n.first = t; return t ? cache.set(`fa:${mint}:${n.id}`, { t }) : null; }).catch(note));
      }
    }
    await Promise.all(tasks);
    tick();
  });
  })();
  // the reads are in flight; the bubbles go on screen while the links are still being read
  onPartial(assemble(false));
  await readsP;

  // the reload before each first buy: from the recent window when it reaches back far enough, otherwise one more read
  const buyers = people.filter((n) => n.first && n.first.slot);
  const pfKeys = buyers.map((n) => `pf:${mint}:${n.id}`);
  const pfHits = await cache.getMany<{ p: PreFund | null }>(pfKeys);
  await mapLimit(buyers, 24, async (n, i) => {
    if (pfHits[i]) { n.prefund = pfHits[i]!.p; return; }
    const r = recent.get(n.id);
    if (r) {
      const { found, covered } = prefundFrom(r, n.id, n.first!.slot, n.first!.signature);
      if (covered) { n.prefund = found; await cache.set(pfKeys[i], { p: found }); return; }
    }
    if (left() < 0) return;
    try {
      n.prefund = await prefundOf(n.id, n.first!.slot, n.first!.signature);
      await cache.set(pfKeys[i], { p: n.prefund });
    } catch {
      /* optional */
    }
  });
  for (const [id, r] of recent) xfers.set(id, r.xfers);

  // ---------------------------------------------------------------- names for everyone outside the holder list
  while ([...outsideNow()].some((a) => !checked.has(a))) await lookup();

  // ---------------------------------------------------------------- launch window
  const lb = await launchP;
  if (lb?.b.length) launch = buildLaunch(lb, { birthSlot: birth!.slot, deployer, scale, supply, byOwner, nodes, people, recent, mint });

  if (firstMissing) {
    console.error("first-buy reads failed", mint, firstMissing, firstErr);
    notes.push(`First buys could not be read for ${firstMissing} of ${people.length} wallets${limited ? ", because the data key hit its plan's rate limit" : ""}; they are left out of cohorts. Provider said: ${firstErr || "no answer"}.`);
  }

  onStage({ stage: "layout" });
  if (!mkt) mkt = await Promise.race([mktP.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
  const result = assemble(true);
  await cache.set(mapKey(mint), result, limits.scanTtl);
  // our own token never appears in the public "mapped recently" list
  if (!isOwn(mint, asset.symbol)) await cache.pushRecent({ mint, name: asset.name, symbol: asset.symbol, image: asset.image, score: result.score.total, band: result.score.band, at: result.scannedAt });
  return result;
}
