import { readRecent } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await readRecent();
  return Response.json({ items }, { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=60" } });
}
