import { limits, METHOD_VERSION, site } from "@/config/site";
import { BURN } from "@/config/known";
import * as cache from "./cache";
import { isAddress, isOnCurve } from "./address";
import { deployerOf, firstIn, fundedBy, getAsset, getHolders, identities, UpstreamError } from "./helius";
import { market } from "./market";
import { mapLimit } from "./pool";
import { buildClusters, buildCohorts, buildEdges, markFresh, score } from "./graph";
import { layout } from "./layout";
import type { FirstIn, Funding, MapResult, Node, Stage } from "./types";

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
  const [{ byOwner, partial }, deployer, mkt] = await Promise.all([
    getHolders(mint, limits.holderPages, (count) => onStage({ stage: "holders", count })),
    (async () => {
      const k = `dep:${mint}`;
      const hit = await cache.get<{ d: string | null }>(k);
      if (hit) return hit.d;
      const d = await deployerOf(mint).catch(() => null);
      if (d) await cache.set(k, { d });
      return d;
    })(),
    market(mint),
  ]);
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

  // the first time each wallet received the token
  done = 0;
  const faKeys = people.map((n) => `fa:${mint}:${n.id}`);
  const faHits = await cache.getMany<{ t: FirstIn | null }>(faKeys);
  const retry: number[] = [];
  let limited = false;
  const readFirst = async (i: number, tries: number) => {
    const n = people[i];
    n.first = await firstIn(n.id, mint, tries);
    if (n.first) await cache.set(faKeys[i], { t: n.first });
  };
  await mapLimit(people, limits.concurrency, async (n, i) => {
    if (faHits[i]) n.first = faHits[i]!.t;
    else {
      try {
        await readFirst(i, 3);
      } catch (e) {
        if (e instanceof UpstreamError && e.status === 429) limited = true;
        retry.push(i);
      }
    }
    if (!retry.includes(i)) onStage({ stage: "first", done: ++done, total: people.length });
  });
  // a plan's rate limit is the usual reason a read fails: go again, slowly, while the request still has time
  let firstMissing = 0;
  await mapLimit(retry, 2, async (i) => {
    if (Date.now() - t0 > 38_000) { firstMissing++; return; }
    try {
      await readFirst(i, 6);
    } catch {
      firstMissing++;
    }
    onStage({ stage: "first", done: ++done, total: people.length });
  });
  if (firstMissing)
    notes.push(
      `First buys could not be read for ${firstMissing} of ${people.length} wallets${limited ? ", because the data key on this deployment hit its plan's rate limit" : ""}; they are left out of cohorts. Rescan to try them again.`,
    );

  onStage({ stage: "layout" });
  markFresh(nodes);
  const { edges, virtual } = buildEdges(nodes, deployer, asset.symbol);
  const clusters = buildClusters(nodes, virtual, edges);
  const cohorts = buildCohorts(nodes);
  const sc = score(nodes, clusters, cohorts);
  const all = [...nodes, ...virtual];
  layout(all, edges);

  const result: MapResult = {
    v: 1, method: METHOD_VERSION,
    token: {
      mint, name: asset.name, symbol: asset.symbol, image: asset.image, decimals: asset.decimals, supply, deployer,
      priceUsd: mkt?.priceUsd ?? null, mcapUsd: mkt?.mcapUsd ?? null, liquidityUsd: mkt?.liquidityUsd ?? null, pairUrl: mkt?.pairUrl ?? null,
    },
    holdersTotal: byOwner.size, partial,
    nodes: all, edges, clusters, cohorts, score: sc,
    scannedAt: Date.now(), ms: Date.now() - t0, self, notes,
  };
  await cache.set(mapKey(mint), result, limits.scanTtl);
  await cache.pushRecent({ mint, name: asset.name, symbol: asset.symbol, image: asset.image, score: sc.total, band: sc.band, at: result.scannedAt });
  return result;
}
