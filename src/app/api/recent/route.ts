import { readRecent } from "@/lib/cache";
import { isOwn } from "@/lib/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = { mint: string; symbol?: string };

export async function GET() {
  // filtered on read too, so entries stored before the rule existed never show
  const items = (await readRecent<Item>()).filter((i) => !isOwn(i.mint, i.symbol));
  return Response.json({ items }, { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=60" } });
}
