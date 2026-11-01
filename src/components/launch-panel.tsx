"use client";
import { useState } from "react";
import type { MapResult } from "@/lib/types";
import { explorer } from "@/config/site";
import { short } from "@/lib/address";
import { fmtPct, fmtSol } from "@/lib/format";
import type { Pick } from "./map-canvas";

const slotName = (o: number) => (o === 0 ? "Block 0" : `+${o}`);

/** The launch window, read from the token's own history: who took supply at birth, and who still has it. */
export function LaunchPanel({ d, setPick }: { d: MapResult; setPick: (p: Pick) => void }) {
  const [all, setAll] = useState(false);
  const l = d.launch;
  if (!l || !l.list) return null;
  const rows = all ? l.list : l.list.slice(0, 10);
  const people = l.wallets + (l.dev ? 1 : 0);
  const max = Math.max(...l.bySlot.map((s) => s.pct), 0.0001);
  return (
    <section className={`launch${d.self ? " launch-own" : ""}`} aria-label="Launch window">
      <div className="launch-top">
        <span className="micro">Launch window</span>
        {l.createSig && (
          <a className="micro launch-tx" href={explorer.tx(l.createSig)} target="_blank" rel="noreferrer">creation tx ↗</a>
        )}
      </div>

      <div className="launch-kpi">
        <div><span className="micro">Taken</span><b className="num">{fmtPct(l.pctBought)}</b></div>
        <div><span className="micro">Block 0</span><b className="num">{fmtPct(l.pctBlock0)}</b></div>
        <div><span className="micro">Held now</span><b className="num">{fmtPct(l.pctHeldAll)}</b></div>
        <div><span className="micro">Dev took</span><b className="num">{l.dev ? fmtPct(l.dev.got) : "0%"}</b></div>
      </div>

      <p>
        <b className="num">{people}{l.partial ? "+" : ""}</b> wallet{people === 1 ? "" : "s"}{l.dev ? ", the deployer included," : ""} took{" "}
        <b className="num">{fmtPct(l.pctBought)}</b> of supply in the creation block and the {l.window} slots after it, for{" "}
        <b className="num">{fmtSol(l.sol)}</b>.
        {l.dev && <> The deployer took <b className="num">{fmtPct(l.dev.got)}</b>{l.dev.sameTx ? " in the creation transaction itself" : ""} and holds <b className="num">{fmtPct(l.dev.holds)}</b> now.</>}
      </p>
      <p>
        The other launch wallets hold <b className="num">{fmtPct(l.pctHeldDirect)}</b> now
        {l.passedTo > 0 && (l.pctHeldPassed > 0
          ? <>, and <b className="num">{l.passedTo}</b> wallet{l.passedTo === 1 ? "" : "s"} they passed tokens to hold <b className="num">{fmtPct(l.pctHeldPassed)}</b> more</>
          : <>; the <b className="num">{l.passedTo}</b> wallet{l.passedTo === 1 ? "" : "s"} they passed tokens to hold{l.passedTo === 1 ? "s" : ""} none now</>)}.
        {l.pctSoldInWindow > 0.005 && <> <b className="num">{fmtPct(l.pctSoldInWindow)}</b> was sold back inside the window.</>}
      </p>
      {(l.tipped > 0 || l.paidByOther > 0) && (
        <p className="launch-sig">
          {l.tipped > 0 && <span><b className="num">{l.tipped}</b> paid a Jito tip</span>}
          {l.paidByOther > 0 && <span><b className="num">{l.paidByOther}</b> buys signed by another wallet{l.sharedPayers ? `, ${l.sharedPayers} payer${l.sharedPayers === 1 ? "" : "s"} paying for 2+` : ""}</span>}
        </p>
      )}

      <ol className="launch-slots" aria-label="Supply taken per slot">
        {l.bySlot.map((s) => (
          <li key={s.offset}>
            <span className="micro">{slotName(s.offset)}</span>
            <i style={{ transform: `scaleX(${s.pct / max})` }} aria-hidden />
            <span className="num">{s.wallets} · {fmtPct(s.pct)}</span>
          </li>
        ))}
      </ol>

      <table className="launch-tbl">
        <thead>
          <tr><th>Wallet</th><th>Slot</th><th className="r">Took</th><th className="r">Holds</th><th className="r">SOL</th></tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id} onClick={() => w.rank && setPick({ node: w.id })} className={w.rank ? "on-map" : ""}>
              <td>
                <a href={explorer.tx(w.signature)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{short(w.id, 4)}</a>
                {w.dev && <span className="tag">dev</span>}
                {w.rank && <span className="tag">#{w.rank}</span>}
                {w.feePayer !== w.id && <span className="tag" title={`first buy paid by ${w.feePayer}`}>paid by {short(w.feePayer, 3)}</span>}
              </td>
              <td className="num">{slotName(w.offset)}</td>
              <td className="r num">{fmtPct(w.got)}</td>
              <td className={`r num${w.holds === 0 ? " out" : ""}`}>{w.holds === 0 ? "0" : fmtPct(w.holds)}</td>
              <td className="r num">{w.sol.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {l.list.length > 10 && (
        <button className="launch-more micro" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${l.list.length}${l.partial ? "+" : ""}`}
        </button>
      )}
    </section>
  );
}
