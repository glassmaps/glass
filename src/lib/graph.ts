// Pure functions: holders in, edges / clusters / cohorts / score out. No I/O, so every rule is unit-tested.
import { BANDS, rules, SCORE_RULES } from "@/config/site";
import type { Cluster, Cohort, Edge, Node, Receipt, ScoreItem } from "./types";

const sol = (n: number) => `${n < 0.01 ? n.toFixed(4) : n < 10 ? n.toFixed(3) : n.toFixed(1)} SOL`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const linkable = (n: Node) => n.kind === "holder";

/** A funder can link wallets only when nobody knows who it is. A named exchange funds strangers all day. */
const anonymousFunder = (n: Node) => n.funding && !n.funding.funderName && !n.funding.funderType;

export function buildEdges(holders: Node[], deployer: string | null, symbol = "") {
  const byId = new Map(holders.map((h) => [h.id, h]));
  const edges: Edge[] = [];
  const virtual = new Map<string, Node>();
  const add = (a: string, b: string, type: Edge["type"], receipts: Receipt[]) => {
    const id = `${type}:${a}:${b}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, a, b, type, receipts });
  };
  const funderNode = (addr: string): Node => {
    const id = `f:${addr}`;
    let v = virtual.get(id);
    if (!v) {
      v = {
        id, kind: "funder", label: addr === deployer ? "Deployer" : null, labelSource: addr === deployer ? "rule" : null,
        amount: 0, pct: 0, rank: 0, cluster: null, cohort: null, fresh: false, isDeployer: addr === deployer,
        funding: null, first: null, x: 0, y: 0, r: 0,
      };
      virtual.set(id, v);
    }
    return v;
  };

  // 1. a holder funded another holder, or the deployer funded a holder
  const groups = new Map<string, Node[]>();
  for (const h of holders) {
    if (!linkable(h) || !anonymousFunder(h)) continue;
    const f = h.funding!;
    const src = byId.get(f.funder);
    const what = `${short(f.funder)} sent ${sol(f.amount)} to ${short(h.id)}, the first SOL this wallet ever received`;
    const receipt = { signature: f.signature, what, time: f.timestamp };
    if (src && linkable(src)) add(src.id, h.id, "funded", [receipt]);
    else if (f.funder === deployer) add(funderNode(f.funder).id, h.id, "funded", [receipt]);
    else {
      const g = groups.get(f.funder) || [];
      g.push(h);
      groups.set(f.funder, g);
    }
  }
  // 2. two or more holders share one unnamed funder that holds none of the token
  for (const [funder, g] of groups) {
    if (g.length < rules.sharedFunderMin) continue;
    const v = funderNode(funder);
    for (const h of g) {
      const f = h.funding!;
      add(v.id, h.id, "shared-funder", [
        { signature: f.signature, what: `${short(funder)} sent ${sol(f.amount)} to ${short(h.id)} (first SOL in), and funded ${g.length - 1} other holder${g.length > 2 ? "s" : ""} the same way`, time: f.timestamp },
      ]);
    }
  }
  // 3. a holder got its first tokens straight from another holder (or the deployer), not from a pool
  for (const h of holders) {
    const from = h.first?.from;
    if (!linkable(h) || !from || from === h.id) continue;
    const src = byId.get(from);
    const receipt = { signature: h.first!.signature, what: `${short(from)} sent ${symbol ? "$" + symbol : "tokens"} directly to ${short(h.id)} before it ever bought`, time: h.first!.blockTime };
    if (src && linkable(src)) add(src.id, h.id, "transfer", [receipt]);
    else if (from === deployer) add(funderNode(from).id, h.id, "transfer", [receipt]);
  }
  return { edges, virtual: [...virtual.values()] };
}

export function buildClusters(holders: Node[], virtual: Node[], edges: Edge[]): Cluster[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p !== x) {
      p = find(p);
      parent.set(x, p);
    }
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of edges) union(e.a, e.b);

  const comps = new Map<string, string[]>();
  for (const n of [...holders, ...virtual]) {
    const r = find(n.id);
    const c = comps.get(r) || [];
    c.push(n.id);
    comps.set(r, c);
  }
  const byId = new Map([...holders, ...virtual].map((n) => [n.id, n]));
  const out: Cluster[] = [];
  for (const ids of comps.values()) {
    const members = ids.filter((id) => byId.get(id)!.kind === "holder");
    if (members.length < 2) continue;
    out.push({
      id: 0,
      members,
      pct: members.reduce((s, id) => s + byId.get(id)!.pct, 0),
      hasDeployer: ids.some((id) => byId.get(id)!.isDeployer),
    });
  }
  out.sort((a, b) => b.pct - a.pct);
  out.forEach((c, i) => {
    c.id = i + 1;
    for (const id of c.members) byId.get(id)!.cluster = c.id;
  });
  // the funder hubs inherit the colour of the cluster they hold together
  for (const v of virtual) {
    const e = edges.find((x) => x.a === v.id || x.b === v.id);
    const other = e && byId.get(e.a === v.id ? e.b : e.a);
    v.cluster = other?.cluster ?? null;
  }
  return out;
}

export function markFresh(holders: Node[]) {
  for (const h of holders) {
    const f = h.funding, b = h.first;
    h.fresh = Boolean(f && b && b.blockTime >= f.timestamp && b.blockTime - f.timestamp <= rules.freshWindowSec);
  }
}

export function buildCohorts(holders: Node[]): Cohort[] {
  const buyers = holders.filter((h) => linkable(h) && h.first && h.first.slot).sort((a, b) => a.first!.slot - b.first!.slot);
  const groups: Node[][] = [];
  let cur: Node[] = [];
  for (const h of buyers) {
    if (cur.length && h.first!.slot - cur[0].first!.slot > rules.cohortSlotWindow) {
      groups.push(cur);
      cur = [];
    }
    cur.push(h);
  }
  if (cur.length) groups.push(cur);

  const out: Cohort[] = [];
  for (const g of groups) {
    if (g.length < rules.cohortMinSize) continue;
    const n = g.length;
    const signals: string[] = [];
    const s0 = g[0].first!.slot, s1 = g[n - 1].first!.slot;
    signals.push(s0 === s1 ? `${n} wallets made their first buy in the same slot (${s0.toLocaleString("en-US")})` : `${n} wallets made their first buy within ${s1 - s0 + 1} slots (from ${s0.toLocaleString("en-US")})`);

    let strong = 0;
    // one wallet paid the fees for several of the buys
    const payers = new Map<string, number>();
    for (const h of g) if (h.first!.feePayer !== h.id) payers.set(h.first!.feePayer, (payers.get(h.first!.feePayer) || 0) + 1);
    const [topPayer, payerCount] = [...payers.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
    const sharedPayer = payerCount >= 2;
    if (sharedPayer) signals.push(`${short(topPayer)} paid the fee for ${payerCount} of the ${n} buys`);

    const spent = g.map((h) => h.first!.solSpent).filter((v) => v > 0).sort((a, b) => a - b);
    if (spent.length >= 3) {
      const med = spent[Math.floor(spent.length / 2)];
      const spread = med > 0 ? (spent[spent.length - 1] - spent[0]) / med : 1;
      if (spread <= rules.cohortSizeSpread) {
        strong++;
        signals.push(`each spent ${sol(spent[0])} to ${sol(spent[spent.length - 1])}, within ${Math.round(spread * 100)}% of each other`);
      }
    }
    const tips = new Map<number, number>();
    for (const h of g) if (h.first!.tipLamports) tips.set(h.first!.tipLamports, (tips.get(h.first!.tipLamports) || 0) + 1);
    const [tipAmt, tipCount] = [...tips.entries()].sort((a, b) => b[1] - a[1])[0] || [0, 0];
    if (tipCount >= 2 && tipCount >= n / 2) {
      strong++;
      signals.push(`${tipCount} of ${n} paid the same Jito tip (${sol(tipAmt / 1e9)})`);
    }
    const fresh = g.filter((h) => h.fresh).length;
    if (fresh >= Math.ceil(n / 2)) {
      strong++;
      signals.push(`${fresh} of ${n} were funded less than ${rules.freshWindowSec / 3600}h before buying`);
    }
    const confidence = sharedPayer || strong >= 2 ? "high" : strong === 1 ? "medium" : "low";
    out.push({ id: 0, members: g.map((h) => h.id), slot: s0, confidence, signals, pct: g.reduce((s, h) => s + h.pct, 0) });
  }
  out.sort((a, b) => b.pct - a.pct);
  const byId = new Map(holders.map((h) => [h.id, h]));
  out.forEach((c, i) => {
    c.id = i + 1;
    for (const id of c.members) byId.get(id)!.cohort = c.id;
  });
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function score(holders: Node[], clusters: Cluster[], cohorts: Cohort[]) {
  const ranked = holders.filter((h) => h.kind === "holder" || h.kind === "exchange").sort((a, b) => b.pct - a.pct);
  const top10 = ranked.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const clustered = clusters.reduce((s, c) => s + c.pct, 0);
  const cohort = cohorts.filter((c) => c.confidence !== "low").reduce((s, c) => s + c.pct, 0);
  const devCluster = clusters.find((c) => c.hasDeployer);
  const devSelf = holders.find((h) => h.isDeployer && !h.cluster);
  const dev = (devCluster?.pct || 0) + (devSelf?.pct || 0);
  const fresh = holders.filter((h) => h.fresh).reduce((s, h) => s + h.pct, 0);

  const values: Record<string, number> = { top10, clusters: clustered, cohorts: cohort, dev, fresh };
  const items: ScoreItem[] = SCORE_RULES.map((r) => {
    const value = round1(values[r.key]);
    return { key: r.key, label: r.label, value, max: r.max, penalty: round1(Math.min(r.max, Math.max(0, value - r.free) * r.weight)) };
  });
  const total = Math.max(0, Math.min(100, Math.round(100 - items.reduce((s, i) => s + i.penalty, 0))));
  const band = BANDS.find((b) => total >= b.min)!.band;
  return { total, band, items } as const;
}
