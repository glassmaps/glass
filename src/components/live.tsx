"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MapResult } from "@/lib/types";
import { site } from "@/config/site";
import { fmtInt, fmtPct } from "@/lib/format";
import { MapCanvas } from "./map-canvas";

const LAYERS = { links: true, cohorts: false, labels: true };

/** Our own token, mapped live. If it ever looks wrong, everyone sees it here first. */
export function LivePanel() {
  const [d, setD] = useState<MapResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">(site.tokenMint ? "loading" : "idle");

  useEffect(() => {
    if (!site.tokenMint) return;
    let live = true;
    fetch(`/api/map/${site.tokenMint}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j) => live && (setD(j), setState("idle")))
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, []);

  const linked = d ? d.clusters.reduce((s, c) => s + c.pct, 0) : 0;
  const labeled = d ? d.nodes.filter((n) => n.labelSource === "self").length : 0;

  return (
    <section className="live" aria-label={`Live map of $${site.ticker}`}>
      <div className="live-top">
        <span className={`dot${d ? "" : " idle"}`} aria-hidden />
        <span className="micro">
          {d ? <>Live · <b>${site.ticker}</b> mapped by its own tool</> : site.tokenMint ? <>Reading <b>${site.ticker}</b></> : <><b>${site.ticker}</b> · map goes live at launch</>}
        </span>
        {d && <Link className="btn btn-line btn-sm" href={`/t/${site.tokenMint}`}>Open map</Link>}
      </div>
      <div className="live-map">
        {d ? (
          <MapCanvas data={d} pick={null} layers={LAYERS} interactive={false} />
        ) : (
          <div className="empty-live">
            <div>
              <Placeholder />
              <p>
                {state === "failed"
                  ? "The live map could not load right now. The token's own page still works."
                  : site.tokenMint
                    ? "Reading holders, funding and first buys."
                    : `From the first block, $${site.ticker}'s own holders are mapped here, every team and marketing wallet labeled in public.`}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="live-foot">
        <div className="stat"><span className="micro">Holders</span><span className="v num">{d ? fmtInt(d.holdersTotal) : "—"}</span></div>
        <div className="stat"><span className="micro">Linked</span><span className="v num">{d ? fmtPct(linked) : "—"}</span></div>
        <div className="stat"><span className="micro">Score</span><span className="v num">{d ? d.score.total : "—"}</span></div>
        <div className="stat"><span className="micro">Self-labeled</span><span className="v num">{d ? labeled : "—"}</span></div>
      </div>
    </section>
  );
}

/** Outline bubbles in the mark's rule. Dashed on purpose: this is a placeholder, not data. */
function Placeholder() {
  const b = [
    [120, 92, 56], [214, 70, 34], [196, 150, 28], [62, 160, 24], [270, 132, 18], [150, 196, 16], [44, 84, 14], [258, 196, 12],
  ];
  return (
    <svg viewBox="0 0 320 230" width="300" height="216" style={{ margin: "0 auto" }} aria-hidden>
      {b.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.2" strokeDasharray="3 4" />
      ))}
      <line x1="120" y1="92" x2="214" y2="70" stroke="rgba(255,255,255,.12)" strokeDasharray="3 4" />
      <line x1="120" y1="92" x2="196" y2="150" stroke="rgba(255,255,255,.12)" strokeDasharray="3 4" />
    </svg>
  );
}
