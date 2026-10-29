"use client";
import { useEffect, useRef, useState } from "react";

export type Venue = "pump" | "gmgn" | "axiom" | "dex";

const NAME: Record<Venue, string> = { pump: "pump.fun", gmgn: "GMGN", axiom: "Axiom", dex: "DexScreener" };

export const venueUrl = (v: Venue, mint: string, pair?: string | null) =>
  v === "pump" ? `https://pump.fun/coin/${mint}`
  : v === "gmgn" ? `https://gmgn.ai/sol/token/${mint}`
  : v === "axiom" ? (pair ? `https://axiom.trade/meme/${pair}` : `https://axiom.trade/t/${mint}`)
  : `https://dexscreener.com/solana/${mint}`;

// Each platform's own published icon, loaded straight from the platform in the visitor's browser
// (no referrer, which GMGN requires), then through our cached proxy, then the platform's name.
// pump.fun's pill is also its token's logo, so DexScreener's copy of the $PUMP image is tried first.
const PUMP_TOKEN = "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn";
const SOURCES: Record<Venue, string[]> = {
  pump: [`https://dd.dexscreener.com/ds-data/tokens/solana/${PUMP_TOKEN}.png?size=lg`, "https://pump.fun/icon.png", "/api/brand/pump"],
  gmgn: ["https://gmgn.ai/static/apple-touch-icon.png", "/api/brand/gmgn"],
  axiom: ["https://axiom.trade/favicon.ico", "/api/brand/axiom"],
  dex: ["https://dexscreener.com/favicon.png", "/api/brand/dex"],
};

export function VenueIcon({ v, size = 18 }: { v: Venue; size?: number }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  const list = SOURCES[v];
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setI((n) => n + 1);
  }, [i]);
  if (i >= list.length) return <span className="venue-txt">{NAME[v]}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} key={list[i]} src={list[i]} alt={NAME[v]} width={size} height={size} referrerPolicy="no-referrer" decoding="async" onError={() => setI((n) => n + 1)} />
  );
}

export function VenueLinks({ mint, pair, list = ["pump", "gmgn", "axiom"] }: { mint: string; pair?: string | null; list?: Venue[] }) {
  return (
    <div className="venues" role="group" aria-label="Open on">
      {list.map((v) => (
        <a key={v} className="venue" href={venueUrl(v, mint, pair)} target="_blank" rel="noreferrer" title={`Open on ${NAME[v]}`} aria-label={`Open on ${NAME[v]}`}>
          <VenueIcon v={v} />
        </a>
      ))}
    </div>
  );
}
