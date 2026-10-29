"use client";
import { useEffect, useRef, useState } from "react";

/*
 * The hero. A field of holders drawn in grey: what any bubble map shows you.
 * Under the glass the same field is magnified and the links appear, each with the receipt behind it.
 * It follows the pointer; left alone it visits one group after another.
 * Example data, generated from a fixed seed, so every visitor sees the same field.
 */

const PALETTE = ["#00d4ff", "#7b5cff", "#7cffb2", "#ffb547", "#ff6b5b", "#4da3ff"];
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

type Kind = "funder" | "chain" | "transfer" | "cohort" | "deployer";
type Bubble = { x: number; y: number; r: number; g: number; rank: number; a: number };
type Group = {
  id: number; kind: Kind; color: string; cx: number; cy: number;
  members: number[]; hub: { x: number; y: number } | null;
  title: string; facts: [string, string][]; sig: string;
};
type World = { bubbles: Bubble[]; groups: Group[]; curve: { x: number; y: number; r: number } };

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const addr = (rand: () => number, n = 44) => Array.from({ length: n }, () => B58[Math.floor(rand() * 58)]).join("");
const cut = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const KINDS: { kind: Kind; title: string; n: [number, number] }[] = [
  { kind: "funder", title: "Same funder", n: [5, 6] },
  { kind: "cohort", title: "Bought together", n: [6, 7] },
  { kind: "deployer", title: "Deployer cluster", n: [4, 5] },
  { kind: "chain", title: "Funded", n: [3, 4] },
  { kind: "transfer", title: "Token transfer", n: [3, 3] },
  { kind: "funder", title: "Same funder", n: [4, 4] },
];

