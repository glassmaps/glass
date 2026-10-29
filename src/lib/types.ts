export type Kind = "holder" | "program" | "exchange" | "burn" | "funder";

export interface Funding {
  funder: string;
  funderName: string | null;
  funderType: string | null;
  amount: number;
  signature: string;
  timestamp: number;
  slot: number;
}

export interface FirstIn {
  signature: string;
  slot: number;
  blockTime: number;
  feePayer: string;
  feeLamports: number;
  tipLamports: number; // Jito tip paid inside the same transaction
  solSpent: number; // SOL that left the owner in this tx (0 for a plain transfer)
  via: string | null; // program the tokens came through (pump.fun, PumpSwap, ...)
  from: string | null; // owner the tokens came from, when it is a wallet (a plain transfer)
}

export interface PreFund {
  from: string; // who sent it
  fromName: string | null; // known name of the sender (an exchange, a bridge), when there is one
  fromType: string | null;
  lamports: number;
  signature: string;
  slot: number;
  blockTime: number;
}

export interface Node {
  id: string; // owner address, or "f:<address>" for a funder that holds none of the token
  kind: Kind;
  label: string | null;
  labelSource: "self" | "helius" | "rule" | null;
  amount: number; // ui amount
  pct: number; // share of supply, 0..100
  rank: number; // 1 = largest, 0 for funder nodes
  cluster: number | null;
  cohort: number | null;
  fresh: boolean;
  isDeployer: boolean;
  funding: Funding | null;
  first: FirstIn | null;
  prefund?: PreFund | null; // the last SOL in before the first buy
  atLaunch?: boolean; // received the token in the launch window
  launchRole?: "dev" | "bundle" | "passed"; // deployer buy, launch wallet, or got tokens from a launch wallet
  launchGot?: number; // % of supply taken in the launch window
  launchOffset?: number; // slots after creation
  x: number;
  y: number;
  r: number;
}

export type EdgeType = "funded" | "shared-funder" | "transfer" | "paid" | "prefunded" | "batch" | "moved";

export interface Receipt {
  signature: string;
  what: string; // plain words, e.g. "A sent 0.42 SOL to B"
  time: number | null;
}

export interface Edge {
  id: string;
  a: string;
  b: string;
  type: EdgeType;
  receipts: Receipt[];
}

export interface Cohort {
  id: number;
  members: string[];
  slot: number;
  confidence: "high" | "medium" | "low";
  signals: string[]; // the reasons, in words
  pct: number;
}

export interface Cluster {
  id: number;
  members: string[]; // holder ids only
  pct: number;
  hasDeployer: boolean;
}

export interface ScoreItem {
  key: string;
  label: string;
  value: number; // the measured share, 0..100
  penalty: number; // points taken off
  max: number;
}

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  decimals: number;
  supply: number;
  deployer: string | null;
  priceUsd: number | null;
  mcapUsd: number | null;
  liquidityUsd: number | null;
  pairUrl: string | null;
  pairAddress?: string | null;
  volume24hUsd?: number | null;
  createdSlot?: number | null;
}

export interface MapResult {
  v: 1;
  method: string;
  token: TokenInfo;
  holdersTotal: number;
  partial: boolean;
  nodes: Node[];
  edges: Edge[];
  clusters: Cluster[];
  cohorts: Cohort[];
  score: { total: number; band: "clear" | "watch" | "concentrated" | "heavy"; items: ScoreItem[] };
  scannedAt: number;
  ms: number;
  self: boolean; // the token is ours and its wallets carry our own labels
  notes: string[]; // anything the reader should know about how complete this read is
  complete?: boolean; // false when funding or most first buys were missing: links could not be drawn
  launch?: Launch | null;
}

export interface LaunchWallet {
  id: string;
  offset: number; // slots after creation of its first buy: 0 is the creation block
  got: number; // % of supply it took from the curve or pool inside the window
  received: number; // % passed to it by other launch wallets inside the window
  sold: number; // % it sold back inside the window
  sentOut: number; // % it passed to other wallets inside the window
  holds: number; // % it holds now
  sol: number; // SOL spent across its window transactions (buys, fees, tips)
  tip: number; // Jito tip in SOL
  feePayer: string; // who signed and paid for its first buy
  signature: string; // its first buy
  sameTx: boolean; // bought inside the creation transaction itself
  dev: boolean;
  rank: number | null; // its place among the mapped holders, if it is one
}

export interface Launch {
  slot: number; // the creation slot
  window: number; // slots after creation that count
  createSig: string | null;
  wallets: number; // wallets other than the deployer that took supply in the window
  pctBought: number; // % of supply taken in the window by everyone, the deployer included
  pctBlock0: number; // of that, in the creation block itself
  dev: { got: number; holds: number; sameTx: boolean } | null; // the deployer's own launch buy
  pctBundle: number; // % taken by wallets other than the deployer
  pctSoldInWindow: number; // % sold back inside the window (instant flips)
  pctHeld: number; // % still held now by the non-deployer launch wallets and the wallets they passed tokens to
  pctHeldDirect: number; // of pctHeld, in the launch wallets themselves
  pctHeldPassed: number; // of pctHeld, in wallets that got their tokens from a launch wallet
  pctHeldAll: number; // pctHeld plus what the deployer holds now
  passedTo: number; // wallets that got tokens from a launch wallet
  sol: number; // SOL spent by all launch wallets
  tipped: number; // launch wallets that paid a Jito tip
  paidByOther: number; // launch wallets whose first buy was signed and paid by another wallet
  sharedPayers: number; // distinct outside wallets that paid for 2+ launch buys
  bySlot: { offset: number; wallets: number; pct: number }[];
  list: LaunchWallet[]; // biggest first, up to 60
  heldBy: number; // launch wallets still among the mapped holders
  partial: boolean; // the window held more transactions than one read covers
}

export type Stage =
  | { stage: "token" }
  | { stage: "holders"; count?: number }
  | { stage: "funding"; done: number; total: number }
  | { stage: "first"; done: number; total: number }
  | { stage: "links"; done: number; total: number }
  | { stage: "layout" };
