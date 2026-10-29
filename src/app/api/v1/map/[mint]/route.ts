import { handleScan } from "@/lib/scan";

// Public read endpoint. Same data as the site, open CORS. Fresh scans are metered like the site's.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  return handleScan(req, mint, { cors: true });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-max-age": "86400" },
  });
}
