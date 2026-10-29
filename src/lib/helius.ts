import { sleep } from "./pool";
import { classOf, take } from "./limiter";
import { isOnCurve } from "./address";
import { JITO_TIP, PROGRAMS } from "@/config/known";
import type { FirstIn, Funding, PreFund } from "./types";
import * as cache from "./cache";
import { readLaunch, type LTx } from "./launch";

const KEY = process.env.HELIUS_API_KEY || "";
const RPC = process.env.HELIUS_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${KEY}`;
const API = (process.env.HELIUS_API_URL || "https://api.helius.xyz").replace(/\/$/, "");

export const hasKey = Boolean(KEY);

export class UpstreamError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function withRetry<T>(run: () => Promise<Response>, parse: (r: Response) => Promise<T>, tries = 4): Promise<T> {
  let wait = 250;
  for (let i = 0; ; i++) {
    const res = await run();
    if (res.ok) return parse(res);
    // 429 and 5xx are worth another try, anything else is an answer
    if ((res.status === 429 || res.status >= 500) && i < tries - 1) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep(ra ? ra * 1000 : wait);
      wait *= 2;
      continue;
    }
    throw new UpstreamError(res.status, `${res.status} ${await res.text().catch(() => "")}`.slice(0, 240));
  }
}

let rid = 0;
export async function rpc<T>(method: string, params: unknown, tries = 4): Promise<T> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params });
  const cls = classOf(method);
  return withRetry(
    async () => (await take(cls), fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body, cache: "no-store" })),
    async (r) => {
      const j = (await r.json()) as { result?: T; error?: { code: number; message: string } };
      if (j.error) throw new UpstreamError(400, `${method}: ${j.error.message}`);
      return j.result as T;
    },
    tries,
  );
}

async function wallet<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await withRetry(
      async () =>
        (await take("wallet"), fetch(`${API}${path}`, {
          ...init,
          headers: { "X-Api-Key": KEY, "content-type": "application/json", ...(init?.headers || {}) },
          cache: "no-store",
        })),
      (r) => r.json() as Promise<T>,
    );
  } catch (e) {
    if (e instanceof UpstreamError && e.status === 404) return null;
    throw e;
  }
}

// ------------------------------------------------------------------ token

interface Asset {
  id: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    files?: { uri?: string; cdn_uri?: string }[];
    links?: { image?: string };
  };
  token_info?: { supply?: number; decimals?: number; symbol?: string };
  interface?: string;
}

export async function getAsset(mint: string) {
  const a = await rpc<Asset | null>("getAsset", { id: mint, options: { showFungible: true } });
  if (!a || a.token_info?.decimals === undefined) return null;
  const decimals = a.token_info.decimals ?? 0;
  return {
    name: a.content?.metadata?.name?.trim() || "Unknown",
    symbol: (a.content?.metadata?.symbol || a.token_info.symbol || "").trim(),
    image: a.content?.files?.[0]?.cdn_uri || a.content?.links?.image || a.content?.files?.[0]?.uri || null,
    decimals,
    supply: (a.token_info.supply ?? 0) / 10 ** decimals,
  };
}

interface TokenAccountsPage {
  token_accounts: { address: string; owner: string; amount: number }[];
}

/** Every owner of the mint with a balance, summed across token accounts. Reads at most `pages` x 1000 accounts. */
export async function getHolders(mint: string, pages: number, onPage?: (n: number) => void) {
  const byOwner = new Map<string, number>();
  // every token account an owner holds this mint in, largest first: where its first receipt is recorded
  const accounts = new Map<string, { address: string; amount: number }[]>();
  let partial = false;
  for (let page = 1; page <= pages; page++) {
    const r = await rpc<TokenAccountsPage>("getTokenAccounts", { mint, page, limit: 1000, options: { showZeroBalance: false } });
    for (const t of r.token_accounts) {
      if (!t.amount) continue;
      byOwner.set(t.owner, (byOwner.get(t.owner) || 0) + Number(t.amount));
      const list = accounts.get(t.owner) || [];
      list.push({ address: t.address, amount: Number(t.amount) });
      accounts.set(t.owner, list);
    }
    onPage?.(byOwner.size);
    if (r.token_accounts.length < 1000) break;
    if (page === pages) partial = true;
  }
  for (const list of accounts.values()) list.sort((a, b) => b.amount - a.amount);
  return { byOwner, accounts, partial };
}

// ------------------------------------------------------------------ wallets

interface FundedBy {
  funder: string;
  funderName: string | null;
  funderType: string | null;
  amount: number;
  signature: string;
  timestamp: number;
  slot: number;
}

export async function fundedBy(address: string): Promise<Funding | null> {
  const f = await wallet<FundedBy>(`/v1/wallet/${address}/funded-by`);
  if (!f || !f.funder) return null;
  return {
    funder: f.funder,
    funderName: f.funderName ?? null,
    funderType: f.funderType ?? null,
    amount: Number(f.amount) || 0,
    signature: f.signature,
    timestamp: f.timestamp,
    slot: f.slot,
  };
}

interface Identity {
  address: string;
  name?: string;
  type?: string;
  category?: string;
}

/** Known names (exchanges, protocols, market makers) for up to 100 addresses per call. Missing ones are simply absent. */
export async function identities(addresses: string[]): Promise<Map<string, Identity>> {
  const out = new Map<string, Identity>();
  // names barely change: remember them, and remember who has none, for a week
  const uniq = [...new Set(addresses)];
  const hits = await cache.getMany<{ i: Identity | null }>(uniq.map((a) => `id:${a}`));
  const missing: string[] = [];
  uniq.forEach((a, i) => {
    const h = hits[i];
    if (h) { if (h.i) out.set(a, h.i); } else missing.push(a);
  });
  addresses = missing;
  for (let i = 0; i < addresses.length; i += 100) {
    try {
      const r = await wallet<unknown>(`/v1/wallet/batch-identity`, {
        method: "POST",
        body: JSON.stringify({ addresses: addresses.slice(i, i + 100) }),
      });
      const list: Identity[] = Array.isArray(r)
        ? r
        : Array.isArray((r as { data?: unknown })?.data)
          ? ((r as { data: Identity[] }).data)
          : [];
      const named = new Set<string>();
      for (const it of list) if (it && it.address && it.name) { out.set(it.address, it); named.add(it.address); }
      await Promise.all(addresses.slice(i, i + 100).map((a) => cache.set(`id:${a}`, { i: named.has(a) ? out.get(a)! : null }, 7 * 86400)));
    } catch {
      /* labels are a nice-to-have; the map is complete without them */
    }
  }
  return out;
}

// ------------------------------------------------------------------ transactions

type Parsed = {
  programId?: string;
  program?: string;
  parsed?: { type?: string; info?: Record<string, unknown> };
};

interface FullTx {
  slot: number;
  blockTime: number | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: { pubkey: string; signer: boolean }[]; instructions: Parsed[] };
  };
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokBal[];
    postTokenBalances?: TokBal[];
    innerInstructions?: { index: number; instructions: Parsed[] }[];
  } | null;
}

interface TokBal {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

interface GtfaPage {
  data: FullTx[];
  paginationToken: string | null;
}

const gtfa = (address: string, filters: Record<string, unknown>, limit = 1, tries = 4, sortOrder: "asc" | "desc" = "asc", paginationToken?: string) =>
  rpc<GtfaPage>("getTransactionsForAddress", [
    address,
    {
      transactionDetails: "full",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 1,
      sortOrder,
      limit,
      ...(paginationToken ? { paginationToken } : {}),
      filters: { status: "succeeded", ...filters },
    },
  ], tries);

/** The wallet that paid for the mint's first transaction, and the slot the token was born in. */
export async function deployerOf(mint: string): Promise<{ deployer: string | null; slot: number; time: number } | null> {
  const r = await gtfa(mint, {});
  const tx = r.data?.[0];
  if (!tx) return null;
  return { deployer: tx.transaction.message.accountKeys[0]?.pubkey ?? null, slot: tx.slot, time: tx.blockTime || 0 };
}

export interface Xfer {
  signature: string;
  timestamp: number;
  direction: "in" | "out";
  counterparty: string;
  mint: string;
  symbol: string | null;
  amount: number;
}

/** A wallet's most recent token and SOL transfers (Wallet API, newest first, one page of 100). */
export async function transfersOf(address: string): Promise<Xfer[]> {
  const r = await wallet<{ data?: Xfer[] }>(`/v1/wallet/${address}/transfers?limit=100`);
  return (r?.data || []).filter((t) => t && t.counterparty && t.signature);
}

/**
 * Everyone who received the token in its first slots, straight from the mint's own history.
 * This is how launch bundles are measured: buys that landed with the creation, whether or not those wallets still hold.
 */
/**
 * Every transaction of the mint inside the launch window, all pages (up to 1,000), read by src/lib/launch.ts.
 * `full` is true when the window held more than that and the read stopped early.
 */
export async function launchBuys(mint: string, createdSlot: number, slots: number) {
  const txs: FullTx[] = [];
  let token: string | undefined;
  let full = false;
  for (let page = 0; page < 10; page++) {
    const r = await gtfa(mint, { slot: { gte: createdSlot, lte: createdSlot + slots } }, 100, 3, "asc", token);
    txs.push(...(r.data || []));
    token = r.paginationToken || undefined;
    if (!token || (r.data || []).length < 100) break;
    if (page === 9) full = true;
  }
  return { ...readLaunch(txs as LTx[], mint), full };
}

const SOLM = "So11111111111111111111111111111111111111112";

function allIx(tx: FullTx): Parsed[] {
  return [...tx.transaction.message.instructions, ...((tx.meta?.innerInstructions || []).flatMap((x) => x.instructions))];
}

/** SOL that moved straight between two wallets in this transaction (system transfers and account creation). */
function solMoves(tx: FullTx) {
  const out: { from: string; to: string; lamports: number }[] = [];
  for (const ix of allIx(tx)) {
    if (ix.program !== "system") continue;
    const ty = ix.parsed?.type, info = ix.parsed?.info || {};
    if (ty === "transfer" || ty === "transferWithSeed") out.push({ from: String(info.source), to: String(info.destination), lamports: Number(info.lamports) || 0 });
    else if (ty === "createAccount" || ty === "createAccountWithSeed") out.push({ from: String(info.source), to: String(info.newAccount), lamports: Number(info.lamports) || 0 });
  }
  return out;
}

/**
 * Where a wallet's first SOL came from, read from its own oldest transactions over plain RPC.
 * Same answer as the Wallet API's funded-by, at five times the rate limit; names are added afterwards in one batch.
 */
export async function fundingOf(address: string, tries = 3): Promise<Funding | null> {
  const r = await gtfa(address, {}, 5, tries, "asc");
  for (const tx of r.data || []) {
    if (!tx.meta || tx.meta.err) continue;
    const m = solMoves(tx).filter((x) => x.to === address && x.from !== address && x.lamports > 0).sort((a, b) => b.lamports - a.lamports)[0];
    if (m) return { funder: m.from, funderName: null, funderType: null, amount: m.lamports / 1e9, signature: tx.transaction.signatures[0], timestamp: tx.blockTime || 0, slot: tx.slot };
  }
  return null;
}

export interface Recent {
  xfers: Xfer[];
  sols: { from: string; lamports: number; signature: string; slot: number; blockTime: number }[]; // SOL received, newest first
  oldestSlot: number; // how far back the window reaches
  complete: boolean; // the window holds the wallet's whole history
  // when the window is the whole history, the oldest SOL in and the first buy are already in it: no extra reads
  funding?: Funding | null;
  first?: FirstIn | null;
}

/**
 * A wallet's latest transactions, read once and used twice: transfers to and from other wallets
 * (for links between holders and middlemen) and the SOL it received (for the reload before its first buy).
 */
export async function recentOf(address: string, mint: string, size = 60, tries = 3): Promise<Recent> {
  // token transfers land on the wallet's token accounts, not the wallet: ask for those too, and fall back if refused
  let withTokens = true;
  const r = await gtfa(address, { tokenAccounts: "balanceChanged" }, size, tries, "desc").catch(() => {
    withTokens = false;
    return gtfa(address, {}, size, tries, "desc");
  });
  const txs = (r.data || []).filter((t) => t.meta && !t.meta.err);
  const xfers: Xfer[] = [];
  const sols: Recent["sols"] = [];
  for (const tx of txs) {
    const sig = tx.transaction.signatures[0], ts = tx.blockTime || 0;
    for (const m of solMoves(tx)) {
      if (m.lamports <= 0) continue;
      if (m.to === address && m.from !== address) {
        xfers.push({ signature: sig, timestamp: ts, direction: "in", counterparty: m.from, mint: SOLM, symbol: "SOL", amount: m.lamports / 1e9 });
        sols.push({ from: m.from, lamports: m.lamports, signature: sig, slot: tx.slot, blockTime: ts });
      } else if (m.from === address && m.to !== address) {
        xfers.push({ signature: sig, timestamp: ts, direction: "out", counterparty: m.to, mint: SOLM, symbol: "SOL", amount: m.lamports / 1e9 });
      }
    }
    // token movements: who gained what this wallet lost, and the other way round (pools are program accounts, filtered by the rules)
    const delta = new Map<string, Map<string, { d: bigint; dec: number }>>();
    const add = (b: TokBal, sign: 1n | -1n) => {
      if (!b.owner) return;
      const byOwner = delta.get(b.mint) || new Map();
      const cur = byOwner.get(b.owner) || { d: 0n, dec: b.uiTokenAmount.decimals };
      cur.d += sign * BigInt(b.uiTokenAmount.amount);
      byOwner.set(b.owner, cur);
      delta.set(b.mint, byOwner);
    };
    for (const b of tx.meta!.postTokenBalances || []) add(b, 1n);
    for (const b of tx.meta!.preTokenBalances || []) add(b, -1n);
    for (const [m, owners] of delta) {
      if (m === SOLM) continue;
      const mine = owners.get(address);
      if (!mine || mine.d === 0n) continue;
      const dir: "in" | "out" = mine.d > 0n ? "in" : "out";
      for (const [o, v] of owners) {
        if (o === address || v.d === 0n || (v.d > 0n) === (mine.d > 0n)) continue;
        const amt = Number(v.d < 0n ? -v.d : v.d) / 10 ** v.dec;
        xfers.push({ signature: sig, timestamp: ts, direction: dir, counterparty: o, mint: m, symbol: m === mint ? null : null, amount: amt });
      }
    }
  }
  const complete = (r.data || []).length < size;
  const out: Recent = { xfers, sols, oldestSlot: txs.length ? txs[txs.length - 1].slot : 0, complete };
  if (complete) {
    const oldestIn = [...sols].reverse()[0];
    const ftx = txs.find((t) => t.slot === oldestIn?.slot && t.transaction.signatures[0] === oldestIn?.signature);
    out.funding = oldestIn ? { funder: oldestIn.from, funderName: null, funderType: null, amount: oldestIn.lamports / 1e9, signature: oldestIn.signature, timestamp: ftx?.blockTime || oldestIn.blockTime, slot: oldestIn.slot } : null;
    // only trust "no first buy here" when token-account history was included
    const buy = [...txs].reverse().find((t) => received(t, address, mint));
    const read = buy ? readFirstIn(buy, address, mint) : null;
    if (read || withTokens) out.first = read;
  }
  return out;
}

/** The reload before a first buy, from a recent window when it reaches back far enough. */
export function prefundFrom(rec: Recent, owner: string, beforeSlot: number, skipSig: string): { found: PreFund | null; covered: boolean } {
  const covered = rec.complete || rec.oldestSlot <= beforeSlot;
  const s = rec.sols.find((x) => x.slot <= beforeSlot && x.signature !== skipSig && x.lamports >= 5_000_000 && x.from !== owner);
  return { found: s ? { from: s.from, fromName: null, fromType: null, lamports: s.lamports, signature: s.signature, slot: s.slot, blockTime: s.blockTime } : null, covered };
}

/** Did `owner`'s balance of `mint` go up in this transaction? */
function received(tx: FullTx, owner: string, mint: string) {
  const sum = (list?: TokBal[]) => (list || []).filter((b) => b.mint === mint && b.owner === owner).reduce((t, b) => t + BigInt(b.uiTokenAmount.amount), 0n);
  return Boolean(tx.meta && !tx.meta.err && sum(tx.meta.postTokenBalances) > sum(tx.meta.preTokenBalances));
}

async function getTx(signature: string): Promise<FullTx | null> {
  const t = await rpc<FullTx | null>("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" }], 4);
  return t;
}

/**
 * The first transaction in which `owner` received `mint`.
 * Read from the owner's own token accounts: a token account only ever sees this one mint, so its oldest
 * transactions are the first receipt. First through Helius' history index, then through plain RPC
 * signatures if the index refuses, so one provider quirk can't blank the whole column.
 */
export async function firstIn(owner: string, mint: string, accounts: string[], tries = 4): Promise<FirstIn | null> {
  let best: FirstIn | null = null;
  let lastErr: unknown = null;
  for (const acct of accounts.slice(0, 3)) {
    let txs: FullTx[] = [];
    try {
      txs = (await gtfa(acct, {}, 4, tries)).data || [];
    } catch (e) {
      lastErr = e;
      try {
        // plain RPC: newest first, so walk back to the oldest page (token accounts rarely have more than one)
        let before: string | undefined;
        let oldest: { signature: string }[] = [];
        for (let page = 0; page < 4; page++) {
          const sigs = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [acct, { limit: 1000, ...(before ? { before } : {}) }], tries);
          if (!sigs.length) break;
          oldest = sigs.filter((x) => !x.err);
          before = sigs[sigs.length - 1].signature;
          if (sigs.length < 1000) break;
        }
        for (const sig of oldest.slice(-4).reverse()) {
          const t = await getTx(sig.signature);
          if (t) txs.push(t);
        }
      } catch (e2) {
        lastErr = e2;
        continue;
      }
    }
    const tx = txs.find((t) => received(t, owner, mint));
    const read = tx ? readFirstIn(tx, owner, mint) : null;
    if (read && (!best || read.slot < best.slot)) best = read;
  }
  if (!best && lastErr) throw lastErr;
  return best;
}

/**
 * The SOL a wallet received last before its first buy: the money that actually paid for it.
 * Aged wallets defeat "first funding ever"; this catches the reload right before the launch.
 */
export async function prefundOf(owner: string, beforeSlot: number, skipSig: string, tries = 3): Promise<PreFund | null> {
  const r = await gtfa(owner, { slot: { lte: beforeSlot } }, 12, tries, "desc");
  for (const tx of r.data || []) {
    if (tx.transaction.signatures[0] === skipSig || !tx.meta || tx.meta.err) continue;
    const all: Parsed[] = [...tx.transaction.message.instructions, ...(tx.meta.innerInstructions || []).flatMap((x) => x.instructions)];
    let best: { from: string; lamports: number } | null = null;
    for (const ix of all) {
      if (ix.program !== "system" || (ix.parsed?.type !== "transfer" && ix.parsed?.type !== "transferWithSeed")) continue;
      const info = ix.parsed.info || {};
      const lamports = Number(info.lamports) || 0;
      if (String(info.destination) === owner && String(info.source) !== owner && lamports >= 5_000_000 && (!best || lamports > best.lamports)) {
        best = { from: String(info.source), lamports };
      }
    }
    if (best) {
      return { from: best.from, fromName: null, fromType: null, lamports: best.lamports, signature: tx.transaction.signatures[0], slot: tx.slot, blockTime: tx.blockTime || 0 };
    }
  }
  return null;
}

export function readFirstIn(tx: FullTx, owner: string, mint: string): FirstIn | null {
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
  const meta = tx.meta;
  if (!meta) return null;

  const pre = new Map<string, bigint>();
  const post = new Map<string, bigint>();
  for (const b of meta.preTokenBalances || []) if (b.mint === mint && b.owner) pre.set(b.owner, (pre.get(b.owner) || 0n) + BigInt(b.uiTokenAmount.amount));
  for (const b of meta.postTokenBalances || []) if (b.mint === mint && b.owner) post.set(b.owner, (post.get(b.owner) || 0n) + BigInt(b.uiTokenAmount.amount));

  // who lost tokens in this transaction
  let from: string | null = null;
  let fromWasWallet = false;
  for (const o of new Set([...pre.keys(), ...post.keys()])) {
    if (o === owner) continue;
    const d = (post.get(o) || 0n) - (pre.get(o) || 0n);
    if (d < 0n) {
      from = o;
      fromWasWallet = isOnCurve(o);
      if (fromWasWallet) break;
    }
  }

  const all: Parsed[] = [...tx.transaction.message.instructions, ...(meta.innerInstructions || []).flatMap((x) => x.instructions)];
  let tip = 0;
  let via: string | null = null;
  for (const ix of all) {
    if (!via && ix.programId && PROGRAMS[ix.programId]) via = PROGRAMS[ix.programId];
    if (ix.program === "system" && ix.parsed?.type === "transfer") {
      const info = ix.parsed.info || {};
      if (JITO_TIP.has(String(info.destination))) tip += Number(info.lamports) || 0;
    }
  }

  const oi = keys.indexOf(owner);
  const spent = oi >= 0 ? (meta.preBalances[oi] - meta.postBalances[oi]) / 1e9 : 0;

  return {
    signature: tx.transaction.signatures[0],
    slot: tx.slot,
    blockTime: tx.blockTime || 0,
    feePayer: keys[0],
    feeLamports: meta.fee,
    tipLamports: tip,
    solSpent: Math.max(0, Number(spent.toFixed(6))),
    via,
    from: fromWasWallet ? from : null,
  };
}
