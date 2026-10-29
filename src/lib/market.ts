interface Pair {
  chainId: string;
  url?: string;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: { usd?: number };
  pairAddress?: string;
  volume?: { h24?: number };
}

/** Price, market cap and liquidity from the deepest Solana pair. Optional: the map never waits on it for long. */
export async function market(mint: string) {
  try {
    const ctl = AbortSignal.timeout(3500);
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: ctl, cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { pairs?: Pair[] | null };
    const pairs = (j.pairs || []).filter((p) => p.chainId === "solana");
    if (!pairs.length) return null;
    pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const p = pairs[0];
    return {
      priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
      mcapUsd: p.marketCap ?? p.fdv ?? null,
      liquidityUsd: p.liquidity?.usd ?? null,
      pairUrl: p.url ?? null,
      pairAddress: p.pairAddress ?? null,
      // all Solana pairs together: the token's real 24h volume, not just the deepest pool's
      volume24hUsd: pairs.reduce((t, x) => t + (x.volume?.h24 || 0), 0) || null,
    };
  } catch {
    return null;
  }
}
