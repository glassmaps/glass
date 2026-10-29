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
  x: number;
  y: number;
  r: number;
}

export type EdgeType = "funded" | "shared-funder" | "transfer";

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
}

export type Stage =
  | { stage: "token" }
  | { stage: "holders"; count?: number }
  | { stage: "funding"; done: number; total: number }
  | { stage: "first"; done: number; total: number }
  | { stage: "layout" };
