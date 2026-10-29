import { Redis } from "@upstash/redis";

// Upstash through the Vercel marketplace sets KV_REST_API_URL / KV_REST_API_TOKEN.
// Without it we fall back to process memory, which is fine locally and per-instance on Vercel.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const mem = new Map<string, { v: unknown; exp: number }>();

export const hasStore = Boolean(redis);

export async function get<T>(key: string): Promise<T | null> {
  if (redis) {
    try {
      return (await redis.get<T>(key)) ?? null;
    } catch {
      return null;
    }
  }
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.exp && hit.exp < Date.now()) {
    mem.delete(key);
    return null;
  }
  return hit.v as T;
}

/** ttl in seconds; 0 keeps it (funding and first buys never change once they exist) */
export async function set(key: string, v: unknown, ttl = 0): Promise<void> {
  if (redis) {
    try {
      if (ttl) await redis.set(key, v, { ex: ttl });
      else await redis.set(key, v);
    } catch {
      /* a cache write that fails costs us a re-read later, nothing more */
    }
    return;
  }
  if (mem.size > 20000) mem.clear();
  mem.set(key, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 });
}

export async function getMany<T>(keys: string[]): Promise<(T | null)[]> {
  if (!keys.length) return [];
  if (redis) {
    try {
      const out: (T | null)[] = [];
      for (let i = 0; i < keys.length; i += 200) {
        const part = await redis.mget<(T | null)[]>(...keys.slice(i, i + 200));
        out.push(...part);
      }
      return out;
    } catch {
      return keys.map(() => null);
    }
  }
  return Promise.all(keys.map((k) => get<T>(k)));
}

/** fixed-window counter; returns the count after incrementing */
export async function hit(key: string, windowSec: number): Promise<number> {
  if (redis) {
    try {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, windowSec);
      return n;
    } catch {
      return 0;
    }
  }
  const cur = (await get<number>(key)) || 0;
  await set(key, cur + 1, windowSec);
  return cur + 1;
}

export async function pushRecent(item: unknown, max = 24): Promise<void> {
  if (redis) {
    try {
      await redis.lpush("recent", JSON.stringify(item));
      await redis.ltrim("recent", 0, max - 1);
    } catch {
      /* not critical */
    }
    return;
  }
  const list = ((await get<string[]>("recent")) || []).filter((s) => s !== JSON.stringify(item));
  list.unshift(JSON.stringify(item));
  await set("recent", list.slice(0, max));
}

export async function readRecent<T>(): Promise<T[]> {
  let raw: unknown[] = [];
  if (redis) {
    try {
      raw = await redis.lrange("recent", 0, 40);
    } catch {
      raw = [];
    }
  } else raw = (await get<string[]>("recent")) || [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of raw) {
    const v = (typeof r === "string" ? JSON.parse(r) : r) as T & { mint: string };
    if (seen.has(v.mint)) continue;
    seen.add(v.mint);
    out.push(v);
  }
  return out.slice(0, 12);
}
