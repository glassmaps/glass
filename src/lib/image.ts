// Image fetching for /api/img: which URLs to try for a token picture, and the race between them.

export const GATEWAYS = ["https://ipfs.io/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://dweb.link/ipfs/", "https://w3s.link/ipfs/", "https://nftstorage.link/ipfs/"];
const MAX_BYTES = 5 * 1024 * 1024;
const STEP_MS = 4500;
export const BUDGET_MS = 11_000;

export type Hit = { body: ArrayBuffer; type: string };

/** Only public https hosts: no IP literals, no local names. */
export function safe(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^[\d.]+$/.test(h) || h.includes(":")) return null;
    return u;
  } catch {
    return null;
  }
}

/** ipfs://cid/x, ar://id, any gateway URL, or a bare CID, turned into the URLs worth trying. */
export function expand(raw: string): string[] {
  const s = raw.trim();
  if (!s) return [];
  const ipfs = s.match(/^ipfs:\/\/(?:ipfs\/)?(.+)$/i) || s.match(/\/ipfs\/([^?#]+)/i) || s.match(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,})(\/.*)?$/);
  if (ipfs) {
    const path = ipfs[1] + (ipfs[2] || "");
    const own = /^https:\/\//i.test(s) ? [s] : [];
    return [...own, ...GATEWAYS.map((g) => g + path)];
  }
  const ar = s.match(/^ar:\/\/(.+)$/i);
  if (ar) return [`https://arweave.net/${ar[1]}`];
  // Helius' resizing CDN wraps the original: try the original as well
  const wrapped = s.match(/^https:\/\/cdn\.helius-rpc\.com\/cdn-cgi\/image\/[^/]*\/(https?:\/\/.+)$/i);
  if (wrapped) return [s, ...expand(wrapped[1])];
  return /^https:\/\//i.test(s) ? [s] : [];
}

async function fetchOne(url: string, signal: AbortSignal): Promise<Response | null> {
  const u = safe(url);
  if (!u) return null;
  try {
    const r = await fetch(u, { signal, redirect: "follow", headers: { accept: "image/*,application/json;q=0.9,*/*;q=0.5", "user-agent": "glass-image-proxy" }, cache: "no-store" });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

/** First of several URLs to answer with an image wins; the rest are cancelled. JSON metadata is followed to its image. */
export async function race(urls: string[], depth: number, deadline: number): Promise<Hit | null> {
  const list = [...new Set(urls)].slice(0, 8);
  if (!list.length || Date.now() > deadline) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.min(STEP_MS, Math.max(500, deadline - Date.now())));
  try {
    const out = await new Promise<Hit | null>((resolve) => {
      let left = list.length;
      const done = (h: Hit | null) => {
        if (h) resolve(h);
        else if (--left === 0) resolve(null);
      };
      for (const url of list) {
        fetchOne(url, ctl.signal).then(async (r) => {
          if (!r) return done(null);
          const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
          const len = Number(r.headers.get("content-length") || 0);
          if (len > MAX_BYTES) return done(null);
          try {
            const body = await r.arrayBuffer();
            if (!body.byteLength || body.byteLength > MAX_BYTES) return done(null);
            if (type.startsWith("image/")) return done({ body, type });
            // metadata JSON (new pump.fun coins often point here): follow its image field
            const text = new TextDecoder().decode(body.slice(0, 64_000)).trim();
            if (depth > 0 && text.startsWith("{")) {
              const j = JSON.parse(text) as { image?: string; properties?: { files?: { uri?: string }[] } };
              const next = [j.image, j.properties?.files?.[0]?.uri].filter(Boolean) as string[];
              const hit = await race(next.flatMap(expand), depth - 1, deadline);
              return done(hit);
            }
            // some hosts send images as octet-stream: sniff the magic bytes
            const b = new Uint8Array(body.slice(0, 12));
            const sniff =
              b[0] === 0x89 && b[1] === 0x50 ? "image/png" :
              b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" :
              b[0] === 0x47 && b[1] === 0x49 ? "image/gif" :
              b[8] === 0x57 && b[9] === 0x45 ? "image/webp" :
              text.startsWith("<svg") || text.startsWith("<?xml") ? "image/svg+xml" : "";
            return done(sniff ? { body, type: sniff } : null);
          } catch {
            return done(null);
          }
        });
      }
    });
    return out;
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
}

