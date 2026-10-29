// Platform icons for the "open on" links (pump.fun, GMGN, Axiom): each platform's own published icon,
// fetched from its own domain and cached at the edge for a week. If a site refuses, the client shows its name.

export const runtime = "nodejs";

const SOURCES: Record<string, string[]> = {
  pump: ["https://dd.dexscreener.com/ds-data/tokens/solana/pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn.png?size=lg", "https://pump.fun/icon.png", "https://pump.fun/favicon.ico"],
  gmgn: ["https://gmgn.ai/static/apple-touch-icon.png", "https://gmgn.ai/favicon.ico"],
  axiom: ["https://axiom.trade/apple-touch-icon.png", "https://axiom.trade/favicon.ico", "https://axiom.trade/favicon.png"],
  dex: ["https://dexscreener.com/favicon.png", "https://dexscreener.com/favicon.ico"],
};

export async function GET(_req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params;
  const list = SOURCES[site];
  if (!list) return new Response("unknown", { status: 404 });
  for (const url of list) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { "user-agent": "Mozilla/5.0 (compatible; glass-icons)", accept: "image/*" }, cache: "no-store", redirect: "follow" });
      const type = (r.headers.get("content-type") || "").split(";")[0];
      if (!r.ok || !(type.startsWith("image/") || url.endsWith(".ico"))) continue;
      const body = await r.arrayBuffer();
      if (!body.byteLength || body.byteLength > 512_000) continue;
      return new Response(body, {
        headers: {
          "content-type": type.startsWith("image/") ? type : "image/x-icon",
          "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      /* next source */
    }
  }
  return new Response("unavailable", { status: 502, headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
}
