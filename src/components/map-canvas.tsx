"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Edge, MapResult, Node } from "@/lib/types";
import { short } from "@/lib/address";
import { fmtPct } from "@/lib/format";
import { VIEW } from "@/lib/view";

export type Pick = { node?: string; edge?: string; cluster?: number; cohort?: number } | null;
export type Layers = { links: boolean; cohorts: boolean; labels: boolean };

export const clusterColor = (c: number | null) => (c ? `var(--c${((c - 1) % 8) + 1})` : null);

const NEUTRAL = "rgba(255,255,255,0.15)";

/** '"wenmoonsol" on Pump.fun' → 'wenmoonsol', 'Kadenox @kadenox' → 'Kadenox'. The full label stays in the inspector. */
export function shortLabel(l: string | null) {
  if (!l) return "";
  let s = l.replace(/^"(.+?)"\s+on\s+.+$/i, "$1").replace(/\s+@\S+$/, "").trim();
  if (s === "Program account") s = "Program";
  return s;
}

function fill(n: Node) {
  if (n.kind === "program" || n.kind === "burn") return "none";
  if (n.kind === "funder") return "var(--bg)";
  if (n.kind === "exchange") return "rgba(255,255,255,0.32)";
  return clusterColor(n.cluster) || NEUTRAL;
}

interface View {
  k: number;
  x: number;
  y: number;
}

/** Between a partial map and the next one, every bubble glides to its new place instead of jumping. */
function useTween(target: MapResult, ms = 520) {
  const [shown, setShown] = useState(target);
  const last = useRef<Map<string, { x: number; y: number; r: number }>>(new Map());
  useEffect(() => {
    const from = last.current;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const save = () => { last.current = new Map(target.nodes.map((n) => [n.id, { x: n.x, y: n.y, r: n.r }])); };
    if (reduce || !from.size || from.size && target.nodes.every((n) => { const f = from.get(n.id); return f && f.x === n.x && f.y === n.y; })) {
      setShown(target);
      save();
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const step = (now: number) => {
      const t = ease(Math.min(1, Math.max(0, (now - t0) / ms)));
      setShown({
        ...target,
        nodes: target.nodes.map((n) => {
          const f = from.get(n.id);
          if (!f) return { ...n, r: n.r * t };
          return { ...n, x: f.x + (n.x - f.x) * t, y: f.y + (n.y - f.y) * t, r: f.r + (n.r - f.r) * t };
        }),
      });
      if (t < 1) raf = requestAnimationFrame(step);
      else save();
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); save(); };
  }, [target, ms]);
  return shown;
}

