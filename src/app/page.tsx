import Link from "next/link";
import { Footer, Header } from "@/components/chrome";
import { Lens } from "@/components/lens";
import { Search } from "@/components/search";
import { CopyButton } from "@/components/copy";
import { Reveal } from "@/components/reveal";
import { CohortReplay } from "@/components/cohort-replay";
import { Funded, PaidBy, Reload, SameFunder, Together, Transfer } from "@/components/diagrams";
import { Check, Close, Out } from "@/components/icons";
import { limits, METHOD_VERSION, rules, site } from "@/config/site";

const hrs = rules.freshWindowSec / 3600;

// Every Bubblemaps claim here is public and sourced. Glass claims are this repository.
const VS: { row: string; them: string; us: string }[] = [
  { row: "Source code", them: "Closed", us: "Open source, MIT. Fork it, audit it, run it yourself." },
  { row: "Cluster rules", them: "Not public", us: `Every threshold on the method page, versioned (now ${METHOD_VERSION}).` },
  { row: "Paywall", them: "P&L, AI cluster reads and 1,000-holder maps need $BMT held", us: "Nothing is gated. No wallet connect, no token, no account." },
  { row: "Investigations", them: "Publishes threads on named traders", us: "Never investigates or accuses anyone. Known names come from public labels, with their source." },
  { row: "Project labels", them: "Projects can submit labels for their own wallets", us: "Every label says who set it. A label never removes a line." },
];

const RULES = [
  { n: "01", name: "Funded", art: <Funded />, text: "One top holder sent another its very first SOL. Same when the deployer did it.", rcpt: "the funding transfer" },
  { n: "02", name: "Same funder", art: <SameFunder />, text: `${rules.sharedFunderMin}+ holders got their first SOL from one wallet nobody can name. Exchanges and bridges fund strangers all day, so they never count.`, rcpt: "every funding transfer" },
  { n: "03", name: "Token transfer", art: <Transfer />, text: "A holder's first tokens came straight out of another holder's wallet, not a pool or the curve.", rcpt: "the transfer" },
  { n: "04", name: "Fee paid by", art: <PaidBy />, text: "Another wallet signed and paid for a holder's first buy. Whoever pays the gas holds the keys, or works for whoever does.", rcpt: "the buy it paid for" },
  { n: "05", name: "Loaded before buying", art: <Reload />, text: `The SOL that paid for the buy came from another holder, from one unnamed wallet, or from an exchange batch: ${rules.batchMin}+ near-equal withdrawals within ${rules.batchGapSec / 60} minutes. Aged wallets can't hide this one.`, rcpt: "the reload transfer" },
  { n: "06", name: "Bought together", art: <Together />, text: `${rules.cohortMinSize}+ first buys inside ${rules.cohortSlotWindow + 1} slots, or 2+ in the block the token was created. Rated by fee payer, size, Jito tip and fresh SOL.`, rcpt: "every first buy" },
];

