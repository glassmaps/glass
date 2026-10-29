import { limits, METHOD_VERSION, site } from "@/config/site";
import { BURN } from "@/config/known";
import * as cache from "./cache";
import { isAddress, isOnCurve } from "./address";
import { deployerOf, firstIn, fundedBy, getAsset, getHolders, identities, prefundOf, UpstreamError } from "./helius";
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

export async function analyze(mint: string, onStage: (s: Stage) => void = () => {}): Promise<MapResult> {
  const t0 = Date.now();
  if (!isAddress(mint)) throw new ScanError("bad-address", "That is not a Solana address.");
  if (!process.env.HELIUS_API_KEY && !process.env.HELIUS_RPC_URL) throw new ScanError("config", "The data key is not set on this deployment.");

  onStage({ stage: "token" });
  let asset: Awaited<ReturnType<typeof getAsset>>;
  try {
    asset = await getAsset(mint);
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 400) throw new ScanError("not-token", "No token lives at that address.");
    throw new ScanError("upstream", "The chain data provider did not answer. Try again in a moment.");
  }
  if (!asset) throw new ScanError("not-token", "No token lives at that address.");

  onStage({ stage: "holders" });
  const [{ byOwner, accounts, partial }, birth, mkt] = await Promise.all([
    getHolders(mint, limits.holderPages, (count) => onStage({ stage: "holders", count })),
    (async () => {
      const k = `dep2:${mint}`;
      const hit = await cache.get<{ d: Awaited<ReturnType<typeof deployerOf>> }>(k);
      if (hit) return hit.d;
      const d = await deployerOf(mint).catch(() => null);
      if (d) await cache.set(k, { d });
      return d;
    })(),
    market(mint),
  ]);
  const deployer = birth?.deployer ?? null;
  if (!byOwner.size) throw new ScanError("no-holders", "This token has no holders yet.");

  const scale = 10 ** asset.decimals;
  const supply = asset.supply || [...byOwner.values()].reduce((s, v) => s + v, 0) / scale;
  const top = [...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, limits.holders);

  const notes: string[] = [];
  if (partial) notes.push(`This token has more than ${(limits.holderPages * 1000).toLocaleString("en-US")} token accounts. The holder count is a lower bound; the top ${limits.holders} are still exact.`);

  const self = Boolean(site.tokenMint) && mint === site.tokenMint;
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

  // known names: exchanges are not people, so they never join a cluster
  const wallets = nodes.filter((n) => n.kind === "holder");
  const ids = await identities(wallets.map((n) => n.id));
  for (const n of wallets) {
    const it = ids.get(n.id);
    if (!it?.name || n.labelSource === "self") continue;
    n.label = it.name;
    n.labelSource = "helius";
    const t = `${it.type || ""} ${it.category || ""}`.toLowerCase();
    if (/exchange|cex|custod/.test(t)) n.kind = "exchange";
  }
  for (const n of nodes) if (n.isDeployer && !n.label) { n.label = "Deployer"; n.labelSource = "rule"; }

  // funding source of every wallet holder: cached forever, it can never change
  const people = nodes.filter((n) => n.kind === "holder");
  let fundingBlocked = false;
  let done = 0;
  const fbKeys = people.map((n) => `fb:${n.id}`);
  const fbHits = await cache.getMany<{ f: Funding | null }>(fbKeys);
  await mapLimit(people, limits.concurrency, async (n, i) => {
    if (fbHits[i]) n.funding = fbHits[i]!.f;
    else if (!fundingBlocked) {
      try {
        n.funding = await fundedBy(n.id);
        await cache.set(fbKeys[i], { f: n.funding });
      } catch (e) {
        if (e instanceof UpstreamError && (e.status === 403 || e.status === 401)) fundingBlocked = true;
      }
    }
    onStage({ stage: "funding", done: ++done, total: people.length });
  });
  if (fundingBlocked) notes.push("Funding sources were not read: the data key on this deployment is on a plan without the Wallet API.");

  // the first time each wallet received the token, read from its own token accounts
  done = 0;
  const faKeys = people.map((n) => `fa:${mint}:${n.id}`);
  const faHits = await cache.getMany<{ t: FirstIn | null }>(faKeys);
  const retry: number[] = [];
  let limited = false;
  let firstErr = "";
  const readFirst = async (i: number, tries: number) => {
    const n = people[i];
    const accts = (accounts.get(n.id) || []).map((a) => a.address);
    n.first = await firstIn(n.id, mint, accts, tries);
    if (n.first) await cache.set(faKeys[i], { t: n.first });
  };
  const note = (e: unknown) => {
    if (e instanceof UpstreamError && e.status === 429) limited = true;
    if (!firstErr) firstErr = (e instanceof Error ? e.message : String(e)).replace(/api-key=[^&\s]+/g, "api-key=…").replace(/\s+/g, " ").slice(0, 120);
  };
  await mapLimit(people, limits.concurrency, async (n, i) => {
    if (faHits[i]?.t) n.first = faHits[i]!.t;
    else {
      try {
        await readFirst(i, 3);
      } catch (e) {
        note(e);
        retry.push(i);
      }
    }
    if (!retry.includes(i)) onStage({ stage: "first", done: ++done, total: people.length });
  });
  // go again, slowly, while the request still has time
  let firstMissing = 0;
  await mapLimit(retry, 2, async (i) => {
    if (Date.now() - t0 > 34_000) { firstMissing++; return; }
    try {
      await readFirst(i, 6);
    } catch (e) {
      note(e);
      firstMissing++;
    }
    onStage({ stage: "first", done: ++done, total: people.length });
  });
  if (firstMissing) {
    console.error("first-buy reads failed", mint, firstMissing, firstErr);
    notes.push(
      `First buys could not be read for ${firstMissing} of ${people.length} wallets${limited ? ", because the data key hit its plan's rate limit" : ""}; they are left out of cohorts. Provider said: ${firstErr || "no answer"}.`,
    );
  }

  // the reload right before each first buy: aged wallets hide behind old funding, not behind this
  const buyers = people.filter((n) => n.first && n.first.slot);
  const pfKeys = buyers.map((n) => `pf:${mint}:${n.id}`);
  const pfHits = await cache.getMany<{ p: PreFund | null }>(pfKeys);
  await mapLimit(buyers, limits.concurrency, async (n, i) => {
    if (pfHits[i]) { n.prefund = pfHits[i]!.p; return; }
    if (Date.now() - t0 > 44_000) return;
    try {
      n.prefund = await prefundOf(n.id, n.first!.slot, n.first!.signature);
      await cache.set(pfKeys[i], { p: n.prefund });
    } catch {
      /* optional: the map stands without it */
    }
  });
  // who sent those reloads, and who paid for the buys: an exchange is not a person, an unnamed wallet might be
  const outside = [...new Set([
    ...buyers.map((n) => n.prefund?.from),
    ...buyers.map((n) => (n.first!.feePayer !== n.id ? n.first!.feePayer : null)),
  ].filter((a): a is string => Boolean(a) && !byOwner.has(a!)))];
  const named = outside.length ? await identities(outside) : new Map();
  for (const n of buyers) {
    const it = n.prefund && named.get(n.prefund.from);
    if (n.prefund && it) { n.prefund.fromName = it.name || null; n.prefund.fromType = it.type || it.category || null; }
  }
  const knownPayers = new Set([...named.keys()]);

  onStage({ stage: "layout" });
  markFresh(nodes);
  const { edges, virtual } = buildEdges(nodes, deployer, asset.symbol, knownPayers);
  const clusters = buildClusters(nodes, virtual, edges);
  const cohorts = buildCohorts(nodes, birth?.slot ?? null);
  const sc = score(nodes, clusters, cohorts);
  const all = [...nodes, ...virtual];
  layout(all, edges);

  const result: MapResult = {
    v: 1, method: METHOD_VERSION,
    token: {
      mint, name: asset.name, symbol: asset.symbol, image: asset.image, decimals: asset.decimals, supply, deployer,
      priceUsd: mkt?.priceUsd ?? null, mcapUsd: mkt?.mcapUsd ?? null, liquidityUsd: mkt?.liquidityUsd ?? null, pairUrl: mkt?.pairUrl ?? null,
      pairAddress: mkt?.pairAddress ?? null, volume24hUsd: mkt?.volume24hUsd ?? null, createdSlot: birth?.slot ?? null,
    },
    holdersTotal: byOwner.size, partial,
    nodes: all, edges, clusters, cohorts, score: sc,
    scannedAt: Date.now(), ms: Date.now() - t0, self, notes,
    complete: !fundingBlocked && firstMissing <= people.length * 0.2,
  };
  await cache.set(mapKey(mint), result, limits.scanTtl);
  // our own token never appears in the public "mapped recently" list
  if (!isOwn(mint, asset.symbol)) await cache.pushRecent({ mint, name: asset.name, symbol: asset.symbol, image: asset.image, score: sc.total, band: sc.band, at: result.scannedAt });
  return result;
}
