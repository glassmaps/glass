// One small animated drawing per link rule. Pure SVG and CSS: the final frame is the default state,
// so with no script or with reduced motion each one still reads as a finished diagram.

const C = { a: "#00d4ff", b: "#7b5cff", c: "#7cffb2", warn: "#ffb547", ink: "rgba(255,255,255,.62)", dim: "rgba(255,255,255,.16)", bg: "#0f0f11" };
const mono = { fontFamily: "var(--font-mono)", fontStretch: "87.5%" } as const;

export function Funded() {
  return (
    <svg className="dg" viewBox="0 0 280 150" aria-hidden>
      <line className="dg-draw" x1="98" y1="80" x2="190" y2="80" pathLength={100} stroke={C.a} strokeWidth="1.5" />
      <circle className="dg-pulse dg-x" cx="98" cy="80" r="3" fill={C.a} style={{ ["--dx" as string]: "92px" }} />
      <circle cx="70" cy="80" r="27" fill={C.a} stroke={C.bg} strokeWidth="3" />
      <circle className="dg-fill" cx="210" cy="80" r="19" fill={C.a} stroke={C.bg} strokeWidth="3" style={{ ["--from" as string]: C.dim }} />
      <text className="dg-late" x="140" y="34" textAnchor="middle" fontSize="10" fill={C.ink} style={mono}>0.42 SOL · first SOL in</text>
      <text x="70" y="84" textAnchor="middle" fontSize="10" fill="rgba(0,0,0,.7)" style={mono}>A</text>
      <text x="210" y="84" textAnchor="middle" fontSize="10" fill="rgba(0,0,0,.7)" style={mono}>B</text>
      <text className="dg-late2" x="144" y="132" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.4)" style={mono}>receipt 4hXq…Pz9e ↗</text>
    </svg>
  );
}

export function SameFunder() {
  const kids: [number, number, number][] = [[58, 112, 17], [140, 120, 21], [222, 108, 15]];
  return (
    <svg className="dg" viewBox="0 0 280 150" aria-hidden>
      {kids.map(([x, y], i) => (
        <line key={i} className="dg-draw" style={{ animationDelay: `${0.15 + i * 0.22}s` }} x1="140" y1="34" x2={x} y2={y} pathLength={100} stroke={C.b} strokeWidth="1.2" />
      ))}
      {kids.map(([x, y, r], i) => (
        <circle key={i} className="dg-fill" style={{ ["--from" as string]: C.dim, animationDelay: `${0.5 + i * 0.22}s` }} cx={x} cy={y} r={r} fill={C.b} stroke={C.bg} strokeWidth="3" />
      ))}
      <circle cx="140" cy="34" r="7" fill={C.bg} stroke={C.b} strokeWidth="1.5" />
      <text x="156" y="30" fontSize="9.5" fill={C.ink} style={mono}>unnamed funder</text>
      <text x="156" y="42" fontSize="9" fill="rgba(255,255,255,.36)" style={mono}>8xQm…P4eD</text>
    </svg>
  );
}

export function Transfer() {
  return (
    <svg className="dg" viewBox="0 0 280 150" aria-hidden>
      <line className="dg-march" x1="96" y1="80" x2="190" y2="80" stroke={C.c} strokeWidth="1.5" strokeDasharray="5 4" />
      <g className="dg-x dg-slide" style={{ ["--dx" as string]: "70px" }}>
        <rect x="104" y="58" width="44" height="16" rx="3" fill={C.bg} stroke={C.c} strokeWidth="1" />
        <text x="126" y="69.5" textAnchor="middle" fontSize="9" fill={C.c} style={mono}>$TKN</text>
      </g>
      <circle cx="70" cy="80" r="25" fill={C.c} stroke={C.bg} strokeWidth="3" />
      <circle className="dg-fill" cx="210" cy="80" r="20" fill={C.c} stroke={C.bg} strokeWidth="3" style={{ ["--from" as string]: C.dim, animationDelay: "1.1s" }} />
      <text x="144" y="112" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.4)" style={mono}>not from a pool or curve</text>
    </svg>
  );
}

export function Together() {
  const strays: [number, number][] = [[46, 0.1], [92, 0.35], [214, 1.25], [252, 1.5]];
  const pack = [138, 154, 170];
  return (
    <svg className="dg" viewBox="0 0 280 150" aria-hidden>
      <rect className="dg-band" x="128" y="22" width="52" height="104" rx="4" fill="rgba(255,181,71,.07)" stroke="rgba(255,181,71,.35)" strokeDasharray="3 3" />
      <line x1="16" y1="126" x2="264" y2="126" stroke="rgba(255,255,255,.18)" />
      {Array.from({ length: 13 }, (_, i) => (
        <line key={i} x1={20 + i * 20} y1="126" x2={20 + i * 20} y2={i % 2 ? 129 : 132} stroke="rgba(255,255,255,.22)" />
      ))}
      {strays.map(([x, d], i) => (
        <circle key={i} className="dg-drop" style={{ animationDelay: `${d}s` }} cx={x} cy="110" r={6 + (i % 2) * 3} fill={C.dim} stroke={C.bg} strokeWidth="2" />
      ))}
      {pack.map((x, i) => (
        <circle key={x} className="dg-drop" style={{ animationDelay: `${0.8 + i * 0.04}s` }} cx={x} cy="110" r="7" fill={C.warn} stroke={C.bg} strokeWidth="2" />
      ))}
      <text className="dg-late" x="154" y="16" textAnchor="middle" fontSize="9.5" fill={C.warn} style={mono}>3 buys · slot 312,004,118</text>
      <text x="20" y="144" fontSize="8.5" fill="rgba(255,255,255,.32)" style={mono}>slot →</text>
    </svg>
  );
}