export default function Home() {
  const curl = `curl ${site.url}/api/v1/map/<mint>`;
  return (
    <>
      <Header at="map" />
      <Reveal />
      <main>
        <section className="hero">
          <Lens />
          <div className="wrap hero-in">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="dot" aria-hidden />
                The open source Bubblemaps alternative
              </p>
              <h1 className="h-display">
                Don&apos;t trust
                <br />
                the map.
                <br />
                <span className="grad">Check it.</span>
              </h1>
              <p className="hero-sub">
                Bubblemaps shows you that wallets are linked. Glass shows you the transaction behind every line, publishes every rule, and costs nothing to use.
              </p>
              <Search />
            </div>
          </div>
          <div className="hero-foot wrap">
            <span className="micro">Move over the field. The glass shows what the grey hides.</span>
            <span className="micro hide-s">Example data</span>
          </div>
        </section>

        <section className="sec" id="vs">
          <div className="wrap">
            <header className="sec-head">
              <span className="idx micro">01 · Versus</span>
              <h2 className="h2">The referee needs a referee.</h2>
              <p className="lede">
                Bubblemaps decides who gets investigated and keeps its best tools behind its own token. Glass names no one, gates nothing and puts
                every rule in public, so the map can be checked by the people it maps.
              </p>
            </header>

            <div className="vs" data-reveal>
              <aside className="vs-case">
                <span className="micro">March 2025 · $BMT launch</span>
                <div className="vs-art" aria-hidden>
                  <svg viewBox="0 0 320 220">
                    {Array.from({ length: 26 }, (_, i) => {
                      const a = i * 2.39996, d = 8 + 11 * Math.sqrt(i);
                      const r = 22 - Math.sqrt(i) * 3.4;
                      return <circle key={i} className="vs-b" style={{ animationDelay: `${i * 30}ms` }} cx={150 + Math.cos(a) * d * 1.6} cy={110 + Math.sin(a) * d * 1.25} r={Math.max(4, r)} fill="#ff6b5b" stroke="#0f0f11" strokeWidth="2.5" />;
                    })}
                    {[[34, 40, 6], [282, 36, 5], [292, 184, 7], [30, 182, 4], [60, 120, 3], [266, 112, 4]].map(([x, y, r], i) => (
                      <circle key={i} cx={x} cy={y} r={r} fill="rgba(255,255,255,.18)" stroke="#0f0f11" strokeWidth="2" />
                    ))}
                  </svg>
                  <span className="vs-pct num">94%<small>of supply, one cluster</small></span>
                </div>
                <p>
                  On Bubblemaps&apos; own map, one deployer-linked cluster held about 94% of the Solana supply of their token at launch. The team called
                  it vesting.
                </p>
                <a className="src" href="https://decrypt.co/309524/crypto-sleuths-bubblemaps-bmt-token-solana-bnb" target="_blank" rel="noreferrer">
                  Source: Decrypt <Out size={11} />
                </a>
                <span className="micro vs-note">Illustration, not their map</span>
              </aside>

              <div className="vs-tbl" role="table" aria-label="Bubblemaps compared with Glass">
                <div className="vs-row vs-th" role="row">
                  <span role="columnheader" />
                  <span role="columnheader" className="micro">Bubblemaps</span>
                  <span role="columnheader" className="micro vs-us">Glass</span>
                </div>
                {VS.map((r, i) => (
                  <div className="vs-row" role="row" key={r.row} style={{ ["--i" as string]: i }}>
                    <span role="rowheader" className="vs-k">{r.row}</span>
                    <span role="cell" className="vs-them"><Close size={12} />{r.them}</span>
                    <span role="cell" className="vs-us"><Check size={13} />{r.us}</span>
                  </div>
                ))}
                <p className="vs-src micro">
                  Bubblemaps facts from their{" "}
                  <a href="https://wiki.bubblemaps.io/bubblemaps-v2/premium" target="_blank" rel="noreferrer">premium wiki</a> and public threads. Checked October 2026.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="sec">
          <div className="wrap">
            <header className="sec-head">
              <span className="idx micro">02 · Links</span>
              <h2 className="h2">How a line gets drawn.</h2>
              <p className="lede">
                Two wallets are joined only by something that happened on chain. Each line opens the transaction that put it there, so you check it on
                Solscan instead of trusting us.
              </p>
            </header>
            <ol className="cards" data-reveal>
              {RULES.map((r) => (
                <li key={r.n} className="card">
                  <div className="card-art">{r.art}</div>
                  <div className="card-txt">
                    <span className="micro">{r.n}</span>
                    <h3>{r.name}</h3>
                    <p>{r.text}</p>
                    <span className="rcpt"><span className="micro">Receipt</span>{r.rcpt}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="sec">
          <div className="wrap">
            <header className="sec-head">
              <span className="idx micro">03 · Bundles</span>
              <h2 className="h2">Bundlers hide transfers. They can&apos;t hide timing.</h2>
              <p className="lede">
                Stealth bundlers spread SOL through fresh wallets so no line ever joins them, and they sell tools that pass the usual bubble maps. Glass
                reads every first buy and groups the ones that land together and look alike.
              </p>
            </header>
            <CohortReplay />
          </div>
        </section>

        <section className="sec">
          <div className="wrap">
            <header className="sec-head">
              <span className="idx micro">04 · Principles</span>
              <h2 className="h2">What Glass never does.</h2>
              <p className="lede">A map is only worth something while nobody can lean on it.</p>
            </header>
            <div className="never">
              <div>
                <span className="micro">i</span>
                <h3>Accuse anyone</h3>
                <p>No callout threads, no investigations. Known names come from a public label database and say so. What a wallet means is yours to judge.</p>
              </div>
              <div>
                <span className="micro">ii</span>
                <h3>Hide a line</h3>
                <p>A label says who set it and sits next to the receipts. Renaming a wallet never removes the link it is part of.</p>
              </div>
              <div>
                <span className="micro">iii</span>
                <h3>Keep the rules secret</h3>
                <p>
                  Every threshold is on the <Link href="/method">method page</Link>
                  {site.github ? <> and in the <a href={site.github} target="_blank" rel="noreferrer">source</a></> : null}. Change one and the method version changes with it.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="api">
          <div className="wrap">
            <header className="sec-head">
              <span className="idx micro">05 · API</span>
              <h2 className="h2">Same data, open API.</h2>
              <p className="lede">
                One read endpoint, open CORS, no key. It returns what the page draws: holders with their funding and first buy, every link with its
                receipts, clusters, cohorts and the score. Maps are cached for {limits.scanTtl}s; a fresh scan is limited to{" "}
                {limits.freshScansPerIpHour} per hour per IP.
              </p>
            </header>
            <figure className="code">
              <div className="code-top">
                <span className="micro">GET /api/v1/map/:mint</span>
                <span className="micro code-meta">200 · application/json</span>
                <CopyButton value={curl} label="Copy the command" />
              </div>
              <pre>
                <span className="k">$</span> {curl}
                {"\n\n"}
                {"{\n"}
                {"  "}<span className="s">&quot;token&quot;</span>: {"{ "}<span className="s">&quot;symbol&quot;</span>: <span className="s">&quot;TKN&quot;</span>, <span className="s">&quot;supply&quot;</span>: <span className="n">999842117</span>{" },\n"}
                {"  "}<span className="s">&quot;holdersTotal&quot;</span>: <span className="n">1873</span>,{"\n"}
                {"  "}<span className="s">&quot;score&quot;</span>: {"{ "}<span className="s">&quot;total&quot;</span>: <span className="n">44</span>, <span className="s">&quot;band&quot;</span>: <span className="s">&quot;concentrated&quot;</span>{" },\n"}
                {"  "}<span className="s">&quot;clusters&quot;</span>: [{"{ "}<span className="s">&quot;members&quot;</span>: [<span className="s">&quot;7xKX…gAsU&quot;</span>, …], <span className="s">&quot;pct&quot;</span>: <span className="n">7.48</span>{" }],\n"}
                {"  "}<span className="s">&quot;edges&quot;</span>: [{"{\n"}
                {"    "}<span className="s">&quot;type&quot;</span>: <span className="s">&quot;shared-funder&quot;</span>,{"\n"}
                {"    "}<span className="s">&quot;receipts&quot;</span>: [{"{ "}<span className="s">&quot;signature&quot;</span>: <span className="s">&quot;4hXq…Pz9e&quot;</span>, <span className="s">&quot;what&quot;</span>: <span className="s">&quot;…&quot;</span>{" }]\n"}
                {"  }],\n"}
                {"  "}<span className="k">…</span>{"\n"}
                {"}"}
              </pre>
            </figure>
          </div>
        </section>

        <section className="cta">
          <div className="wrap cta-in">
            <h2 className="h-display">Paste a CA.<br /><span className="grad">See through it.</span></h2>
            <div className="cta-search"><Search id="ca2" recent={false} /></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
