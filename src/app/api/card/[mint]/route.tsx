import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cachedMap } from "@/lib/analyze";
import { isAddress } from "@/lib/address";
import { AURORA, BACK_D, FRONT, WORD_BOX, WORD_D } from "@/components/brand-paths";
import { VIEW } from "@/lib/view";
import type { MapResult } from "@/lib/types";

export const runtime = "nodejs";

const C = ["#00d4ff", "#7b5cff", "#7cffb2", "#ffb547", "#ff6b5b", "#4da3ff", "#c6f36b", "#b98bff"];
const BG = "#0a0a0b";

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 500; style: "normal" }[]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all(
    [
      ["Unbounded", "Unbounded-500.ttf", 500],
      ["Martian", "MartianMono-400.ttf", 400],
    ].map(async ([name, file, weight]) => ({
      name: name as string,
      data: await readFile(path.join(process.cwd(), "src/assets/fonts", file as string)),
      weight: weight as 400 | 500,
      style: "normal" as const,
    })),
  ));

const b64 = (s: string) => `data:image/svg+xml;base64,${Buffer.from(s).toString("base64")}`;

const markSvg = () =>
  b64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="8" y1="92" x2="92" y2="8"><stop offset="0" stop-color="${AURORA[0]}"/><stop offset=".5" stop-color="${AURORA[1]}"/><stop offset="1" stop-color="${AURORA[2]}"/></linearGradient></defs><g fill="url(#g)"><circle cx="${FRONT.cx}" cy="${FRONT.cy}" r="${FRONT.r}"/><path d="${BACK_D}"/></g></svg>`);

const wordSvg = () => {
  const [x, y, w, h] = WORD_BOX;
  return b64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}"><path fill="#fff" d="${WORD_D}"/></svg>`);
};

function mapSvg(m: MapResult) {
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const lines = m.edges
    .map((e) => {
      const a = byId.get(e.a), b = byId.get(e.b);
      if (!a || !b) return "";
      const col = b.cluster ? C[(b.cluster - 1) % 8] : "#ffffff";
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${col}" stroke-opacity=".5" stroke-width="2"${e.type === "transfer" ? ' stroke-dasharray="6 5"' : ""}/>`;
    })
    .join("");
  const dots = m.nodes
    .map((n) => {
      if (n.kind === "program" || n.kind === "burn")
        return `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="none" stroke="rgba(255,255,255,.32)" stroke-width="2" stroke-dasharray="5 4"/>`;
      if (n.kind === "funder") return `<circle cx="${n.x}" cy="${n.y}" r="5" fill="${BG}" stroke="${n.cluster ? C[(n.cluster - 1) % 8] : "#888"}" stroke-width="2"/>`;
      const f = n.kind === "exchange" ? "rgba(255,255,255,.32)" : n.cluster ? C[(n.cluster - 1) % 8] : "rgba(255,255,255,.15)";
      return `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${f}" stroke="${BG}" stroke-width="4"/>`;
    })
    .join("");
  return b64(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">${lines}${dots}</svg>`);
}

const BAND: Record<string, [string, string]> = {
  clear: ["Clear", "#7cffb2"], watch: ["Watch", "#00d4ff"], concentrated: ["Concentrated", "#ffb547"], heavy: ["Heavy", "#ff6b5b"],
};

export async function GET(_req: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  const m = isAddress(mint) ? await cachedMap(mint) : null;
  const f = await loadFonts();
  const mono = { fontFamily: "Martian", display: "flex" } as const;
  const head = { fontFamily: "Unbounded", display: "flex" } as const;
  const ca = `${mint.slice(0, 6)}…${mint.slice(-6)}`;

  const brand = (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <img src={markSvg()} width={34} height={34} alt="" />
      <img src={wordSvg()} height={24} width={Math.round((24 * WORD_BOX[2]) / WORD_BOX[3])} alt="" />
    </div>
  );

  const body = m ? (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", width: 560, padding: "56px 0 52px 64px" }}>
        {brand}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 64 }}>
          <div style={{ ...head, fontSize: 64, letterSpacing: -2.4, lineHeight: 1, color: "#fff" }}>
            {m.token.symbol ? `$${m.token.symbol}` : m.token.name.slice(0, 14)}
          </div>
          <div style={{ ...mono, fontSize: 18, color: "rgba(255,255,255,.48)", marginTop: 16 }}>{ca}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginTop: "auto" }}>
          <div style={{ ...head, fontSize: 96, letterSpacing: -4, lineHeight: 0.9, color: "#fff" }}>{m.score.total}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 6 }}>
            <div style={{ ...mono, fontSize: 16, color: BAND[m.score.band][1], textTransform: "uppercase", letterSpacing: 1.5 }}>{BAND[m.score.band][0]}</div>
            <div style={{ ...mono, fontSize: 16, color: "rgba(255,255,255,.48)" }}>
              {`${m.clusters.reduce((s, c) => s + c.pct, 0).toFixed(1)}% linked · ${m.holdersTotal.toLocaleString("en-US")} holders`}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
        <img src={mapSvg(m)} width={580} height={580} alt="" />
      </div>
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "56px 64px" }}>
      {brand}
      <div style={{ ...head, fontSize: 84, letterSpacing: -3.4, lineHeight: 1, color: "#fff", marginTop: "auto" }}>See through every bag.</div>
      <div style={{ ...mono, fontSize: 20, color: "rgba(255,255,255,.48)", marginTop: 24 }}>{isAddress(mint) ? `Map ${ca} on Glass` : "Bubble map with receipts"}</div>
    </div>
  );

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: BG }}>{body}</div>,
    {
      width: 1200,
      height: 630,
      fonts: f,
      headers: { "cache-control": m ? "public, s-maxage=300, stale-while-revalidate=3600" : "public, s-maxage=60" },
    },
  );
}
