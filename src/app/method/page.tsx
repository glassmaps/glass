import type { Metadata } from "next";
import { Footer, Header } from "@/components/chrome";
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

export default function Method() {
  return (
    <>
      <Header at="method" />
      <main className="wrap doc">
        <nav className="doc-nav" aria-label="On this page">
          <span className="micro" style={{ marginBottom: 10 }}>Method {METHOD_VERSION}</span>
          <a href="#read">What we read</a>
          <a href="#links">Links</a>
          <a href="#cohorts">Cohorts</a>
          <a href="#labels">Labels</a>
          <a href="#score">Score</a>
          <a href="#limits">Limits</a>
          <a href="#source">Source</a>
        </nav>
        <article className="doc-body">
          <h1 className="h-display" style={{ fontSize: "clamp(36px, 5vw, 64px)" }}>The method</h1>
          <p>
            This page is generated from the same constants the scanner runs on. If a number here changes, the method version changes with it, and old
            maps are not mixed with new ones.
          </p>

          <h2 id="read">What we read</h2>
          <p>For any Solana token, from the chain, through Helius:</p>
          <ul>
            <li>Every token account of the mint (<code>getTokenAccounts</code>), summed per owner. Up to {(limits.holderPages * 1000).toLocaleString("en-US")} accounts per scan; beyond that the holder count is marked as a lower bound. The top {limits.holders} owners are mapped.</li>
            <li>Owners that are program-derived addresses (no private key, off the ed25519 curve) are bonding curves, pool vaults or lockers. They are drawn as dashed rings and never linked or scored.</li>
            <li>For each wallet: the first SOL it ever received (<code>/v1/wallet/:address/funded-by</code>) and the first transaction in which it received this token (<code>getTransactionsForAddress</code>, oldest first, filtered to this mint).</li>
            <li>The deployer: the fee payer of the mint&apos;s first transaction.</li>
          </ul>

          <h2 id="links">Links</h2>
          <p>A line between two bubbles has exactly one of three causes. Each carries the transaction signature that proves it.</p>
          <table className="doc-tbl">
            <thead><tr><th>Link</th><th>Rule</th></tr></thead>
            <tbody>
              <tr><td>Funded</td><td>A top holder (or the deployer) sent another top holder its first SOL.</td></tr>
              <tr><td>Same funder</td><td>{rules.sharedFunderMin}+ top holders share the wallet that sent their first SOL, and that wallet has no known name or type. Exchanges, bridges and protocols are excluded because they fund unrelated people all day.</td></tr>
              <tr><td>Token transfer</td><td>A holder&apos;s first tokens came out of another holder&apos;s wallet (not a pool, curve or other program) in the same transaction.</td></tr>
            </tbody>
          </table>
          <p>Linked wallets form a cluster. A cluster that contains the deployer, or a wallet the deployer funded, is marked as the deployer&apos;s.</p>

          <h2 id="cohorts">Cohorts</h2>
          <p>
            Bundlers spread SOL through fresh wallets so no transfer ever joins them. What they cannot hide is timing and habit. A cohort is {rules.cohortMinSize} or more
            wallets whose first buys land within {rules.cohortSlotWindow + 1} slots of each other. It is then rated by what else they share:
          </p>
          <table className="doc-tbl">
            <thead><tr><th>Signal</th><th>Threshold</th></tr></thead>
            <tbody>
              <tr><td>One fee payer</td><td>One wallet paid the fee for 2+ of the buys. Alone this makes a cohort high confidence.</td></tr>
              <tr><td>Same size</td><td>SOL spent spreads less than {Math.round(rules.cohortSizeSpread * 100)}% of the median.</td></tr>
              <tr><td>Same Jito tip</td><td>Half or more paid an identical tip to a Jito tip account.</td></tr>
              <tr><td>Fresh wallets</td><td>Half or more were funded less than {rules.freshWindowSec / 3600}h before their first buy.</td></tr>
            </tbody>
          </table>
          <p>Confidence is high with a shared fee payer or two signals, medium with one, low with timing alone. Low cohorts are shown but never scored.</p>

          <h2 id="labels">Labels</h2>
          <ul>
            <li><b>Known entity</b>: names from Helius&apos; identity database (exchanges, protocols, market makers). Exchange wallets never join a cluster.</li>
            <li><b>Labeled by the project</b>: only on $GLASS itself, where we label our own team, marketing and fee wallets. Shown with who set it.</li>
            <li><b>Rule</b>: Deployer, Burned, Program account. Derived, never typed by hand.</li>
          </ul>

          <h2 id="score">Score</h2>
          <p>Starts at 100 and loses points for each signal below. Each signal is a share of total supply. The caps add up to 100.</p>
          <div className="formula">penalty = min(max, max(0, share − free) × weight)</div>
          <table className="doc-tbl">
            <thead><tr><th>Signal</th><th className="r">Free</th><th className="r">Weight</th><th className="r">Max</th></tr></thead>
            <tbody>
              {SCORE_RULES.map((r) => (
                <tr key={r.key}><td>{r.label}</td><td className="r">{r.free}%</td><td className="r">×{r.weight}</td><td className="r">{r.max}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="doc-tbl">
            <thead><tr><th>Band</th><th className="r">From</th></tr></thead>
            <tbody>
              {BANDS.map((b) => <tr key={b.band}><td>{b.label}</td><td className="r">{b.min}</td></tr>)}
            </tbody>
          </table>
          <p>The score describes the holder list. It does not say a token is good or bad, and it does not accuse anyone.</p>

          <h2 id="limits">Limits</h2>
          <ul>
            <li>Only the top {limits.holders} holders are drawn and scored.</li>
            <li>Funding is the first SOL a wallet received. A wallet funded through an exchange, then used by a bundler, does not link by funding; it can still land in a cohort.</li>
            <li>Two-hop funding (A funds B, B funds C) is not followed yet.</li>
            <li>A cohort is evidence of coordinated timing, not proof of one owner. Bots chasing the same launch can look alike.</li>
            <li>Finished maps are cached for {limits.scanTtl}s. Rescan reads everything again.</li>
          </ul>

          <h2 id="source">Source</h2>
          <p>
            Glass is open source under the MIT license. The rules on this page live in <Src file="src/lib/graph.ts">src/lib/graph.ts</Src>, the thresholds in{" "}
            <Src file="src/config/site.ts">src/config/site.ts</Src>, and every chain read in <Src file="src/lib/helius.ts">src/lib/helius.ts</Src>. The tests that pin each rule
            are in <Src file="test/graph.test.ts">test/graph.test.ts</Src>.
          </p>
        </article>
      </main>
      <Footer />
    </>
  );
}
