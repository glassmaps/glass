// The launch window read from the token's own history: who got supply in the creation block and the slots
// right after it, from where, for how much SOL, and where those tokens went. Pure: it only reads transactions.
import { isOnCurve } from "./address";
import { JITO_TIP } from "@/config/known";

export interface LTx {
  slot: number;
  transactionIndex?: number;
  blockTime: number | null;
  transaction: { signatures: string[]; message: { accountKeys: { pubkey: string; signer: boolean }[]; instructions: LIx[] } };
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: LBal[];
    postTokenBalances?: LBal[];
    innerInstructions?: { index: number; instructions: LIx[] }[];
  } | null;
}
type LIx = { program?: string; programId?: string; parsed?: { type?: string; info?: Record<string, unknown> } };
interface LBal { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string; decimals: number } }

export interface LaunchBuy {
  wallet: string;
  slot: number; // first slot it got supply in
  bought: bigint; // raw units taken from the curve or pool inside the window
  sold: bigint; // raw units sent back to the curve or pool inside the window
  sentOut: bigint; // raw units passed to other wallets inside the window
  received: bigint; // raw units received from other wallets inside the window
  solSpent: number; // lamports out of the wallet across its window transactions (buys, fees, tips)
  tip: number; // Jito tip lamports
  feePayer: string; // who paid for its first buy
  signature: string; // its first buy
  sameTxAsCreate: boolean; // bought in the transaction that created the token
}

export interface LaunchMove { from: string; to: string; raw: bigint; signature: string; slot: number }

export interface LaunchRead {
  createSig: string | null;
  buys: Map<string, LaunchBuy>;
  moves: LaunchMove[];
  txs: number;
}

/**
 * Per transaction, a balance change of the mint is one of three things:
 *  - a buy: an off-curve account (bonding curve, pool vault) lost tokens and wallets gained them
 *  - a sell: wallets lost tokens and an off-curve account gained them
 *  - a transfer: one wallet lost what another wallet gained
 * Counting only gains would count a transfer twice; this keeps every token counted once.
 */
export function readLaunch(txs: LTx[], mint: string): LaunchRead {
  const buys = new Map<string, LaunchBuy>();
  const moves: LaunchMove[] = [];
  let createSig: string | null = null;
  const sorted = [...txs].filter((t) => t.meta && !t.meta.err).sort((a, b) => a.slot - b.slot || (a.transactionIndex ?? 0) - (b.transactionIndex ?? 0));
  for (const tx of sorted) {
    const m = tx.meta!;
    const sig = tx.transaction.signatures[0];
    const keys = tx.transaction.message.accountKeys;
    const all = [...tx.transaction.message.instructions, ...(m.innerInstructions || []).flatMap((x) => x.instructions)];
    const creates = all.some((ix) => ix.parsed?.type === "initializeMint" || ix.parsed?.type === "initializeMint2") && all.some((ix) => String(ix.parsed?.info?.mint || "") === mint);
    if (creates && !createSig) createSig = sig;

    const delta = new Map<string, bigint>();
    for (const b of m.preTokenBalances || []) if (b.mint === mint && b.owner) delta.set(b.owner, (delta.get(b.owner) || 0n) - BigInt(b.uiTokenAmount.amount));
    for (const b of m.postTokenBalances || []) if (b.mint === mint && b.owner) delta.set(b.owner, (delta.get(b.owner) || 0n) + BigInt(b.uiTokenAmount.amount));
    // a freshly minted supply shows no pre balance: the mint landing on the curve is not a buy
    const gain: [string, bigint][] = [], loss: [string, bigint][] = [];
    let offIn = 0n;
    for (const [o, d] of delta) {
      if (d === 0n) continue;
      if (isOnCurve(o)) (d > 0n ? gain : loss).push([o, d > 0n ? d : -d]);
      else if (d > 0n) offIn += d;
    }
    if (!gain.length && !loss.length) continue;

    let tip = 0;
    for (const ix of all) if (ix.parsed?.type === "transfer" && JITO_TIP.has(String(ix.parsed.info?.destination))) tip += Number(ix.parsed.info?.lamports) || 0;

    // transfers first: what wallets lost and other wallets gained in the same transaction
    const lossLeft = loss.map(([o, a]) => [o, a] as [string, bigint]);
    const gainLeft = gain.map(([o, a]) => [o, a] as [string, bigint]);
    let curveCover = offIn; // losses that went to a curve or pool are sells, not transfers
    for (const l of lossLeft) {
      const s = l[1] < curveCover ? l[1] : curveCover;
      curveCover -= s;
      if (s) entry(buys, l[0], tx).sold += s;
      l[1] -= s;
    }
    for (const g of gainLeft) {
      for (const l of lossLeft) {
        if (!g[1] || !l[1]) continue;
        const a = g[1] < l[1] ? g[1] : l[1];
        moves.push({ from: l[0], to: g[0], raw: a, signature: sig, slot: tx.slot });
        entry(buys, l[0], tx).sentOut += a;
        entry(buys, g[0], tx).received += a;
        g[1] -= a;
        l[1] -= a;
      }
      // whatever is left came off the curve, out of a pool or straight from the mint: supply taken at launch.
      // (in the creation transaction the curve has no pre balance, so it shows as a gain, not a loss)
      if (g[1] > 0n) {
        const rec = entry(buys, g[0], tx);
        rec.bought += g[1];
        if (!rec.signature) { rec.signature = sig; rec.feePayer = keys[0]?.pubkey || g[0]; rec.slot = tx.slot; rec.sameTxAsCreate = createSig === sig; }
      }
    }
    // SOL each involved wallet spent in this transaction
    const touched = new Set([...gain, ...loss].map(([o]) => o));
    keys.forEach((k, i) => {
      if (!touched.has(k.pubkey)) return;
      const spent = (m.preBalances[i] || 0) - (m.postBalances[i] || 0);
      const rec = buys.get(k.pubkey);
      if (rec && spent > 0) rec.solSpent += spent;
    });
    const payer = keys[0]?.pubkey;
    if (payer && touched.has(payer)) { const rec = buys.get(payer); if (rec) rec.tip += tip; }
    else for (const [o] of gain) { const rec = buys.get(o); if (rec && tip) { rec.tip += tip; break; } }
  }
  // the creation transaction: the one that initialised the mint, else the first one in the window
  if (!createSig && sorted.length) createSig = sorted[0].transaction.signatures[0];
  for (const b of buys.values()) b.sameTxAsCreate = Boolean(b.signature) && b.signature === createSig;
  // a wallet that only received from another wallet in the window is a recipient, not a buyer
  for (const [o, b] of buys) if (b.bought === 0n && b.sold === 0n && b.received === 0n && b.sentOut === 0n) buys.delete(o);
  return { createSig, buys, moves, txs: sorted.length };
}

function entry(m: Map<string, LaunchBuy>, wallet: string, tx: LTx): LaunchBuy {
  let e = m.get(wallet);
  if (!e) {
    e = { wallet, slot: tx.slot, bought: 0n, sold: 0n, sentOut: 0n, received: 0n, solSpent: 0, tip: 0, feePayer: "", signature: "", sameTxAsCreate: false };
    m.set(wallet, e);
  }
  return e;
}
