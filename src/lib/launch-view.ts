// Turns the raw launch window into what the map shows: shares of supply, what is still held and by whom,
// and where tokens passed from launch wallets to other wallets.
import type { Launch, LaunchWallet, Node } from "./types";
import type { Recent } from "./helius";
import { rules } from "@/config/site";

type Raw = {
  b: { wallet: string; slot: number; bought: string; sold: string; sentOut: string; received: string; solSpent: number; tip: number; feePayer: string; signature: string; sameTxAsCreate: boolean }[];
  moves: { from: string; to: string; raw: string; signature: string; slot: number }[];
  createSig: string | null;
  full: boolean;
};

export function buildLaunch(
  lb: Raw,
  ctx: { birthSlot: number; deployer: string | null; scale: number; supply: number; byOwner: Map<string, number>; nodes: Node[]; people: Node[]; recent: Map<string, Recent>; mint: string },
): Launch | null {
  const { birthSlot, deployer, scale, supply, byOwner, nodes } = ctx;
  const pct = (raw: number) => (supply ? (raw / scale / supply) * 100 : 0);
  const takers = lb.b.filter((x) => BigInt(x.bought) > 0n);
  if (!takers.length) return null;
  const launchSet = new Set(takers.map((x) => x.wallet));
  const rankOf = new Map(nodes.filter((n) => n.rank).map((n) => [n.id, n.rank]));

  // wallets that got tokens from a launch wallet: inside the window, by a mapped holder's first receipt,
  // or by a token transfer in a mapped holder's recent history
  const passed = new Set<string>();
  for (const m of lb.moves) if (launchSet.has(m.from) && !launchSet.has(m.to)) passed.add(m.to);
  for (const n of ctx.people) {
    if (launchSet.has(n.id)) continue;
    if (n.first?.from && launchSet.has(n.first.from)) passed.add(n.id);
    const r = ctx.recent.get(n.id);
    if (r?.xfers.some((t) => t.mint === ctx.mint && t.direction === "in" && launchSet.has(t.counterparty))) passed.add(n.id);
  }
  if (deployer) passed.delete(deployer);
  // an exchange deposit or a program is not a holder in the bundle's hands
  for (const n of nodes) if (n.kind !== "holder") passed.delete(n.id);

  const list: LaunchWallet[] = takers.map((x) => ({
    id: x.wallet,
    offset: x.slot - birthSlot,
    got: pct(Number(x.bought)),
    received: pct(Number(x.received)),
    sold: pct(Number(x.sold)),
    sentOut: pct(Number(x.sentOut)),
    holds: pct(byOwner.get(x.wallet) || 0),
    sol: x.solSpent / 1e9,
    tip: x.tip / 1e9,
    feePayer: x.feePayer || x.wallet,
    signature: x.signature,
    sameTx: x.sameTxAsCreate,
    dev: x.wallet === deployer,
    rank: rankOf.get(x.wallet) ?? null,
  }));
  list.sort((a, b) => Number(b.dev) - Number(a.dev) || b.got - a.got);

  const devW = list.find((w) => w.dev) || null;
  const others = list.filter((w) => !w.dev);
  const sum = (ws: LaunchWallet[], f: (w: LaunchWallet) => number) => ws.reduce((t, w) => t + f(w), 0);

  const bySlotM = new Map<number, { wallets: number; pct: number }>();
  for (const w of list) {
    const e = bySlotM.get(w.offset) || { wallets: 0, pct: 0 };
    e.wallets++;
    e.pct += w.got;
    bySlotM.set(w.offset, e);
  }
  const bySlot = [...bySlotM.entries()].sort((a, b) => a[0] - b[0]).map(([offset, v]) => ({ offset, ...v }));

  const heldDirect = sum(others, (w) => w.holds);
  const heldPassed = [...passed].reduce((t, a) => t + pct(byOwner.get(a) || 0), 0);
  const payers = new Map<string, number>();
  for (const w of list) if (w.feePayer !== w.id) payers.set(w.feePayer, (payers.get(w.feePayer) || 0) + 1);

  // mark the map
  for (const n of nodes) {
    const w = list.find((x) => x.id === n.id);
    if (w) {
      n.atLaunch = true;
      n.launchRole = w.dev ? "dev" : "bundle";
      n.launchGot = w.got;
      n.launchOffset = w.offset;
    } else if (passed.has(n.id)) {
      n.launchRole = "passed";
    }
  }

  return {
    slot: birthSlot,
    window: rules.launchWindowSlots,
    createSig: lb.createSig,
    wallets: others.length,
    pctBought: sum(list, (w) => w.got),
    pctBlock0: bySlot.find((s) => s.offset === 0)?.pct ?? 0,
    dev: devW ? { got: devW.got, holds: devW.holds, sameTx: devW.sameTx } : null,
    pctBundle: sum(others, (w) => w.got),
    pctSoldInWindow: sum(list, (w) => w.sold),
    pctHeld: heldDirect + heldPassed,
    pctHeldDirect: heldDirect,
    pctHeldPassed: heldPassed,
    pctHeldAll: heldDirect + heldPassed + (devW?.holds ?? 0),
    passedTo: passed.size,
    sol: sum(list, (w) => w.sol),
    tipped: list.filter((w) => w.tip > 0).length,
    paidByOther: list.filter((w) => w.feePayer !== w.id).length,
    sharedPayers: [...payers.values()].filter((c) => c >= 2).length,
    bySlot,
    list: list.slice(0, 60),
    heldBy: list.filter((w) => w.rank !== null).length,
    partial: lb.full,
  };
}
