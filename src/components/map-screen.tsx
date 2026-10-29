"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge, MapResult, Stage } from "@/lib/types";
import { explorer } from "@/config/site";
import { short } from "@/lib/address";
import { readLine } from "@/lib/stream";
import { ago, fmtAmount, fmtInt, fmtPct, fmtSol, fmtUsd, utc } from "@/lib/format";
import { clusterColor, MapCanvas, type Layers, type Pick } from "./map-canvas";
import { CopyButton } from "./copy";
import { TokenImg } from "./token-img";
import { VenueLinks } from "./venues";
import { LaunchPanel } from "./launch-panel";
import { Close, Fit, Minus, Out, Plus, Redo, Share } from "./icons";

type Err = { code: string; message: string };

const BAND_LABEL: Record<MapResult["score"]["band"], string> = {
  clear: "Clear", watch: "Watch", concentrated: "Concentrated", heavy: "Heavy",
};

// ------------------------------------------------------------------ data loading

function useScan(mint: string, initial: MapResult | null) {
  const [data, setData] = useState<MapResult | null>(initial);
  const [stage, setStage] = useState<Stage | null>(null);
  const [err, setErr] = useState<Err | null>(null);
  const [run, setRun] = useState(initial ? 0 : 1);
  const [fresh, setFresh] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!run) return;
    const ctl = new AbortController();
    setErr(null);
    setStage({ stage: "token" });
    (async () => {
      try {
        const res = await fetch(`/api/map/${mint}?stream=1${fresh ? "&fresh=1" : ""}`, { signal: ctl.signal });
        if (res.status === 429 || !res.body) {
          const j = await res.json().catch(() => null);
          setErr(j?.error || { code: "upstream", message: "The scan could not start. Try again in a moment." });
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            const l = readLine(line);
            if (l.kind === "result") { setData(l.map); setLive(false); }
            else if (l.kind === "partial") { setData(l.map); setLive(true); }
            else if (l.kind === "error") setErr(l.error);
            else if (l.kind === "stage") setStage(l.stage);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr({ code: "network", message: "The connection dropped during the scan. Your network, or ours." });
      } finally {
        setStage(null);
        setLive(false);
      }
    })();
    return () => ctl.abort();
  }, [mint, run, fresh]);

  return {
    data, stage, err, live,
    retry: () => setRun((r) => r + 1),
    rescan: () => {
      setFresh(true);
      setRun((r) => r + 1);
    },
  };
}

// ------------------------------------------------------------------ states

const STEPS: { key: Stage["stage"]; label: string }[] = [
  { key: "token", label: "Token" },
  { key: "holders", label: "Holders" },
  { key: "links", label: "Wallet histories" },
  { key: "layout", label: "Links and layout" },
];

function Scanning({ stage }: { stage: Stage }) {
  const t0 = useRef(Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);
  const at = STEPS.findIndex((s) => s.key === stage.stage);
  return (
    <div className="state">
      <div className="state-box" aria-live="polite">
        <h2 className="h2">Reading the chain</h2>
        <p>The map opens as soon as the holders are read. Links then land live, biggest holders first.</p>
        <ol className="steps">
          {STEPS.map((s, i) => {
            const cls = i < at ? "done" : i === at ? "on" : "";
            let n = "";
            if (i === at && stage.stage === "holders" && stage.count) n = fmtInt(stage.count);
            if (i === at && (stage.stage === "funding" || stage.stage === "first" || stage.stage === "links")) n = `${stage.done}/${stage.total}`;
            return (
              <li key={s.key} className={cls}>
                <span className="st" aria-hidden />
                {s.label}
                <span className="n num">{n}</span>
              </li>
            );
          })}
        </ol>
        <p className="micro elapsed num">{((Date.now() - t0.current) / 1000).toFixed(1)}s</p>
      </div>
    </div>
  );
}

/** Sits on the map while links land: what is being read, how far along, how long it has taken. */
function LivePill({ stage, live }: { stage: Stage; live: boolean }) {
  const t0 = useRef(Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);
  const label = STEPS.find((s) => s.key === stage.stage)?.label || "Reading";
  const pct = "done" in stage && stage.total ? Math.round((stage.done / stage.total) * 100) : null;
  return (
    <div className="live" role="status" aria-live="polite">
      <span className="live-dot" aria-hidden />
      <span>{live ? (stage.stage === "links" ? "Reading links" : label) : "Refreshing"}</span>
      {pct !== null && <span className="num live-n">{pct}%</span>}
      <span className="num live-t">{((Date.now() - t0.current) / 1000).toFixed(1)}s</span>
      {pct !== null && <i className="live-bar" style={{ transform: `scaleX(${pct / 100})` }} aria-hidden />}
    </div>
  );
}

