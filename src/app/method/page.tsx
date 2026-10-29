import type { Metadata } from "next";
import { Footer, Header } from "@/components/chrome";
import { Reveal } from "@/components/reveal";
import { DocNav } from "@/components/doc-nav";
import { CohortReplay } from "@/components/cohort-replay";
import { ScoreSim } from "@/components/score-sim";
import { Funded, PaidBy, Reload, SameFunder, Together, Transfer } from "@/components/diagrams";
import { BANDS, limits, METHOD_VERSION, rules, SCORE_RULES, site } from "@/config/site";

export const metadata: Metadata = {
  title: "Method",
  description: "Exactly how Glass reads holders, draws links, finds cohorts and scores a token. Every threshold, in public.",
};

const src = (file: string) => (site.github ? `${site.github.replace(/\/$/, "")}/blob/main/${file}` : null);

function Src({ file, children }: { file: string; children: React.ReactNode }) {
  const href = src(file);
  return href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <code>{file}</code>;
}

const NAV = [
  { id: "scan", label: "The scan" },
  { id: "links", label: "Links" },
  { id: "cohorts", label: "Cohorts" },
  { id: "fresh", label: "Fresh wallets" },
  { id: "score", label: "Score" },
  { id: "labels", label: "Labels" },
  { id: "limits", label: "Limits" },
  { id: "source", label: "Source" },
];

const hrs = rules.freshWindowSec / 3600;
const W = limits.holders;

// Helius credits for one fresh scan of the top holders: what every step costs, in the same units the bill uses
const COST = [
  { k: "Wallet histories", v: W * 10, note: `${W} × the last 60 transactions at 10 credits`, c: "var(--c6)" },
  { k: "Older wallets", v: W * 10, note: "first SOL and first buy, only for wallets with longer histories", c: "var(--c2)" },
  { k: "Launch block", v: 10, note: "1 × the token's own first slots at 10", c: "var(--c5)" },
  { k: "Names", v: Math.ceil(W / 100) * 100 * 2, note: "batch-identity for holders and their funders", c: "var(--c3)" },
  { k: "Token and holders", v: 10 * (2 + limits.holderPages), note: `getAsset, deployer and up to ${limits.holderPages} holder pages at 10`, c: "var(--c4)" },
];
const COST_TOTAL = COST.reduce((s, c) => s + c.v, 0);

const STEPS = [
  { n: "01", t: "Token", call: "getAsset", d: "Name, symbol, decimals, supply." },
  { n: "02", t: "Holders", call: "getTokenAccounts", d: `Every token account, summed per owner. Up to ${(limits.holderPages * 1000).toLocaleString("en-US")} accounts; the top ${W} are mapped. The bubbles are on screen now.` },
  { n: "03", t: "Wallet history", call: "getTransactionsForAddress", d: "Each holder's last 60 transactions, biggest holders first, all at once. For a young wallet that is its whole life: first SOL, first buy, the reload and every transfer in one read." },
  { n: "04", t: "Older wallets", call: "first SOL + token account", d: "When the history is longer, its first SOL and the oldest transactions of its token account are read too. Both are cached forever: they cannot change." },
  { n: "05", t: "Links", call: "mint history + src/lib/graph.ts", d: "Everyone who got the token in its first slots, then the rules. Links land on the map live as each wallet is read." },
];

