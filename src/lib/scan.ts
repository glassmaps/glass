import { limits } from "@/config/site";
import * as cache from "./cache";
import { analyze, cachedMap, ScanError } from "./analyze";
import type { Stage } from "./types";

const ipOf = (req: Request) =>
  req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export const status: Record<ScanError["code"] | "rate", number> = {
  "bad-address": 400, "not-token": 404, "no-holders": 404, config: 503, upstream: 502, rate: 429,
};

/** Cached maps are free for everyone. A fresh scan costs credits, so it is metered per IP and per day. */
async function admit(req: Request) {
  const day = new Date().toISOString().slice(0, 10);
  const perIp = await cache.hit(`rl:${ipOf(req)}:${Math.floor(Date.now() / 3.6e6)}`, 3600);
  if (perIp > limits.freshScansPerIpHour) return "You have run a lot of fresh scans this hour. Maps scanned in the last minutes still load instantly.";
  const total = await cache.hit(`rl:day:${day}`, 86400);
  if (total > limits.freshScansPerDay) return "Fresh scans are paused for today. Maps already scanned still load.";
  return null;
}

const json = (body: unknown, code = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

export async function handleScan(req: Request, mint: string, opts: { cors?: boolean } = {}) {
  const url = new URL(req.url);
  const cors: Record<string, string> = opts.cors ? { "access-control-allow-origin": "*" } : {};
  const fresh = url.searchParams.get("fresh") === "1";

  const hit = fresh ? null : await cachedMap(mint);
  if (hit) {
    const age = Math.round((Date.now() - hit.scannedAt) / 1000);
    if (url.searchParams.get("stream") === "1") {
      return new Response(JSON.stringify({ done: hit }) + "\n", { headers: { "content-type": "application/x-ndjson", ...cors } });
    }
    return json(hit, 200, { ...cors, "cache-control": `public, s-maxage=${Math.max(5, limits.scanTtl - age)}, stale-while-revalidate=300`, age: String(age) });
  }

  const blocked = await admit(req);
  if (blocked) return json({ error: { code: "rate", message: blocked } }, 429, cors);

  if (url.searchParams.get("stream") !== "1") {
    try {
      const r = await analyze(mint);
      return json(r, 200, { ...cors, "cache-control": `public, s-maxage=${limits.scanTtl}, stale-while-revalidate=300` });
    } catch (e) {
      const err = e instanceof ScanError ? e : new ScanError("upstream", "The scan failed upstream. Try again in a moment.");
      if (!(e instanceof ScanError)) console.error("scan", mint, e);
      return json({ error: { code: err.code, message: err.message } }, status[err.code], cors);
    }
  }

  // NDJSON: one line per stage, the last line carries the map or the error
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctl) {
      const send = (o: unknown) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      let last = 0;
      const onStage = (s: Stage) => {
        const now = Date.now();
        // progress ticks at most every 120ms, stage changes always
        if ("done" in s && s.done !== s.total && now - last < 120) return;
        last = now;
        send(s);
      };
      try {
        send({ done: await analyze(mint, onStage) });
      } catch (e) {
        const err = e instanceof ScanError ? e : new ScanError("upstream", "The scan failed upstream. Try again in a moment.");
        if (!(e instanceof ScanError)) console.error("scan", mint, e);
        send({ error: { code: err.code, message: err.message } });
      }
      ctl.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store", ...cors } });
}
