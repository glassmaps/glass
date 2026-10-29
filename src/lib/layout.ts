import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Edge, Node } from "./types";

import { VIEW } from "./view";
export { VIEW };

type Sim = SimulationNodeDatum & { id: string; r: number };

/**
 * Deterministic force layout, run once on the server so the page, the share card and the API agree.
 * Bubble area is proportional to supply held. Bubbles keep a gap between them, the same cut as the mark.
 */
export function layout(nodes: Node[], edges: Edge[]) {
  const holders = nodes.filter((n) => n.kind !== "funder");
  const area = holders.reduce((s, n) => s + Math.max(n.pct, 0.02), 0) || 1;
  // total bubble area ~ 24% of the canvas
  const k = Math.sqrt((0.24 * VIEW * VIEW) / (Math.PI * area));
  for (const n of nodes) n.r = n.kind === "funder" ? 5 : Math.max(5, Math.min(150, k * Math.sqrt(Math.max(n.pct, 0.02))));

  // phyllotaxis start: largest in the middle, clusters seeded near their biggest member
  const golden = Math.PI * (3 - Math.sqrt(5));
  const sims: Sim[] = nodes.map((n, i) => {
    const t = i + 1;
    const rad = 26 * Math.sqrt(t);
    return { id: n.id, r: n.r, x: VIEW / 2 + rad * Math.cos(t * golden), y: VIEW / 2 + rad * Math.sin(t * golden) };
  });
  const byId = new Map(sims.map((s) => [s.id, s]));
  const links = edges
    .filter((e) => byId.has(e.a) && byId.has(e.b))
    .map((e) => ({ source: e.a, target: e.b }));

  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  const sim = forceSimulation<Sim>(sims)
    .randomSource(rand)
    .force(
      "link",
      forceLink<Sim, { source: string; target: string }>(links)
        .id((d) => d.id)
        .distance((l) => ((l.source as unknown as Sim).r + (l.target as unknown as Sim).r) * 0.9 + 14)
        .strength(0.55),
    )
    .force("charge", forceManyBody<Sim>().strength((d) => -6 - d.r * 0.6))
    .force("collide", forceCollide<Sim>().radius((d) => d.r + 4).strength(1).iterations(3))
    .force("x", forceX<Sim>(VIEW / 2).strength(0.045))
    .force("y", forceY<Sim>(VIEW / 2).strength(0.045))
    .stop();
  for (let i = 0; i < 360; i++) sim.tick();

  // fit to the view with a margin
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sims) {
    x0 = Math.min(x0, s.x! - s.r); y0 = Math.min(y0, s.y! - s.r);
    x1 = Math.max(x1, s.x! + s.r); y1 = Math.max(y1, s.y! + s.r);
  }
  const scale = Math.min(1.6, (VIEW * 0.92) / Math.max(x1 - x0, y1 - y0, 1));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const n of nodes) {
    const s = byId.get(n.id)!;
    n.x = Math.round((VIEW / 2 + (s.x! - cx) * scale) * 10) / 10;
    n.y = Math.round((VIEW / 2 + (s.y! - cy) * scale) * 10) / 10;
    n.r = Math.round(n.r * scale * 10) / 10;
  }
}
