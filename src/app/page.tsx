import Link from "next/link";
import { Footer, Header } from "@/components/chrome";
import { LivePanel } from "@/components/live";
import { Search } from "@/components/search";
import { CopyButton } from "@/components/copy";
import { limits, rules, site } from "@/config/site";

const hrs = rules.freshWindowSec / 3600;

export default function Home() {
  const curl = `curl ${site.url}/api/v1/map/<mint>`;
  return (
    <>
      <Header at="map" />
      <main>
        <div className="wrap hero">
          <div className="hero-copy">
            <h1 className="h-display">
              See through
              <br />
              every bag.
            </h1>
            <p className="hero-sub">
              Paste a token. Every bubble is a holder, every line is a transaction you can open. No verdicts, only receipts.
            </p>
            <Search />
          </div>
          <LivePanel />
        </div>

        <section className="sec">
          <div className="wrap">
            <div className="sec-head">
              <h2 className="h2">How a line gets drawn</h2>
              <p className="lede">
                Two wallets are joined only by something that happened on chain. Each line on the map opens the transaction that put it there,
                so you can check it on Solscan instead of trusting us.
              </p>
            </div>
            <table className="rules">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Rule</th>
                  <th>What counts</th>
                  <th className="hide-s">Receipt</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>01</td>
                  <td className="rule"><i className="swatch" />Funded</td>
                  <td>One top holder sent another its very first SOL. Same if the deployer did.</td>
                  <td className="rcpt hide-s">the funding transfer</td>
                </tr>
                <tr>
                  <td>02</td>
                  <td className="rule"><i className="swatch" />Same funder</td>
                  <td>{rules.sharedFunderMin} or more holders got their first SOL from one wallet nobody can name. Exchanges, bridges and known protocols fund strangers every day and never count.</td>
                  <td className="rcpt hide-s">each holder&apos;s funding transfer</td>
                </tr>
                <tr>
                  <td>03</td>
                  <td className="rule"><i className="swatch dash" />Token transfer</td>
                  <td>A holder&apos;s first tokens came straight from another holder&apos;s wallet, not from a pool or curve.</td>
                  <td className="rcpt hide-s">the transfer</td>
                </tr>
                <tr>
                  <td>04</td>
                  <td className="rule"><i className="swatch ring" />Bought together</td>
                  <td>
                    {rules.cohortMinSize} or more first buys within {rules.cohortSlotWindow + 1} slots. Rated by what else they share: one fee payer, SOL size within{" "}
                    {Math.round(rules.cohortSizeSpread * 100)}%, the same Jito tip, wallets funded under {hrs}h before buying. This is the pattern bundlers hide, and it never needs a transfer between them.
                  </td>
                  <td className="rcpt hide-s">every first buy</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="sec">
          <div className="wrap">
            <div className="sec-head">
              <h2 className="h2">What Glass never does</h2>
              <p className="lede">A map is only worth something while nobody can lean on it.</p>
            </div>
            <div className="never">
              <div>
                <h3>Name a person</h3>
                <p>No callout threads, no investigations of people. The map shows wallets and transactions. What they mean is yours to judge.</p>
              </div>
              <div>
                <h3>Relabel quietly</h3>
                <p>A label says who set it. A project labels its own wallets in public, next to the receipts, and cannot hide a link by renaming it.</p>
              </div>
              <div>
                <h3>Keep the rules secret</h3>
                <p>
                  Every threshold is on the <Link href="/method" style={{ color: "var(--ink)", borderBottom: "1px solid var(--line-2)" }}>method page</Link>
                  {site.github ? <> and in the open source code</> : null}. Change one and the method version changes with it.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="api">
          <div className="wrap api">
            <div>
              <h2 className="h2">Same data, open API</h2>
              <p className="lede" style={{ marginTop: 18 }}>
                One read endpoint, open CORS, no key. It returns what the page draws: holders with their funding and first buy, every link with
                its receipts, clusters, cohorts and the score.
              </p>
              <p className="lede">
                Maps are cached for {limits.scanTtl}s. A fresh scan reads the chain and is limited to {limits.freshScansPerIpHour} per hour per IP.
              </p>
            </div>
            <figure className="code">
              <div className="code-top">
                <span className="micro">GET /api/v1/map/:mint · example response</span>
                <CopyButton value={curl} label="Copy the command" />
              </div>
              <pre>
                <span className="k">$</span> {curl}
                {"\n\n"}
                {"{\n"}
                {"  "}<span className="s">&quot;token&quot;</span>: {"{ "}<span className="s">&quot;symbol&quot;</span>: <span className="s">&quot;GLASS&quot;</span>, <span className="s">&quot;supply&quot;</span>: <span className="n">999842117</span>{" },\n"}
                {"  "}<span className="s">&quot;holdersTotal&quot;</span>: <span className="n">1873</span>,{"\n"}
                {"  "}<span className="s">&quot;score&quot;</span>: {"{ "}<span className="s">&quot;total&quot;</span>: <span className="n">82</span>, <span className="s">&quot;band&quot;</span>: <span className="s">&quot;clear&quot;</span>{" },\n"}
                {"  "}<span className="s">&quot;clusters&quot;</span>: [{"{ "}<span className="s">&quot;members&quot;</span>: [<span className="s">&quot;7xKX…gAsU&quot;</span>, …], <span className="s">&quot;pct&quot;</span>: <span className="n">4.18</span>{" }],\n"}
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
      </main>
      <Footer />
    </>
  );
}
