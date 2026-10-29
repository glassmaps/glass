"use client";
import { useEffect, useRef, useState } from "react";

export type Venue = "pump" | "gmgn" | "axiom" | "dex";

const NAME: Record<Venue, string> = { pump: "pump.fun", gmgn: "GMGN", axiom: "Axiom", dex: "DexScreener" };

export const venueUrl = (v: Venue, mint: string, pair?: string | null) =>
  v === "pump" ? `https://pump.fun/coin/${mint}`
  : v === "gmgn" ? `https://gmgn.ai/sol/token/${mint}`
  : v === "axiom" ? (pair ? `https://axiom.trade/meme/${pair}` : `https://axiom.trade/t/${mint}`)
  : `https://dexscreener.com/solana/${mint}`;

/** A platform's own icon, served through /api/brand. If the platform refuses, its name is shown instead. */
export function VenueIcon({ v, size = 18 }: { v: Venue; size?: number }) {
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setBad(true);
  }, []);
  if (bad) return <span className="venue-txt">{NAME[v]}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={`/api/brand/${v}`} alt={NAME[v]} width={size} height={size} onError={() => setBad(true)} />;
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
