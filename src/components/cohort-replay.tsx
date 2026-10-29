"use client";
import { useState } from "react";
import { rules } from "@/config/site";
import { Redo } from "./icons";

/*
 * A launch replayed slot by slot. Most first buys land alone. Seven land inside two slots,
 * all paid by one wallet, all the same size, all with the same tip: a bundle with no transfer between them.
 * Example data.
 */

const SLOT0 = 312004108;
const N = 20;
type Buy = { s: number; sol: number; c?: boolean };
const BUYS: Buy[] = [
  { s: 0, sol: 0.8 }, { s: 1, sol: 2.4 }, { s: 1, sol: 0.3 }, { s: 3, sol: 1.1 }, { s: 4, sol: 0.5 }, { s: 6, sol: 3.2 },
  { s: 9, sol: 2.0, c: true }, { s: 9, sol: 1.98, c: true }, { s: 9, sol: 2.03, c: true }, { s: 9, sol: 2.01, c: true },
  { s: 10, sol: 1.99, c: true }, { s: 10, sol: 2.04, c: true }, { s: 10, sol: 2.0, c: true },
  { s: 12, sol: 0.6 }, { s: 13, sol: 1.4 }, { s: 15, sol: 0.2 }, { s: 16, sol: 4.1 }, { s: 18, sol: 0.9 }, { s: 19, sol: 0.4 },
];

const X0 = 54, DX = 31, BASE = 196;

export function CohortReplay() {
  const [run, setRun] = useState(0);
  const stack = new Map<number, number>();
  const dots = BUYS.map((b) => {
    const k = stack.get(b.s) || 0;
    stack.set(b.s, k + 1);
    const r = 4 + Math.sqrt(b.sol) * 3.2;
    return { ...b, r, x: X0 + b.s * DX, y: BASE - 12 - k * 19 };
  });
  return (
    <figure className={`replay${run ? " in" : ""}`} data-reveal key={run}>
      <div className="replay-top">
        <span className="micro">First buys by slot · example launch</span>
        <button className="btn btn-line btn-sm" onClick={() => setRun((n) => n + 1)}><Redo size={12} /><span>Replay</span></button>
      </div>
      <div className="replay-body">
        <svg viewBox="0 0 700 240" className="replay-svg" aria-label="Chart of first buys per slot. Seven buys land in slots 312,004,117 and 118 with one fee payer, the same size and the same tip.">
          <rect className="rp-band" x={X0 + 9 * DX - 14} y="38" width={DX + 28} height={BASE - 30} rx="6" fill="rgba(255,181,71,.07)" stroke="rgba(255,181,71,.45)" strokeDasharray="3 3" />
          <text className="rp-band-t" x={X0 + 9.5 * DX} y="28" textAnchor="middle" fontSize="10.5" fill="#ffb547" style={{ fontFamily: "var(--font-mono)", fontStretch: "87.5%" }}>
            {rules.cohortSlotWindow + 1}-slot window
          </text>
          <line x1="30" y1={BASE} x2="680" y2={BASE} stroke="rgba(255,255,255,.2)" />
          {Array.from({ length: N }, (_, i) => (
            <g key={i}>
              <line x1={X0 + i * DX} y1={BASE} x2={X0 + i * DX} y2={BASE + (i % 5 ? 4 : 8)} stroke="rgba(255,255,255,.25)" />
              {i % 5 === 0 && (
                <text x={X0 + i * DX} y={BASE + 22} textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,.4)" style={{ fontFamily: "var(--font-mono)", fontStretch: "87.5%" }}>
                  {(SLOT0 + i).toLocaleString("en-US")}
                </text>
              )}
            </g>
          ))}
          {dots.map((d, i) => (
            <circle
              key={i}
              className="rp-dot"
              style={{ animationDelay: `${0.25 + d.s * 0.11 + (d.c ? 0.02 * i : 0)}s` }}
              cx={d.x} cy={d.y} r={d.r}
              fill={d.c ? "#ffb547" : "rgba(255,255,255,.2)"}
              stroke="#0f0f11" strokeWidth="2.5"
            />
          ))}
        </svg>
        <ol className="rp-signals">
          <li style={{ animationDelay: "2.7s" }}><b>7 first buys</b><span>in slots 312,004,117 and 118</span></li>
          <li style={{ animationDelay: "3s" }}><b>One fee payer</b><span>9Wzk…k3Lq paid for 6 of the 7</span></li>
          <li style={{ animationDelay: "3.3s" }}><b>Same size</b><span>1.98 to 2.04 SOL, a 3% spread</span></li>
          <li style={{ animationDelay: "3.6s" }}><b>Same Jito tip</b><span>0.001 SOL on every buy</span></li>
          <li className="rp-verdict" style={{ animationDelay: "4s" }}><b>Cohort, high confidence</b><span>no transfer joins them, the timing does</span></li>
        </ol>
      </div>
    </figure>
  );
}
