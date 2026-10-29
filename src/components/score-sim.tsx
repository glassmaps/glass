"use client";
import { useEffect, useRef, useState } from "react";
import { BANDS, SCORE_RULES } from "@/config/site";

type Key = (typeof SCORE_RULES)[number]["key"];
type Vals = Record<Key, number>;

// the same arithmetic as src/lib/graph.ts, on numbers you choose
const penalty = (k: Key, v: number) => {
  const r = SCORE_RULES.find((x) => x.key === k)!;
  return Math.round(Math.min(r.max, Math.max(0, v - r.free) * r.weight) * 10) / 10;
};

const PRESETS: { name: string; v: Vals }[] = [
  { name: "Clean launch", v: { top10: 18, clusters: 2, cohorts: 0, launch: 0, dev: 0.5, fresh: 3 } },
  { name: "Bundled launch", v: { top10: 34, clusters: 9, cohorts: 22, launch: 8, dev: 0, fresh: 26 } },
  { name: "Deployer heavy", v: { top10: 41, clusters: 14, cohorts: 4, launch: 2, dev: 8, fresh: 6 } },
];

const COL: Record<Key, string> = { top10: "#4da3ff", clusters: "#00d4ff", cohorts: "#ffb547", launch: "#c6f36b", dev: "#ff6b5b", fresh: "#7b5cff" };

export function ScoreSim() {
  const [v, setV] = useState<Vals>(PRESETS[1].v);
  const pens = SCORE_RULES.map((r) => ({ ...r, p: penalty(r.key, v[r.key]) }));
  const total = Math.max(0, Math.min(100, Math.round(100 - pens.reduce((s, r) => s + r.p, 0))));
  const band = BANDS.find((b) => total >= b.min)!;

  // the big number counts to its new value instead of jumping
  const [shown, setShown] = useState(total);
  const from = useRef(total);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = total;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 260);
      const val = Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3)));
      setShown(val);
      from.current = val;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  let off = 100;
  return (
    <div className="sim">
      <div className="sim-head">
        <div>
          <span className="micro">Score</span>
          <div className="sim-total num">{shown}<small>/100</small></div>
        </div>
        <span className={`band band-${band.band}`}>{band.label}</span>
        <div className="sim-presets" role="group" aria-label="Examples">
          {PRESETS.map((p) => (
            <button key={p.name} className="chip" aria-pressed={JSON.stringify(p.v) === JSON.stringify(v)} onClick={() => setV(p.v)}>{p.name}</button>
          ))}
        </div>
      </div>

      <div className="sim-bar" aria-hidden>
        <i className="sim-keep" style={{ width: `${total}%` }} />
        {pens.map((r) => {
          off -= r.p;
          return <i key={r.key} className="sim-cut" style={{ left: `${Math.max(0, off)}%`, width: `${r.p}%`, background: COL[r.key] }} />;
        })}
        {BANDS.slice(0, 3).map((b) => <span key={b.band} className="sim-tick" style={{ left: `${b.min}%` }} />)}
      </div>
      <div className="sim-scale micro" aria-hidden>
        <span style={{ left: 0 }}>0</span>
        {BANDS.slice(0, 3).reverse().map((b) => <span key={b.band} style={{ left: `${b.min}%` }}>{b.min}</span>)}
        <span style={{ left: "100%" }}>100</span>
      </div>

      <div className="sim-rows">
        {pens.map((r) => (
          <label key={r.key} className="sim-row">
            <span className="sim-lbl"><i style={{ background: COL[r.key] }} />{r.label}</span>
            <input
              type="range" min={0} max={r.key === "top10" ? 100 : 60} step={0.5}
              value={v[r.key]}
              style={{ ["--p" as string]: `${(v[r.key] / (r.key === "top10" ? 100 : 60)) * 100}%`, ["--c" as string]: COL[r.key] }}
              onChange={(e) => setV((o) => ({ ...o, [r.key]: Number(e.target.value) }))}
            />
            <span className="sim-val num">{v[r.key].toFixed(1)}%</span>
            <span className={`sim-pen num${r.p ? " hit" : ""}`}>{r.p ? `−${r.p}` : "0"}<small>/{r.max}</small></span>
          </label>
        ))}
      </div>
      <p className="sim-note">
        penalty = min(max, max(0, share − free) × weight). Free share: {SCORE_RULES.map((r) => `${r.label.toLowerCase()} ${r.free}%`).filter((s) => !s.endsWith(" 0%")).join(", ") || "none"}. Everything else counts from the first wallet.
      </p>
    </div>
  );
}
