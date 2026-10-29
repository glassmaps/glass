// Everything a person might want to tune lives here. Thresholds are published on /method,
// so a change here is a change to the public methodology: bump METHOD_VERSION with it.

export const METHOD_VERSION = "1.3";

export const site = {
  name: "Glass",
  ticker: "GLASS",
  tagline: "See through every bag.",
  description:
    "The bubble map with receipts. Paste any Solana token and see who really holds it. Every link between two wallets opens the transaction that proves it.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000",
  x: process.env.NEXT_PUBLIC_X_URL || "",
  telegram: process.env.NEXT_PUBLIC_TELEGRAM_URL || "",
  github: process.env.NEXT_PUBLIC_GITHUB_URL || "",
  // our own token: shown in the header with copy and pump.fun links
  tokenMint: process.env.NEXT_PUBLIC_TOKEN_MINT || "",
};

export const limits = {
  holders: 100, // holders mapped per token (bubbles)
  holderPages: 12, // getTokenAccounts pages of 1000 read before we stop and mark the read partial
  concurrency: 8, // parallel upstream calls per scan
  scanTtl: 90, // seconds a finished map is served from cache
  freshScansPerIpHour: 12,
  freshScansPerDay: Number(process.env.MAX_FRESH_SCANS_PER_DAY || 600),
};

export const rules = {
  // a funder shared by two or more holders links them, unless the funder is a known exchange or bridge
  sharedFunderMin: 2,
  // cohorts: first buys that land this close together
  cohortSlotWindow: 1,
  cohortMinSize: 3,
  // "similar size": spread of SOL spent inside the cohort, as a share of the median
  cohortSizeSpread: 0.12,
  // "fresh": funded this long before the first buy, or less
  freshWindowSec: 6 * 60 * 60,
  // the reload before a first buy counts for links only if it came this close to the buy
  prefundWindowSec: 72 * 60 * 60,
  // exchange batch: same exchange, withdrawals at most this far apart, amounts this close, at least this many
  batchGapSec: 10 * 60,
  batchAmountSpread: 0.1,
  batchMin: 3,
  // buys this many slots after the creation slot (or in it) count as part of the launch
  launchBlockSlots: 1,
  // the launch bundle: wallets that received the token this many slots after creation, or in it
  launchWindowSlots: 2,
};

export const explorer = {
  tx: (sig: string) => `https://solscan.io/tx/${sig}`,
  account: (a: string) => `https://solscan.io/account/${a}`,
  token: (m: string) => `https://solscan.io/token/${m}`,
};

// The score starts at 100 and loses points per signal. Each signal is a share of supply (0..100):
// penalty = min(max, max(0, share - free) * weight). The caps add up to 100.
export const SCORE_RULES = [
  { key: "top10", label: "Top 10 wallets", free: 20, weight: 0.5, max: 10 },
  { key: "clusters", label: "Linked wallets", free: 0, weight: 1, max: 30 },
  { key: "cohorts", label: "Bought together", free: 0, weight: 1, max: 25 },
  { key: "launch", label: "Still held by the launch bundle", free: 0, weight: 1.5, max: 15 },
  { key: "dev", label: "Deployer and its links", free: 0, weight: 2, max: 15 },
  { key: "fresh", label: "Fresh wallets", free: 0, weight: 0.25, max: 5 },
] as const;

export const BANDS = [
  { min: 80, band: "clear", label: "Clear" },
  { min: 60, band: "watch", label: "Watch" },
  { min: 40, band: "concentrated", label: "Concentrated" },
  { min: 0, band: "heavy", label: "Heavy" },
] as const;