function build(W: number, H: number, mobile: boolean): World {
  const rand = rng(20261029);
  const bubbles: Bubble[] = [];
  const free = (x: number, y: number, r: number, gap = 5) =>
    x - r > 4 && x + r < W - 4 && y - r > 6 && y + r < H - 6 &&
    bubbles.every((b) => Math.hypot(b.x - x, b.y - y) > b.r + r + gap) &&
    Math.hypot(curve.x - x, curve.y - y) > curve.r + r + gap;

  // the field leans right on desktop, where the copy is not
  const x0 = mobile ? 0 : W * 0.44;
  const s = Math.min(1, Math.max(0.62, Math.min(W - x0, H) / 640));
  const curve = { x: x0 + (W - x0) * 0.44, y: H * 0.5, r: 58 * s };

  const spots = mobile
    ? [[0.22, 0.24], [0.74, 0.2], [0.3, 0.76], [0.78, 0.74], [0.14, 0.5], [0.86, 0.47]]
    : [[0.16, 0.3], [0.6, 0.24], [0.26, 0.74], [0.88, 0.4], [0.62, 0.78], [0.9, 0.82]];

  const groups: Group[] = [];
  let rank = 1;
  KINDS.forEach((k, gi) => {
    const [sx, sy] = spots[gi];
    const cx = x0 + (W - x0) * sx, cy = H * sy;
    const n = k.n[0] + Math.floor(rand() * (k.n[1] - k.n[0] + 1));
    const members: number[] = [];
    for (let i = 0, tries = 0; i < n && tries < 600; tries++) {
      const r = (10 + rand() * 20) * s * (i === 0 ? 1.25 : 1);
      const ang = rand() * Math.PI * 2, d = i === 0 ? 0 : (26 + rand() * 46) * s;
      const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
      if (!free(x, y, r)) continue;
      bubbles.push({ x, y, r, g: gi, rank: 0, a: 0 });
      members.push(bubbles.length - 1);
      i++;
    }
    const funder = addr(rand), sig = addr(rand, 87);
    const pct = members.reduce((t, m) => t + bubbles[m].r * bubbles[m].r, 0) / 900;
    const slot = 312004100 + Math.floor(rand() * 40);
    const facts: [string, string][] = [
      ["Wallets", String(members.length)],
      ["Supply", `${pct.toFixed(2)}%`],
    ];
    if (k.kind === "funder") facts.push(["Funder", `${cut(funder)} · unnamed`]);
    if (k.kind === "cohort") facts.push(["Slot", slot.toLocaleString("en-US")], ["Signals", "one payer · same tip"]);
    if (k.kind === "deployer") facts.push(["Funded by", "deployer"]);
    if (k.kind === "chain") facts.push(["First SOL", "from a top holder"]);
    if (k.kind === "transfer") facts.push(["Tokens", "wallet to wallet"]);
    groups.push({
      id: gi + 1, kind: k.kind, color: PALETTE[gi % PALETTE.length], cx, cy, members,
      hub: k.kind === "funder" || k.kind === "deployer" ? { x: cx + (rand() - 0.5) * 30 * s, y: cy - 70 * s } : null,
      title: k.title, facts, sig,
    });
  });

  // everyone else: the long tail
  const tail = mobile ? 90 : 190;
  for (let i = 0, tries = 0; i < tail && tries < 9000; tries++) {
    const r = (2.5 + Math.pow(rand(), 2.2) * 15) * s;
    const x = x0 - 40 + rand() * (W - x0 + 40), y = rand() * H;
    if (!free(x, y, r, 4)) continue;
    bubbles.push({ x, y, r, g: -1, rank: 0, a: 0 });
    i++;
  }
  [...bubbles].sort((a, b) => b.r - a.r).forEach((b) => (b.rank = rank++));
  // the order bubbles arrive in: outward from the middle of the field
  const mx = x0 + (W - x0) / 2, my = H / 2;
  for (const b of bubbles) b.a = Math.hypot(b.x - mx, b.y - my) / Math.hypot(W, H);
  return { bubbles, groups, curve };
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export function Lens() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const [group, setGroup] = useState<Group | null>(null);

  useEffect(() => {
    const el = wrap.current!, canvas = cv.current!, ctx = canvas.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1, mobile = false, R = 140;
    let world: World = { bubbles: [], groups: [], curve: { x: 0, y: 0, r: 0 } };
    const lens = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
    let pointer = false, visit = 0, visitAt = 0, t0 = performance.now(), last = t0, raf = 0, seen = true, shown: Group | null = null;

    const fade = (x: number) => (mobile ? 1 : 0.15 + 0.85 * Math.min(1, Math.max(0, (x - W * 0.34) / (W * 0.22))));

    const size = () => {
      const r = el.getBoundingClientRect();
      W = r.width; H = r.height; mobile = W < 900;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      world = build(W, H, mobile);
      R = mobile ? Math.min(100, W * 0.26) : Math.min(165, Math.max(120, W * 0.11));
      const g = world.groups[visit % world.groups.length];
      if (!lens.x) { lens.x = aim.x = g.cx; lens.y = aim.y = g.cy; }
    };

    const nearest = () => {
      let best: Group | null = null, bd = Infinity;
      for (const g of world.groups) {
        const d = Math.hypot(g.cx - lens.x, g.cy - lens.y);
        if (d < bd) { bd = d; best = g; }
      }
      return bd < R * 1.1 ? best : null;
    };

    const drawField = (now: number, inside: boolean) => {
      const intro = (now - t0) / 1100;
      const k = world.groups;
      const lit = (b: Bubble) => inside && b.g >= 0;

      // links first, so bubbles sit on top of them with their cut
      if (inside) {
        const dash = (now / 40) % 18;
        for (const g of k) {
          const m = g.members.map((i) => world.bubbles[i]);
          if (!m.length) continue;
          ctx.strokeStyle = g.color;
          ctx.globalAlpha = 0.75;
          ctx.lineWidth = 1.3;
          ctx.setLineDash(g.kind === "transfer" ? [5, 4] : g.kind === "funder" || g.kind === "deployer" ? [] : [2, 0]);
          ctx.lineDashOffset = g.kind === "transfer" ? -dash : 0;
          ctx.beginPath();
          if (g.hub) for (const b of m) { ctx.moveTo(g.hub.x, g.hub.y); ctx.lineTo(b.x, b.y); }
          else if (g.kind === "chain" || g.kind === "transfer") for (let i = 1; i < m.length; i++) { ctx.moveTo(m[i - 1].x, m[i - 1].y); ctx.lineTo(m[i].x, m[i].y); }
          ctx.stroke();
          // a pulse travels each funding line: money moving, not decoration
          if (g.kind !== "cohort") {
            const segs: [number, number, number, number][] = g.hub
              ? m.map((b) => [g.hub!.x, g.hub!.y, b.x, b.y])
              : m.slice(1).map((b, i) => [m[i].x, m[i].y, b.x, b.y]);
            ctx.setLineDash([]);
            ctx.fillStyle = g.color;
            segs.forEach(([ax, ay, bx, by], i) => {
              const p = ((now / 1400 + i * 0.27) % 1);
              ctx.globalAlpha = 0.9 * Math.sin(p * Math.PI);
              ctx.beginPath();
              ctx.arc(ax + (bx - ax) * p, ay + (by - ay) * p, 2, 0, Math.PI * 2);
              ctx.fill();
            });
          }
          if (g.hub) {
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);
            ctx.fillStyle = "#0a0a0b";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(g.hub.x, g.hub.y, g.kind === "deployer" ? 7 : 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.setLineDash([]);
      }

      // the bonding curve: a program, never linked
      const c = world.curve;
      ctx.globalAlpha = (inside ? 0.6 : 0.28) * fade(c.x) * ease(intro);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const b of world.bubbles) {
        const a = ease(intro * 1.6 - b.a * 1.4);
        if (a <= 0) continue;
        const r = b.r * (0.6 + 0.4 * a);
        ctx.globalAlpha = a * (inside ? 1 : fade(b.x));
        ctx.fillStyle = lit(b) ? k[b.g].color : inside ? "rgba(255,255,255,0.3)" : `rgba(255,255,255,${0.07 + Math.min(0.08, b.r / 300)})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        // the cut, same rule as the mark
        ctx.strokeStyle = inside ? "#0d0e11" : "#0a0a0b";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (inside && b.r > 11) {
          ctx.fillStyle = lit(b) ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.45)";
          ctx.font = `500 ${Math.max(8, Math.min(12, b.r * 0.5))}px "Martian Mono Variable", ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(b.rank), b.x, b.y + 0.5);
        }
      }

      if (inside) {
        // cohorts: one dashed ring per member, the bundle's tell
        for (const g of k) {
          if (g.kind !== "cohort") continue;
          ctx.strokeStyle = "#ffb547";
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          for (const i of g.members) {
            const b = world.bubbles[i];
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r + 4.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;

      if (!pointer && !still) {
        // left alone, the glass visits one group after another
        if (now - visitAt > 3200) { visit++; visitAt = now; }
        const g = world.groups[visit % world.groups.length];
        aim.x = g.cx; aim.y = g.cy;
      }
      // keep the glass whole inside the hero
      aim.x = Math.min(W - R - 12, Math.max(R + 12, aim.x));
      aim.y = Math.min(H - R - 12, Math.max(R + 12, aim.y));
      const f = still ? 1 : 1 - Math.exp(-dt / (pointer ? 90 : 420));
      lens.x += (aim.x - lens.x) * f;
      lens.y += (aim.y - lens.y) * f;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawField(now, false);

      const open = still ? 1 : ease((now - t0 - 500) / 700);
      const r = R * open;
      if (r > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(lens.x, lens.y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = "#0d0e11";
        ctx.fillRect(lens.x - r, lens.y - r, r * 2, r * 2);
        // magnify around the centre of the glass
        ctx.translate(lens.x, lens.y);
        ctx.scale(1.16, 1.16);
        ctx.translate(-lens.x, -lens.y);
        drawField(now + 99999, true);
        ctx.restore();

        // the rim: brand sweep, bottom-left to top-right
        const grad = ctx.createLinearGradient(lens.x - r, lens.y + r, lens.x + r, lens.y - r);
        grad.addColorStop(0, "#7cffb2");
        grad.addColorStop(0.5, "#00d4ff");
        grad.addColorStop(1, "#7b5cff");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(lens.x, lens.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(lens.x, lens.y, r + 7, 0, Math.PI * 2);
        ctx.stroke();
        // four ticks, like a loupe
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          ctx.moveTo(lens.x + Math.cos(a) * (r + 4), lens.y + Math.sin(a) * (r + 4));
          ctx.lineTo(lens.x + Math.cos(a) * (r + 11), lens.y + Math.sin(a) * (r + 11));
        }
        ctx.stroke();
      }

      // the readout rides next to the glass; it only re-renders when the group under it changes
      const g = r > R * 0.9 ? nearest() : null;
      if (g !== shown) { shown = g; setGroup(g); }
      if (hud.current) {
        const right = lens.x + R + 22 + 230 < W;
        const hx = right ? lens.x + R + 22 : lens.x - R - 22 - 230;
        const hy = Math.min(H - 150, Math.max(12, lens.y - 60));
        hud.current.style.transform = `translate3d(${Math.round(mobile ? 12 : hx)}px, ${Math.round(mobile ? H - 118 : hy)}px, 0)`;
      }

      if (!still && seen) raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > W || y > H) return;
      // on desktop the copy column belongs to the copy
      if (!mobile && x < W * 0.4) { pointer = false; return; }
      pointer = true;
      aim.x = x; aim.y = y;
      if (still) kick();
    };
    const onLeave = () => {
      pointer = false;
      visitAt = performance.now();
    };

    size();
    const ro = new ResizeObserver(() => { size(); kick(); });
    ro.observe(el);
    const io = new IntersectionObserver(([en]) => {
      seen = en.isIntersecting;
      if (seen) { last = performance.now(); kick(); }
    });
    io.observe(el);
    const host = el.parentElement!;
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    kick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="lens" ref={wrap} aria-hidden>
      <canvas ref={cv} />
      <div className={`lens-hud${group ? " on" : ""}`} ref={hud}>
        {group && (
          <>
            <div className="lh-top">
              <i style={{ background: group.color }} />
              <span>{group.title}</span>
              <em>example</em>
            </div>
            <dl>
              {group.facts.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>
              ))}
            </dl>
            <div className="lh-sig">
              <span>receipt</span>
              <span className="num">{group.sig.slice(0, 6)}…{group.sig.slice(-6)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