const ERR_TITLE: Record<string, string> = {
  "bad-address": "Not an address",
  "not-token": "No token here",
  "no-holders": "Nobody holds it yet",
  config: "Data key missing",
  rate: "Slow down a little",
  network: "Connection dropped",
  upstream: "Upstream hiccup",
};

function Failed({ err, retry }: { err: Err; retry: () => void }) {
  const canRetry = !["bad-address", "not-token", "config"].includes(err.code);
  return (
    <div className="state">
      <div className="state-box" role="alert">
        <h2 className="h2">{ERR_TITLE[err.code] || "Scan failed"}</h2>
        <p>{err.message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          {canRetry && <button className="btn btn-acc" onClick={retry}>Try again</button>}
          <Link className="btn btn-line" href="/">Map another token</Link>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ panel parts

function ScoreTab({ d, live = false, setPick }: { d: MapResult; live?: boolean; setPick: (p: Pick) => void }) {
  return (
    <>
      <div className="score-head">
        <div className="score-big num">{d.score.total}<small>/100</small></div>
        {live ? (
          <span className="band band-live">Reading</span>
        ) : d.complete === false ? (
          <span className="band band-concentrated">Incomplete</span>
        ) : (
          <span className={`band band-${d.score.band}`}>{BAND_LABEL[d.score.band]}</span>
        )}
        <p className="score-note">
          {live
            ? "Links are still landing. The score moves as each one is read."
            : d.complete === false
            ? "Not enough of the chain was read to draw links, so this score only counts what was read. See the note above."
            : "A number, not a verdict. Every point comes from a line below."}
        </p>
      </div>
      <LaunchPanel d={d} setPick={setPick} />
      <ul className="items">
        {d.score.items.map((i) => (
          <li key={i.key}>
            <span className="lbl">{i.label}</span>
            <span className="val num">{fmtPct(i.value)}</span>
            <span className={`pen num${i.penalty ? " hit" : ""}`}>{i.penalty ? `\u2212${i.penalty}` : "0"}</span>
            <span className="bar"><i style={{ width: `${Math.min(100, i.value)}%` }} /></span>
          </li>
        ))}
      </ul>
      <p className="pane-note">
        Shares are of total supply. Pools, curves and burns are left out. The full formula is on the <Link href="/method#score">method page</Link>.
      </p>
    </>
  );
}

function ClustersTab({ d, pick, setPick }: { d: MapResult; pick: Pick; setPick: (p: Pick) => void }) {
  if (!d.clusters.length && !d.cohorts.length)
    return <p className="pane-note" style={{ borderTop: 0 }}>No two of the top holders share a funder, fund each other or passed tokens between them, and no group bought together. That is as clean as a holder list gets.</p>;
  return (
    <>
      {d.clusters.length > 0 && <p className="micro" style={{ padding: "16px 16px 8px" }}>Linked wallets</p>}
      <ul className="list">
        {d.clusters.map((c) => (
          <li key={c.id}>
            <button className="row-btn cl-row" aria-pressed={pick?.cluster === c.id} onClick={() => setPick(pick?.cluster === c.id ? null : { cluster: c.id })}>
              <span className="cl-dot" style={{ background: clusterColor(c.id)! }} />
              <span>
                <span className="t">Cluster {c.id}{c.hasDeployer && <span className="sep">deployer</span>}</span>
                <span className="s">{c.members.length} wallets</span>
              </span>
              <span className="p num">{fmtPct(c.pct)}</span>
            </button>
          </li>
        ))}
      </ul>
      {d.cohorts.length > 0 && <p className="micro" style={{ padding: "20px 16px 8px" }}>Bought together</p>}
      <ul className="list">
        {d.cohorts.map((c) => (
          <li key={c.id}>
            <button className="row-btn cl-row" aria-pressed={pick?.cohort === c.id} onClick={() => setPick(pick?.cohort === c.id ? null : { cohort: c.id })}>
              <span className="cl-dot" style={{ border: "1.5px dashed var(--warn)" }} />
              <span>
                <span className="t">Cohort {c.id}<span className={`conf conf-${c.confidence}`}>{c.confidence}</span></span>
                <span className="s">{c.members.length} wallets<span className="sep">slot <span className="num">{fmtInt(c.slot)}</span></span></span>
              </span>
              <span className="p num">{fmtPct(c.pct)}</span>
            </button>
            {pick?.cohort === c.id && (
              <ul className="sig-list">{c.signals.map((s) => <li key={s}>{s}</li>)}</ul>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function HoldersTab({ d, pick, setPick }: { d: MapResult; pick: Pick; setPick: (p: Pick) => void }) {
  const rows = d.nodes.filter((n) => n.rank > 0);
  return (
    <table className="tbl">
      <thead>
        <tr><th>#</th><th>Wallet</th><th>Share</th><th>Amount</th></tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.id} aria-selected={pick?.node === n.id} onClick={() => setPick({ node: n.id })}>
            <td className="num">{n.rank}</td>
            <td>
              <span className="w">
                <i style={{ background: n.kind === "holder" ? clusterColor(n.cluster) || "rgba(255,255,255,.2)" : "transparent", border: n.kind !== "holder" ? "1px dashed var(--ink-4)" : 0 }} />
                {short(n.id, 4)}
              </span>{" "}
              {n.label && <span className="lab">{n.label}</span>}
              {n.fresh && <span className="flag" title="Funded less than 6h before its first buy"> ·fresh</span>}
            </td>
            <td className="num">{fmtPct(n.pct)}</td>
            <td className="num">{fmtAmount(n.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const EDGE_TITLE: Record<Edge["type"], string> = {
  funded: "Funded", "shared-funder": "Same funder", transfer: "Token transfer",
  paid: "Fee paid by", prefunded: "Loaded before buying", batch: "Exchange batch", moved: "Transfer between wallets",
};

function Receipt({ e }: { e: Edge }) {
  return (
    <>
      {e.receipts.map((r) => (
        <div className="rcpt-card" key={r.signature + e.id}>
          <div className="ty">
            <span className="micro">{EDGE_TITLE[e.type]}</span>
            {r.time ? <span className="micro num">{utc(r.time)}</span> : null}
          </div>
          <p>{r.what}</p>
          <a className="tx" href={explorer.tx(r.signature)} target="_blank" rel="noreferrer">
            {short(r.signature, 6)} <Out size={12} />
          </a>
        </div>
      ))}
    </>
  );
}

function Inspector({ d, pick, onClose }: { d: MapResult; pick: Pick; onClose: () => void }) {
  const node = pick?.node ? d.nodes.find((n) => n.id === pick.node) : null;
  const edge = pick?.edge ? d.edges.find((e) => e.id === pick.edge) : null;
  const open = Boolean(node || edge);
  const links = node ? d.edges.filter((e) => e.a === node.id || e.b === node.id) : [];
  const addr = node?.id.replace(/^f:/, "") || "";

  return (
    <aside className={`insp${open ? " on" : ""}`} aria-hidden={!open}>
      <div className="insp-top">
        <span className="micro">{node ? (node.kind === "funder" ? "Funder" : `Holder #${node.rank}`) : edge ? "Link" : ""}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close" tabIndex={open ? 0 : -1}><Close size={15} /></button>
      </div>
      <div className="insp-body">
        {node && (
          <>
            <div className="who">
              <a href={explorer.account(addr)} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}>{addr}</a>
              <CopyButton value={addr} />
            </div>
            {node.label && (
              <p className="who-label">
                {node.label}{" "}
                <small>{node.labelSource === "self" ? "· labeled by the Glass team" : node.labelSource === "helius" ? "· known entity" : ""}</small>
              </p>
            )}
            <dl className="kv">
              {node.rank > 0 && <><dt>Share of supply</dt><dd className="num">{fmtPct(node.pct)}</dd></>}
              {node.rank > 0 && <><dt>Amount</dt><dd className="num">{fmtAmount(node.amount)}</dd></>}
              {node.cluster && <><dt>Cluster</dt><dd>{node.cluster}</dd></>}
              {node.cohort && <><dt>Cohort</dt><dd>{node.cohort}</dd></>}
              {node.funding && (
                <>
                  <dt>Funded by</dt>
                  <dd>
                    <a href={explorer.tx(node.funding.signature)} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}>
                      {node.funding.funderName || short(node.funding.funder, 4)}
                    </a>
                  </dd>
                  <dt>First SOL in</dt>
                  <dd className="num">{fmtSol(node.funding.amount)} · {utc(node.funding.timestamp)}</dd>
                </>
              )}
              {node.first && (
                <>
                  <dt>First buy</dt>
                  <dd className="num">
                    <a href={explorer.tx(node.first.signature)} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}>slot {fmtInt(node.first.slot)}</a>
                  </dd>
                  {node.first.solSpent > 0 && <><dt>SOL spent</dt><dd className="num">{fmtSol(node.first.solSpent)}</dd></>}
                  {node.first.via && <><dt>Through</dt><dd>{node.first.via}</dd></>}
                  {node.first.tipLamports > 0 && <><dt>Jito tip</dt><dd className="num">{fmtSol(node.first.tipLamports / 1e9)}</dd></>}
                  {node.first.feePayer !== node.id && <><dt>Fee paid by</dt><dd>{short(node.first.feePayer, 4)}</dd></>}
                </>
              )}
              {node.prefund && node.first && (
                <>
                  <dt>Loaded before buying</dt>
                  <dd className="num">
                    <a href={explorer.tx(node.prefund.signature)} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}>
                      {fmtSol(node.prefund.lamports / 1e9)} from {node.prefund.fromName || short(node.prefund.from, 4)}
                    </a>
                    {" · "}{ago(node.prefund.blockTime * 1000, node.first.blockTime * 1000).replace(" ago", " before")}
                  </dd>
                </>
              )}
              {node.launchRole === "dev" && <><dt>Launch</dt><dd className="flag num">deployer, took {fmtPct(node.launchGot || 0)} {node.launchOffset ? `${node.launchOffset} slot${node.launchOffset === 1 ? "" : "s"} after creation` : "in the creation block"}</dd></>}
              {node.launchRole === "bundle" && <><dt>Launch</dt><dd className="flag num">took {fmtPct(node.launchGot || 0)} {node.launchOffset ? `${node.launchOffset} slot${node.launchOffset === 1 ? "" : "s"} after creation` : "in the creation block"}</dd></>}
              {node.launchRole === "passed" && <><dt>Launch</dt><dd className="flag">got its tokens from a launch wallet</dd></>}
              {node.fresh && <><dt>Fresh</dt><dd className="flag">funded under 6h before buying</dd></>}
            </dl>
            <h3 className="micro">{links.length ? `Receipts · ${links.length}` : "Receipts"}</h3>
            {links.length ? links.map((e) => <Receipt key={e.id} e={e} />) : <p className="none">No link to another top holder. Funding and first buy are above, each with its transaction.</p>}
          </>
        )}
        {edge && (
          <>
            <p className="who-label" style={{ marginTop: 0 }}>
              {short(edge.a.replace(/^f:/, ""), 4)} → {short(edge.b, 4)}
            </p>
            <h3 className="micro">Receipt</h3>
            <Receipt e={edge} />
          </>
        )}
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ screen

export function MapScreen({ mint, initial }: { mint: string; initial: MapResult | null }) {
  const { data, stage, err, live, retry, rescan } = useScan(mint, initial);
  const [pick, setPick] = useState<Pick>(null);
  const [tab, setTab] = useState<"clusters" | "holders" | "score">("score");
  const [layers, setLayers] = useState<Layers>({ links: true, cohorts: true, labels: true });
  const [fit, setFit] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);

  // on a phone the panel sits under the map: bring the receipts into view when something is picked
  useEffect(() => {
    if ((pick?.node || pick?.edge) && window.matchMedia("(max-width: 900px)").matches) {
      sideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPick(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const linked = useMemo(() => (data ? data.clusters.reduce((s, c) => s + c.pct, 0) : 0), [data]);
  const scanning = Boolean(stage);
  // the map is on screen as soon as holders are known; only the very first second shows the step list
  const showState = (scanning && !data) || (!data && err);

  const zoom = (f: number) => {
    const svg = stageRef.current?.querySelector("svg");
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -Math.log(f) / 0.0022, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, cancelable: true }));
  };

  const t = data?.token;
  return (
    <div className="scr">
      <div className="tok">
        <TokenImg className="tok-img" mint={mint} image={t?.image} symbol={t?.symbol} size={34} />
        <div className="tok-name">
          <h1>{t ? t.name : err ? "Unknown token" : "Mapping token"}{t?.symbol && <span>${t.symbol}</span>}</h1>
          <div className="addr">{short(mint, 6)}<CopyButton value={mint} label="Copy contract address" size={12} /></div>
        </div>
        <VenueLinks mint={mint} pair={t?.pairAddress} />
        <div className="tok-stats">
          <div className="stat"><span className="micro">Score</span><span className="v num">{data ? <>{scanning ? <i className="sdot sdot-live" /> : <i className={`sdot band-${data.complete === false ? "concentrated" : data.score.band}`} />}{data.score.total}</> : "—"}</span></div>
          <div className="stat"><span className="micro">Linked</span><span className="v num">{data ? fmtPct(linked) : "—"}</span></div>
          <div className="stat"><span className="micro">Holders</span><span className="v num">{data ? `${data.partial ? "≥" : ""}${fmtInt(data.holdersTotal)}` : "—"}</span></div>
          <div className="stat"><span className="micro">Mcap</span><span className="v num">{fmtUsd(t?.mcapUsd)}</span></div>
          <div className="stat"><span className="micro">Vol 24h</span><span className="v num">{fmtUsd(t?.volume24hUsd)}</span></div>
        </div>
        <div className="tok-actions">
          {data ? (
            <a className="btn btn-line btn-sm" href={`/api/card/${mint}`} target="_blank" rel="noreferrer">
              <Share size={13} /><span>Card</span>
            </a>
          ) : (
            <button className="btn btn-line btn-sm" disabled><Share size={13} /><span>Card</span></button>
          )}
          <button className="btn btn-line btn-sm" onClick={rescan} disabled={scanning} title={data ? `Scanned ${ago(data.scannedAt)}` : undefined}>
            <Redo size={13} /><span>Rescan</span>
          </button>
        </div>
      </div>

      <div className="body">
        <div className="stage" ref={stageRef}>
          {data && !showState && (
            <>
              <MapCanvas data={data} pick={pick} onPick={setPick} layers={layers} fitSignal={fit} />
              <div className="tools">
                <div className="seg" role="group" aria-label="Layers">
                  <button aria-pressed={layers.links} onClick={() => setLayers((l) => ({ ...l, links: !l.links }))}>Links</button>
                  <button aria-pressed={layers.cohorts} onClick={() => setLayers((l) => ({ ...l, cohorts: !l.cohorts }))}>Cohorts</button>
                  <button aria-pressed={layers.labels} onClick={() => setLayers((l) => ({ ...l, labels: !l.labels }))}>Labels</button>
                </div>
                <div className="seg" role="group" aria-label="Zoom">
                  <button className="ico" onClick={() => zoom(1.25)} aria-label="Zoom in"><Plus size={14} /></button>
                  <button className="ico" onClick={() => zoom(0.8)} aria-label="Zoom out"><Minus size={14} /></button>
                  <button className="ico" onClick={() => setFit((n) => n + 1)} aria-label="Fit to view"><Fit size={14} /></button>
                </div>
              </div>
              <div className="legend" aria-hidden>
                <span><i className="swatch" />linked, tap for proof</span>
                {data.edges.some((e) => e.type === "transfer") && <span><i className="swatch dash" />tokens passed</span>}
                {data.edges.some((e) => e.type === "batch") && <span><i className="swatch dot" />exchange batch</span>}
                {data.cohorts.some((c) => c.confidence !== "low") && <span><i className="swatch ring" />bought together</span>}
              </div>
            </>
          )}
          {scanning && data && stage && <LivePill stage={stage} live={live} />}
          {scanning && !data && stage && <Scanning stage={stage} />}
          {!scanning && err && !data && <Failed err={err} retry={retry} />}
          {!scanning && !data && !err && <Scanning stage={{ stage: "token" }} />}
        </div>

        <div className="side" ref={sideRef}>
          {data && !showState ? (
            <>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={tab === "score"} onClick={() => setTab("score")}>Score</button>
                <button role="tab" aria-selected={tab === "clusters"} onClick={() => setTab("clusters")}>
                  Links<span className="ct num">{data.clusters.length + data.cohorts.length}</span>
                </button>
                <button role="tab" aria-selected={tab === "holders"} onClick={() => setTab("holders")}>
                  Holders<span className="ct num">{data.nodes.filter((n) => n.rank).length}</span>
                </button>
              </div>
              {data.notes.length > 0 && <ul className="notes">{data.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              <div className="pane" role="tabpanel">
                {tab === "score" && <ScoreTab d={data} live={scanning} setPick={setPick} />}
                {tab === "clusters" && <ClustersTab d={data} pick={pick} setPick={setPick} />}
                {tab === "holders" && <HoldersTab d={data} pick={pick} setPick={setPick} />}
              </div>
              <Inspector d={data} pick={pick} onClose={() => setPick(null)} />
            </>
          ) : (
            <div className="pane" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}