export function MapCanvas({
  data: target, pick, onPick, layers, interactive = true, fitSignal = 0,
}: {
  data: MapResult;
  pick: Pick;
  onPick?: (p: Pick) => void;
  layers: Layers;
  interactive?: boolean;
  fitSignal?: number;
}) {
  const data = useTween(target);
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ n: Node; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(0);
  const pinch = useRef<{ d: number; k: number } | null>(null);

  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data]);
  const edgesOf = useMemo(() => {
    const m = new Map<string, Edge[]>();
    for (const e of data.edges) {
      (m.get(e.a) || m.set(e.a, []).get(e.a)!).push(e);
      (m.get(e.b) || m.set(e.b, []).get(e.b)!).push(e);
    }
    return m;
  }, [data]);

  // what stays lit for the current pick
  const focus = useMemo(() => {
    if (!pick) return null;
    const s = new Set<string>();
    if (pick.node) {
      s.add(pick.node);
      const n = byId.get(pick.node);
      for (const e of edgesOf.get(pick.node) || []) s.add(e.a).add(e.b);
      if (n?.cluster) for (const m of data.nodes) if (m.cluster === n.cluster) s.add(m.id);
    }
    if (pick.edge) {
      const e = data.edges.find((x) => x.id === pick.edge);
      if (e) s.add(e.a).add(e.b);
    }
    if (pick.cluster) for (const m of data.nodes) if (m.cluster === pick.cluster) s.add(m.id);
    if (pick.cohort) for (const m of data.nodes) if (m.cohort === pick.cohort) s.add(m.id);
    return s;
  }, [pick, byId, edgesOf, data]);

  // a partial map turning into the full one keeps your zoom; a new token or Fit resets it
  useEffect(() => setView({ k: 1, x: 0, y: 0 }), [fitSignal, target.token.mint]);

  const toSvg = useCallback((cx: number, cy: number) => {
    const el = svg.current!;
    const m = el.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    const p = toSvg(cx, cy);
    setView((v) => {
      const k = Math.min(8, Math.max(0.6, v.k * factor));
      const f = k / v.k;
      return { k, x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f };
    });
  }, [toSvg]);

  // wheel needs a non-passive listener to stop the page scrolling under the map
  useEffect(() => {
    const el = svg.current;
    if (!el || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, interactive]);

  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    ptrs.current.set(e.pointerId, cur);
    if (ptrs.current.size === 2 && pinch.current) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const want = Math.min(8, Math.max(0.6, pinch.current.k * (d / pinch.current.d)));
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, want / view.k);
      moved.current += 10;
      return;
    }
    const p0 = toSvg(prev.x, prev.y), p1 = toSvg(cur.x, cur.y);
    moved.current += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    // capture only once it is a drag; capturing on press would steal the click from the bubble
    if (moved.current > 4 && !dragging) {
      setDragging(true);
      svg.current?.setPointerCapture(e.pointerId);
    }
    setView((v) => ({ ...v, x: v.x + (p1.x - p0.x), y: v.y + (p1.y - p0.y) }));
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    setDragging(false);
  };

  const showTip = (n: Node, e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    setHover({ n, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const nodes = data.nodes;
  // low-confidence cohorts are timing alone: listed in the panel, never drawn, so the map stays quiet
  const loud = new Set(data.cohorts.filter((c) => c.confidence !== "low").map((c) => c.id));
  const cohortMembers = layers.cohorts ? nodes.filter((n) => n.cohort && loud.has(n.cohort)) : [];
  const fs = (n: Node) => Math.max(8, Math.min(20, n.r * 0.42));

  return (
    <div ref={box} style={{ position: "absolute", inset: 0 }}>
      <svg
        ref={svg}
        className={`map${dragging ? " dragging" : ""}`}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Bubble map of the top ${nodes.filter((n) => n.rank).length} holders of ${data.token.symbol || data.token.name}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => {
          if (moved.current <= 4) onPick?.(null);
        }}
        style={interactive ? undefined : { cursor: "default" }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {layers.links && (
            <g>
              {data.edges.map((e) => {
                const a = byId.get(e.a), b = byId.get(e.b);
                if (!a || !b) return null;
                const lit = !focus || (focus.has(e.a) && focus.has(e.b));
                const col = clusterColor(b.cluster ?? a.cluster) || "var(--ink-3)";
                const sel = pick?.edge === e.id;
                return (
                  <g key={e.id} className={`edge${lit ? "" : " dim"}`}>
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={col}
                      strokeOpacity={sel ? 1 : 0.55}
                      strokeWidth={(sel ? 2.4 : e.type === "shared-funder" ? 1 : 1.5) / view.k}
                      strokeDasharray={e.type === "transfer" ? `${5 / view.k} ${4 / view.k}` : e.type === "batch" ? `${1.5 / view.k} ${3 / view.k}` : undefined}
                      strokeLinecap={e.type === "batch" ? "round" : undefined}
                    />
                    {interactive && (
                      <line
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke="transparent"
                        strokeWidth={12 / view.k}
                        style={{ cursor: "pointer" }}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (moved.current <= 4) onPick?.({ edge: e.id });
                        }}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {cohortMembers.map((n) => (
            <circle
              key={`co-${n.id}`}
              className={!focus || focus.has(n.id) ? "" : "dim"}
              cx={n.x} cy={n.y} r={n.r + 5}
              fill="none" stroke="var(--warn)" strokeWidth={1.2 / view.k}
              strokeDasharray={`${3 / view.k} ${3 / view.k}`}
              pointerEvents="none"
            />
          ))}

          {nodes.map((n) => {
            const lit = !focus || focus.has(n.id);
            const f = fill(n);
            const ring = n.kind === "program" || n.kind === "burn";
            const sel = pick?.node === n.id;
            return (
              <g
                key={n.id}
                className={`node${lit ? "" : " dim"}`}
                onPointerEnter={(e) => showTip(n, e)}
                onPointerMove={(e) => hover && showTip(n, e)}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (moved.current <= 4) onPick?.({ node: n.id });
                }}
              >
                {/* the cut: every bubble carries a background-coloured edge, the same gap as the mark */}
                <circle
                  cx={n.x} cy={n.y} r={n.r}
                  fill={f}
                  stroke={ring ? "var(--ink-4)" : n.kind === "funder" ? clusterColor(n.cluster) || "var(--ink-3)" : "var(--bg)"}
                  strokeWidth={ring || n.kind === "funder" ? 1.4 / view.k : 3}
                  strokeDasharray={ring ? `${4 / view.k} ${3 / view.k}` : undefined}
                />
                {sel && <circle cx={n.x} cy={n.y} r={n.r + 4 / view.k} fill="none" stroke="var(--ink)" strokeWidth={1.5 / view.k} />}
                {(() => {
                  // one quiet stack inside the bubble: rank, then the name when it fits. Nothing hangs outside.
                  const px = n.r * view.k;
                  if (n.kind === "funder") return null;
                  const name = layers.labels ? shortLabel(n.label) : "";
                  const showName = name && px >= 30;
                  const showRank = n.rank > 0 && px >= 13;
                  if (!showName && !showRank) return null;
                  const max = Math.max(4, Math.floor((n.r * 1.7) / (5.6 / view.k)));
                  const nm = name.length > max ? name.slice(0, max - 1) + "…" : name;
                  const rs = Math.max(8, Math.min(18, n.r * 0.4));
                  const ink = ring ? "var(--ink-3)" : "rgba(0,0,0,0.72)";
                  const mono = { fontFamily: "var(--font-mono)", fontStretch: "87.5%", pointerEvents: "none" } as const;
                  return (
                    <>
                      {showRank && (
                        <text x={n.x} y={showName ? n.y - rs * 0.25 : n.y} dy="0.35em" textAnchor="middle" fontSize={rs} fill={ink} style={mono}>
                          {n.rank}
                        </text>
                      )}
                      {showName && (
                        <text x={n.x} y={n.y + rs * 0.85} dy="0.35em" textAnchor="middle" fontSize={9.5 / view.k} fill={ring ? "var(--ink-3)" : "rgba(0,0,0,0.6)"} style={mono}>
                          {nm}
                        </text>
                      )}
                    </>
                  );
                })()}
                {/* a labelled wallet too small to carry its name gets a small tag: the name is one hover away */}
                {layers.labels && n.label && n.kind !== "funder" && n.kind !== "program" && n.r * view.k < 30 && (
                  <circle cx={n.x + n.r * 0.72} cy={n.y - n.r * 0.72} r={2.6 / view.k} fill="var(--ink)" stroke="var(--bg)" strokeWidth={1.2 / view.k} pointerEvents="none" />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hover && (
        <div
          className="tip"
          style={{
            left: Math.min(hover.x + 14, (box.current?.clientWidth || 0) - 190),
            top: Math.max(8, hover.y - 10),
          }}
        >
          <b>{hover.n.kind === "funder" ? (hover.n.label || "Funder") : hover.n.label || `#${hover.n.rank}`}</b>
          <br />
          {short(hover.n.id.replace(/^f:/, ""), 5)}
          {hover.n.rank > 0 && (
            <>
              <br />
              <span className="num">{fmtPct(hover.n.pct)}</span> of supply
            </>
          )}
          {hover.n.cluster && (
            <>
              <br />
              Cluster {hover.n.cluster}
            </>
          )}
          {hover.n.fresh && (
            <>
              <br />
              <span className="flag">Fresh wallet</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
