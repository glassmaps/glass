import { isAddress } from "@/lib/address";
import { identiconSvg } from "@/lib/identicon";
import { rpc } from "@/lib/helius";
import { BUDGET_MS, expand, race, type Hit } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/*
 * Every token picture goes through here, so a picture can never be blank:
 *  1. the URL the token's metadata points at (IPFS and Arweave raced across gateways, metadata JSON unwrapped)
 *  2. DexScreener's copy, by mint
 *  3. Helius' copy of the metadata (CDN, then the original files), by mint
 *  4. a tile drawn from the mint itself
 * A hit is cached at the edge for a week. A miss is cached for a minute, so a picture that appears later is picked up.
 */

interface Asset {
  content?: { json_uri?: string; links?: { image?: string }; files?: { uri?: string; cdn_uri?: string }[]; metadata?: { symbol?: string } };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mint = url.searchParams.get("m") || "";
  const given = url.searchParams.get("u") || "";
  const symbol = url.searchParams.get("s") || "";
  const deadline = Date.now() + BUDGET_MS;

  if (!isAddress(mint)) return new Response("bad mint", { status: 400 });

  let hit: Hit | null = null;
  if (given) hit = await race(expand(given), 2, deadline);
  if (!hit) hit = await race([`https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png?size=lg`], 0, deadline);
  if (!hit && process.env.HELIUS_API_KEY) {
    try {
      const a = await rpc<Asset | null>("getAsset", { id: mint }, 2);
      const c = a?.content;
      const cands = [c?.files?.[0]?.cdn_uri, c?.links?.image, c?.files?.[0]?.uri, c?.json_uri].filter((x): x is string => Boolean(x) && x !== given);
      if (cands.length) hit = await race(cands.flatMap(expand), 2, deadline);
    } catch {
      /* the tile below covers it */
    }
  }

  if (hit) {
    // never serve script-capable SVG from our origin as-is
    const headers: Record<string, string> = {
      "content-type": hit.type,
      "cache-control": "public, max-age=86400, s-maxage=604800, immutable",
      "x-content-type-options": "nosniff",
    };
    if (hit.type === "image/svg+xml") headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    return new Response(hit.body, { headers });
  }
  return new Response(identiconSvg(mint, symbol), {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=60, s-maxage=60", "x-glass-image": "fallback" },
  });
}
