// Pure functions: holders in, edges / clusters / cohorts / score out. No I/O, so every rule is unit-tested.
import { BANDS, rules, SCORE_RULES } from "@/config/site";
import type { Cluster, Cohort, Edge, Node, Receipt, ScoreItem } from "./types";
import type { Xfer } from "./helius";
import { isOnCurve } from "./address";

const sol = (n: number) => `${n < 0.01 ? n.toFixed(4) : n < 10 ? n.toFixed(3) : n.toFixed(1)} SOL`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export const linkable = (n: Node) => n.kind === "holder";

/** A funder can link wallets only when nobody knows who it is. A named exchange funds strangers all day. */
const anonymousFunder = (n: Node) => n.funding && !n.funding.funderName && !n.funding.funderType;

const mins = (sec: number) => (sec < 3600 ? `${Math.max(1, Math.round(sec / 60))} min` : `${(sec / 3600).toFixed(1)}h`);

const SOL = "So11111111111111111111111111111111111111112";
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export function buildEdges(
  holders: Node[], deployer: string | null, symbol = "", known: Set<string> = new Set(),
  xfers: Map<string, Xfer[]> = new Map(), mint = "",
) {
  const byId = new Map(holders.map((h) => [h.id, h]));
  const edges: Edge[] = [];
  const virtual = new Map<string, Node>();
  const add = (a: string, b: string, type: Edge["type"], receipts: Receipt[]) => {
    const id = `${type}:${a}:${b}`;
    if (!edges.some((e) => e.id === id)) edges.push({ id, a, b, type, receipts });
  };
  const funderNode = (addr: string, label: string | null = null, key = addr): Node => {
    const id = `f:${key}`;
    let v = virtual.get(id);
    if (!v) {
      const lab = addr === deployer ? "Deployer" : label;
      v = {
        id, kind: "funder", label: lab, labelSource: lab ? "rule" : null,
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
  // 4. one wallet paid the fee for another's first buy: whoever pays the gas holds the keys or works for whoever does
  const payers = new Map<string, Node[]>();
  for (const h of holders) {
    const b = h.first;
    if (!linkable(h) || !b || b.feePayer === h.id || b.from === b.feePayer) continue;
    const p = b.feePayer;
    const receipt = { signature: b.signature, what: `${short(p)} paid the fee for ${short(h.id)}'s first buy`, time: b.blockTime };
    const src = byId.get(p);
    if (src && linkable(src)) add(src.id, h.id, "paid", [receipt]);
    else if (p === deployer) add(funderNode(p).id, h.id, "paid", [receipt]);
    else if (!known.has(p)) payers.set(p, [...(payers.get(p) || []), h]);
  }
  for (const [p, g] of payers) {
    if (g.length < 2) continue;
    const v = funderNode(p, "Fee payer");
    for (const h of g) add(v.id, h.id, "paid", [{ signature: h.first!.signature, what: `${short(p)} paid the fee for ${short(h.id)}'s first buy, and for ${g.length - 1} other holder${g.length > 2 ? "s" : ""}`, time: h.first!.blockTime }]);
  }

  // 5. the SOL that paid for the buy came from another holder, the deployer, or one unnamed wallet shared by several
  const reloads = new Map<string, Node[]>();
  const fromExchange = new Map<string, Node[]>();
  for (const h of holders) {
    const pf = h.prefund, b = h.first;
    if (!linkable(h) || !pf || !b) continue;
    const gap = b.blockTime - pf.blockTime;
    if (gap < 0 || gap > rules.prefundWindowSec) continue;
    const what = `${pf.fromName || short(pf.from)} sent ${sol(pf.lamports / 1e9)} to ${short(h.id)} ${mins(gap)} before its first buy`;
    const receipt = { signature: pf.signature, what, time: pf.blockTime };
    const src = byId.get(pf.from);
    if (src && linkable(src)) add(src.id, h.id, "prefunded", [receipt]);
    else if (pf.from === deployer) add(funderNode(pf.from).id, h.id, "prefunded", [receipt]);
    else if (pf.fromName) fromExchange.set(pf.from, [...(fromExchange.get(pf.from) || []), h]);
    else reloads.set(pf.from, [...(reloads.get(pf.from) || []), h]);
  }
  for (const [from, g] of reloads) {
    if (g.length < rules.sharedFunderMin) continue;
    const v = funderNode(from);
    for (const h of g) {
      const pf = h.prefund!;
      add(v.id, h.id, "prefunded", [{ signature: pf.signature, what: `${short(from)} sent ${sol(pf.lamports / 1e9)} to ${short(h.id)} ${mins(h.first!.blockTime - pf.blockTime)} before its first buy, and loaded ${g.length - 1} other holder${g.length > 2 ? "s" : ""} the same way`, time: pf.blockTime }]);
    }
  }

  // 6. an exchange withdrawal batch: one exchange sends near-equal SOL to several future top holders within minutes.
  //    Exchanges pay strangers all day, so it takes all three: same exchange, same minutes, same amount.
  let batchN = 0;
  for (const [from, g] of fromExchange) {
    const sorted = [...g].sort((a, b) => a.prefund!.blockTime - b.prefund!.blockTime);
    const runs: Node[][] = [];
    for (const h of sorted) {
      const run = runs[runs.length - 1];
      if (run && h.prefund!.blockTime - run[run.length - 1].prefund!.blockTime <= rules.batchGapSec) run.push(h);
      else runs.push([h]);
    }
    for (const run of runs) {
      const amts = run.map((h) => h.prefund!.lamports).sort((a, b) => a - b);
      const med = amts[Math.floor(amts.length / 2)];
      const same = run.filter((h) => Math.abs(h.prefund!.lamports - med) <= med * rules.batchAmountSpread);
      if (same.length < rules.batchMin) continue;
      const name = same[0].prefund!.fromName || short(from);
      const v = funderNode(from, `${name} batch`, `${from}:batch:${++batchN}`);
      const t0 = same[0].prefund!.blockTime, t1 = same[same.length - 1].prefund!.blockTime;
      for (const h of same) {
        const pf = h.prefund!;
        add(v.id, h.id, "batch", [{ signature: pf.signature, what: `${name} sent ${sol(pf.lamports / 1e9)} to ${short(h.id)}, one of ${same.length} near-equal withdrawals within ${mins(Math.max(60, t1 - t0))}, ${mins(h.first!.blockTime - pf.blockTime)} before its first buy`, time: pf.blockTime }]);
      }
    }
  }
  // 7. any transfer between two top holders, of any token, at any time: the link every bubble map is built on
  const pairs = new Map<string, { a: string; b: string; receipts: Receipt[] }>();
  const middle = new Map<string, Map<string, Xfer>>(); // outside wallet -> holder -> one receipt
  const linkableIds = new Set(holders.filter(linkable).map((h) => h.id));
  for (const [hid, list] of xfers) {
    if (!linkableIds.has(hid)) continue;
    for (const t of list) {
      const cp = t.counterparty;
      if (cp === hid) continue;
      const tok = t.mint === SOL ? "SOL" : t.mint === mint ? (symbol ? "$" + symbol : "the token") : t.symbol || "tokens";
      if (linkableIds.has(cp)) {
        const [a, b] = t.direction === "out" ? [hid, cp] : [cp, hid];
        const key = [a, b].sort().join(":");
        const p = pairs.get(key) || { a, b, receipts: [] };
        if (p.receipts.length < 3 && !p.receipts.some((r) => r.signature === t.signature)) {
          p.receipts.push({ signature: t.signature, what: `${short(a)} sent ${t.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tok} to ${short(b)} on ${day(t.timestamp)}`, time: t.timestamp });
        }
        pairs.set(key, p);
        continue;
      }
      // an outside wallet counts as a middleman only for money moving the way a bundle moves it:
      // SOL or this token sent to the holder, or this token gathered from it. Fees and swaps never qualify.
      const funding = t.direction === "in" && ((t.mint === SOL && t.amount >= 0.05) || t.mint === mint);
      const gather = t.direction === "out" && t.mint === mint;
      if (!(funding || gather) || known.has(cp) || cp === deployer || !isOnCurve(cp)) continue;
      const m = middle.get(cp) || new Map<string, Xfer>();
      if (!m.has(hid)) m.set(hid, t);
      middle.set(cp, m);
    }
  }
  for (const p of pairs.values()) add(p.a, p.b, "moved", p.receipts);
  const cap = Math.max(3, Math.floor(linkableIds.size * 0.4)); // a wallet touching most holders is a service, not a person
  for (const [cp, m] of middle) {
    if (m.size < 2 || m.size > cap) continue;
    const v = funderNode(cp, "Middleman");
    for (const [hid, t] of m) {
      const tok = t.mint === SOL ? "SOL" : symbol ? "$" + symbol : "tokens";
      const what = t.direction === "in"
        ? `${short(cp)} sent ${t.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tok} to ${short(hid)} on ${day(t.timestamp)}, and moved money with ${m.size - 1} other holder${m.size > 2 ? "s" : ""}`
        : `${short(hid)} sent ${t.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tok} to ${short(cp)} on ${day(t.timestamp)}, which also collects from ${m.size - 1} other holder${m.size > 2 ? "s" : ""}`;
      add(v.id, hid, "moved", [{ signature: t.signature, what, time: t.timestamp }]);
    }
  }
  // one transaction draws one line: a funding that is also the reload and also a "moved" is shown once, by its strongest rule
  const seen = new Set<string>();
  const kept: Edge[] = [];
  for (const e of edges) {
    const pair = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
    const receipts = e.receipts.filter((r) => !r.signature || !seen.has(`${pair}|${r.signature}`));
    for (const r of receipts) if (r.signature) seen.add(`${pair}|${r.signature}`);
    if (receipts.length) kept.push(receipts.length === e.receipts.length ? e : { ...e, receipts });
  }
  return { edges: kept, virtual: [...virtual.values()] };
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

export function buildCohorts(holders: Node[], createdSlot: number | null = null): Cohort[] {
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
    // buys that land in the block the token was created in were placed together with the creation: a launch bundle
    const atBirth = createdSlot !== null && g[0].first!.slot <= createdSlot + rules.launchBlockSlots;
    if (g.length < (atBirth ? 2 : rules.cohortMinSize)) continue;
    const n = g.length;
    const signals: string[] = [];
    const s0 = g[0].first!.slot, s1 = g[n - 1].first!.slot;
    signals.push(s0 === s1 ? `${n} wallets made their first buy in the same slot (${s0.toLocaleString("en-US")})` : `${n} wallets made their first buy within ${s1 - s0 + 1} slots (from ${s0.toLocaleString("en-US")})`);

    let strong = 0;
    if (atBirth) {
      strong += 2;
      signals.push(s0 === createdSlot ? "in the same block the token was created: bought together with the launch" : `within ${rules.launchBlockSlots + 1} slots of the token's creation`);
    }
    const reloaded = g.filter((h) => h.prefund && h.first!.blockTime - h.prefund.blockTime >= 0 && h.first!.blockTime - h.prefund.blockTime <= rules.freshWindowSec).length;
    if (reloaded >= Math.ceil(n / 2)) {
      strong++;
      signals.push(`${reloaded} of ${n} were loaded with SOL less than ${rules.freshWindowSec / 3600}h before buying`);
    }
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

export function score(holders: Node[], clusters: Cluster[], cohorts: Cohort[], launchHeld = 0) {
  const ranked = holders.filter((h) => h.kind === "holder" || h.kind === "exchange").sort((a, b) => b.pct - a.pct);
  const top10 = ranked.slice(0, 10).reduce((s, h) => s + h.pct, 0);
  const clustered = clusters.reduce((s, c) => s + c.pct, 0);
  const cohort = cohorts.filter((c) => c.confidence !== "low").reduce((s, c) => s + c.pct, 0);
  const devCluster = clusters.find((c) => c.hasDeployer);
  const devSelf = holders.find((h) => h.isDeployer && !h.cluster);
  const dev = (devCluster?.pct || 0) + (devSelf?.pct || 0);
  const fresh = holders.filter((h) => h.fresh).reduce((s, h) => s + h.pct, 0);

  const values: Record<string, number> = { top10, clusters: clustered, cohorts: cohort, dev, fresh, launch: launchHeld };
  const items: ScoreItem[] = SCORE_RULES.map((r) => {
    const value = round1(values[r.key]);
    return { key: r.key, label: r.label, value, max: r.max, penalty: round1(Math.min(r.max, Math.max(0, value - r.free) * r.weight)) };
  });
  const total = Math.max(0, Math.min(100, Math.round(100 - items.reduce((s, i) => s + i.penalty, 0))));
  const band = BANDS.find((b) => total >= b.min)!.band;
  return { total, band, items } as const;
}
