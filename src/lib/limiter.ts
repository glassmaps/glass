import { sleep } from "./pool";

/*
 * One pacer per Helius limit class. At most the plan's rate starts in any one second,
 * so a scan never loses time to 429s and retries. Plan limits (requests per second):
 *   Developer: RPC 50, DAS 10, Wallet API 10   Business: 200, 50, 50   Professional: 500, 100, 100
 * Set the env vars to your plan; the defaults fit Developer with headroom.
 */
type Cls = "rpc" | "das" | "wallet";

const rate: Record<Cls, number> = {
  rpc: Number(process.env.HELIUS_RPC_RPS || 45),
  das: Number(process.env.HELIUS_DAS_RPS || 9),
  wallet: Number(process.env.HELIUS_WALLET_RPS || 9),
};
// sliding one-second window: at most `rate` calls start in any 1000ms, so a scan opens with a full burst
const sent: Record<Cls, number[]> = { rpc: [], das: [], wallet: [] };

export async function take(cls: Cls) {
  const cap = Math.max(1, Math.floor(rate[cls]));
  const q = sent[cls];
  for (;;) {
    const now = Date.now();
    while (q.length && now - q[0] >= 1000) q.shift();
    if (q.length < cap) {
      q.push(now);
      return;
    }
    await sleep(1000 - (now - q[0]) + 1);
  }
}

export const DAS = new Set(["getAsset", "getAssetBatch", "getTokenAccounts", "getAssetsByOwner", "searchAssets"]);
export const classOf = (method: string): Cls => (DAS.has(method) ? "das" : "rpc");