export default function Method() {
  return (
    <>
      <Header at="method" />
      <Reveal />
      <main>
        <section className="m-hero">
          <div className="wrap">
            <span className="idx micro">Method {METHOD_VERSION} · generated from the scanner&apos;s own constants</span>
            <h1 className="h-display">The method.</h1>
            <p className="lede">
              Everything Glass decides, and the exact number it decides with. If a number on this page changes, the method version changes with it and
              old maps are never mixed with new ones.
            </p>
            <dl className="m-facts">
              <div><dt className="micro">Link rules</dt><dd className="num">8</dd></div>
              <div><dt className="micro">Cohort signals</dt><dd className="num">6</dd></div>
              <div><dt className="micro">Score inputs</dt><dd className="num">{SCORE_RULES.length}</dd></div>
              <div><dt className="micro">Labels typed by hand</dt><dd className="num">0</dd></div>
            </dl>
          </div>
        </section>

        <div className="wrap doc">
          <DocNav items={NAV} version={METHOD_VERSION} />
          <article className="doc-body">
            <section id="scan" className="m-sec">
              <span className="idx micro">01</span>
              <h2>The scan</h2>
              <p>Five reads, in order. Each step streams to the page while it runs, so you watch the map being built instead of waiting on a spinner.</p>
              <ol className="pipe" data-reveal>
                {STEPS.map((s, i) => (
                  <li key={s.n} style={{ ["--i" as string]: i }}>
                    <span className="pipe-n num">{s.n}</span>
                    <b>{s.t}</b>
                    <code>{s.call}</code>
                    <p>{s.d}</p>
                  </li>
                ))}
              </ol>

              <figure className="cost" data-reveal>
                <figcaption>
                  <span className="micro">Cost of one fresh scan</span>
                  <span className="cost-total num">{COST_TOTAL.toLocaleString("en-US")} <small>Helius credits</small></span>
                </figcaption>
                <div className="cost-bar" aria-hidden>
                  {COST.map((c, i) => (
                    <i key={c.k} style={{ width: `${(c.v / COST_TOTAL) * 100}%`, background: c.c, ["--i" as string]: i }} />
                  ))}
                </div>
                <ul>
                  {COST.map((c) => (
                    <li key={c.k}>
                      <i style={{ background: c.c }} />
                      <span>{c.k}</span>
                      <span className="cost-note">{c.note}</span>
                      <span className="num">{c.v.toLocaleString("en-US")}</span>
                    </li>
                  ))}
                </ul>
                <p>A rescan of a known token costs a fraction of this: funding and first buys are stored permanently, only new holders are read.</p>
              </figure>
            </section>

            <section id="links" className="m-sec">
              <span className="idx micro">02</span>
              <h2>Links</h2>
              <p>A line between two bubbles has one of eight causes, and each carries the transaction signature that proves it. Linked wallets form a cluster. A cluster that contains the deployer, or a wallet the deployer funded, is marked as the deployer&apos;s.</p>
              <div className="m-rules" data-reveal>
                {[
                  { n: "Moved between holders", art: <Funded label="2.5 SOL · Oct 12" />, t: "Any transfer between two top holders, of any token or SOL, at any time, from each holder's last 60 transactions. This is the link every bubble map is built on." },
                  { n: "Middleman", art: <SameFunder />, t: "An unnamed outside wallet that sent SOL (0.05+) or this token to 2+ holders, or collected this token from them. Exchanges, named services and wallets touching 40%+ of holders are excluded: those serve everyone." },
                  { n: "Funded", art: <Funded />, t: "A top holder, or the deployer, sent another top holder its first SOL." },
                  { n: "Same funder", art: <SameFunder />, t: `${rules.sharedFunderMin}+ top holders got their first SOL from one wallet with no known name or type. Exchanges, bridges and protocols are excluded: they fund unrelated people all day.` },
                  { n: "Token transfer", art: <Transfer />, t: "A holder's first tokens came out of another holder's wallet, not a pool, curve or other program, in the same transaction." },
                  { n: "Fee paid by", art: <PaidBy />, t: "Another top holder, the deployer, or one unnamed wallet paying for 2+ holders signed and paid the fee of a holder's first buy. Named relayers are excluded." },
                  { n: "Loaded before buying", art: <Reload />, t: `The last SOL a wallet received before its first buy, within ${rules.prefundWindowSec / 3600}h: from another holder, the deployer, or one unnamed wallet shared by 2+ holders. From an exchange it links only as a batch: ${rules.batchMin}+ withdrawals from the same hot wallet, at most ${rules.batchGapSec / 60} minutes apart, amounts within ${Math.round(rules.batchAmountSpread * 100)}%. This is how aged wallets with clean histories get caught.` },
                ].map((r) => (
                  <div className="m-rule" key={r.n}>
                    <div className="card-art">{r.art}</div>
                    <div>
                      <h3>{r.n}</h3>
                      <p>{r.t}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section id="cohorts" className="m-sec">
              <span className="idx micro">03</span>
              <h2>Cohorts</h2>
              <p>
                Bundlers spread SOL through fresh wallets so no transfer ever joins them. What they cannot hide is timing and habit. A cohort is{" "}
                {rules.cohortMinSize} or more wallets whose first buys land within {rules.cohortSlotWindow + 1} slots of each other, or 2 or more that bought in the
                block the token was created in: those buys were placed together with the launch.
              </p>
              <CohortReplay />
              <table className="doc-tbl">
                <thead><tr><th>Signal</th><th>Counts when</th></tr></thead>
                <tbody>
                  <tr><td>One fee payer</td><td>One wallet paid the fee for 2+ of the buys. On its own this makes a cohort high confidence.</td></tr>
                  <tr><td>Same size</td><td>SOL spent spreads less than {Math.round(rules.cohortSizeSpread * 100)}% of the median.</td></tr>
                  <tr><td>Same Jito tip</td><td>Half or more paid an identical tip to a Jito tip account.</td></tr>
                  <tr><td>Fresh wallets</td><td>Half or more were funded less than {hrs}h before their first buy.</td></tr>
                  <tr><td>Reloaded</td><td>Half or more received SOL less than {hrs}h before their first buy, however old the wallet.</td></tr>
                  <tr><td>Launch block</td><td>The buys landed within {rules.launchBlockSlots + 1} slots of the token&apos;s creation. Counts as two signals.</td></tr>
                </tbody>
              </table>
              <div className="conf-grid">
                <div><span className="conf conf-high">high</span><p>A shared fee payer, or two signals.</p></div>
                <div><span className="conf conf-medium">medium</span><p>One signal.</p></div>
                <div><span className="conf conf-low">low</span><p>Timing alone. Shown on the map, never scored.</p></div>
              </div>
              <h3 className="m-h3">Launch bundle</h3>
              <p>
                Separately, the token&apos;s own history is read from its creation slot: every wallet that received it in that block or the{" "}
                {rules.launchWindowSlots} after it, except the deployer. Those buys were placed with the launch. The panel shows how much of the supply they got and
                how much they still hold, and what they still hold is scored. A bundle that sold or moved its tokens still shows as bought.
              </p>
            </section>

            <section id="fresh" className="m-sec">
              <span className="idx micro">04</span>
              <h2>Fresh wallets</h2>
              <p>A wallet is fresh when its first SOL arrived less than {hrs} hours before its first buy of the token. Real traders have history; a bundle&apos;s wallets are usually made for the launch.</p>
              <figure className="fresh" data-reveal>
                {[
                  { k: "Fresh", from: 0.62, to: 0.74, note: `funded 2h 10m before buying`, hot: true },
                  { k: "Not fresh", from: 0.08, to: 0.74, note: "funded 41 days before buying", hot: false },
                ].map((r) => (
                  <div className="fresh-row" key={r.k}>
                    <span className="micro">{r.k}</span>
                    <div className="fresh-track">
                      <i className="fresh-win" style={{ left: "52%", width: "22%" }} />
                      <i className={`fresh-span${r.hot ? " hot" : ""}`} style={{ left: `${r.from * 100}%`, width: `${(r.to - r.from) * 100}%` }} />
                      <b className="fresh-pt" style={{ left: `${r.from * 100}%` }} title="first SOL in" />
                      <b className="fresh-pt buy" style={{ left: `${r.to * 100}%` }} title="first buy" />
                    </div>
                    <span className="fresh-note">{r.note}</span>
                  </div>
                ))}
                <div className="fresh-legend micro">
                  <span><b className="fresh-pt" /> first SOL in</span>
                  <span><b className="fresh-pt buy" /> first buy</span>
                  <span><i className="fresh-win" /> {hrs}h window</span>
                </div>
              </figure>
            </section>

            <section id="score" className="m-sec">
              <span className="idx micro">05</span>
              <h2>Score</h2>
              <p>
                The score starts at 100 and loses points for each signal, measured as a share of total supply. The caps add up to 100. Move the inputs to see
                the exact arithmetic the scanner runs.
              </p>
              <ScoreSim />
              <table className="doc-tbl">
                <thead><tr><th>Input</th><th className="r">Free</th><th className="r">Weight</th><th className="r">Max</th></tr></thead>
                <tbody>
                  {SCORE_RULES.map((r) => (
                    <tr key={r.key}><td>{r.label}</td><td className="r">{r.free}%</td><td className="r">×{r.weight}</td><td className="r">{r.max}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="bands">
                {[...BANDS].reverse().map((b, i, all) => (
                  <div key={b.band} className={`band-cell band-${b.band}`} style={{ flexGrow: (i === all.length - 1 ? 100 : all[i + 1].min) - b.min }}>
                    <span>{b.label}</span>
                    <span className="num">{b.min}+</span>
                  </div>
                ))}
              </div>
              <p>The score describes a holder list. It does not say a token is good or bad, and it does not accuse anyone.</p>
            </section>

            <section id="labels" className="m-sec">
              <span className="idx micro">06</span>
              <h2>Labels</h2>
              <div className="lab-grid">
                <div><b>Known entity</b><p>Names from Helius&apos; identity data: exchanges, protocols, market makers. Exchange wallets never join a cluster.</p></div>
                <div><b>Rule</b><p>Deployer, Burned, Program account. Derived from the chain, never typed by hand.</p></div>
                <div><b>Project</b><p>Shown with who set it. A label changes the name on a bubble, never the lines around it.</p></div>
              </div>
            </section>

            <section id="limits" className="m-sec">
              <span className="idx micro">07</span>
              <h2>Limits</h2>
              <p>What Glass does not see yet, stated plainly so nobody reads more into a map than it holds.</p>
              <ul className="limits">
                <li>Only the top {W} holders are drawn and scored.</li>
                <li>Funding is the first SOL a wallet received. A wallet funded through an exchange and then used by a bundler does not link by funding; it can still land in a cohort.</li>
                <li>Two-hop funding (A funds B, B funds C) is not followed yet. Reloads through an exchange link only as a batch, so a bundler who withdraws at random times and amounts can still pass.</li>
                <li>A cohort is evidence of coordinated timing, not proof of one owner. Bots chasing the same launch can look alike.</li>
                <li>Finished maps are cached for {limits.scanTtl}s. Rescan reads everything again.</li>
              </ul>
            </section>

            <section id="source" className="m-sec">
              <span className="idx micro">08</span>
              <h2>Source</h2>
              <p>
                Glass is open source under the MIT license. The rules on this page live in <Src file="src/lib/graph.ts">src/lib/graph.ts</Src>, the thresholds in{" "}
                <Src file="src/config/site.ts">src/config/site.ts</Src>, every chain read in <Src file="src/lib/helius.ts">src/lib/helius.ts</Src>, and the tests that pin
                each rule in <Src file="test/graph.test.ts">test/graph.test.ts</Src>.
              </p>
            </section>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
