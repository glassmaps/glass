import Link from "next/link";
import { site } from "@/config/site";
import { short } from "@/lib/address";
import { Mark, Wordmark } from "./brand";
import { CopyButton } from "./copy";
import { GitHub, Tg, XLogo } from "./icons";
import { VenueIcon } from "./venues";

type At = "map" | "method" | "api" | "vs";

/** The contract address, front and centre: copy it, or open it on pump.fun. */
function Contract() {
  const mint = site.tokenMint;
  return (
    <div className={`ca${mint ? "" : " off"}`}>
      <span className="ca-dot" aria-hidden />
      <b>${site.ticker}</b>
      <span className="ca-addr num" title={mint || undefined}>
        {mint ? <><span className="full">{mint}</span><span className="cut">{short(mint, 5)}</span></> : "CA drops here at launch"}
      </span>
      {mint && <CopyButton value={mint} label={`Copy the $${site.ticker} contract address`} size={12} />}
      {mint ? (
        <a className="ca-pump" href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer" aria-label="Buy on pump.fun" title="Buy on pump.fun">
          <VenueIcon v="pump" size={16} />
        </a>
      ) : (
        <span className="ca-pump" aria-disabled title="pump.fun, at launch">
          <VenueIcon v="pump" size={16} />
        </span>
      )}
    </div>
  );
}

export function Header({ at }: { at?: At }) {
  return (
    <header className="head">
      <div className="wrap head-in">
        <div className="head-l">
          <Link href="/" className="brand" aria-label="Glass home">
            <Mark className="mk" />
            <Wordmark className="wm" />
          </Link>
          <nav className="nav" aria-label="Main">
            <Link href="/" aria-current={at === "map" ? "page" : undefined}>Map</Link>
            <Link href="/method" aria-current={at === "method" ? "page" : undefined}>Method</Link>
            <Link href="/#vs" aria-current={at === "vs" ? "page" : undefined}>vs Bubblemaps</Link>
            <Link href="/#api" aria-current={at === "api" ? "page" : undefined}>API</Link>
          </nav>
        </div>
        <div className="head-c">
          <Contract />
        </div>
        <div className="head-r">
          {site.github && (
            <a className="soc" href={site.github} target="_blank" rel="noreferrer" aria-label="Source code on GitHub">
              <GitHub size={15} /><span>GitHub</span>
            </a>
          )}
          {site.x && (
            <a className="soc" href={site.x} target="_blank" rel="noreferrer" aria-label="Glass on X">
              <XLogo size={13} /><span>X</span>
            </a>
          )}
          {site.telegram && (
            <a className="soc ico" href={site.telegram} target="_blank" rel="noreferrer" aria-label="Glass on Telegram">
              <Tg size={15} />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="foot">
      <div className="wrap foot-in">
        <div className="foot-brand">
          <Link href="/" className="brand" aria-label="Glass home">
            <Mark className="mk" />
            <Wordmark className="wm" />
          </Link>
          <p>The bubble map with receipts. Open source, MIT licensed.</p>
        </div>
        <nav className="foot-col" aria-label="Product">
          <span className="micro">Product</span>
          <Link href="/">Map a token</Link>
          <Link href="/method">Method</Link>
          <Link href="/#api">API</Link>
          <Link href="/#vs">vs Bubblemaps</Link>
        </nav>
        <nav className="foot-col" aria-label="Elsewhere">
          <span className="micro">Elsewhere</span>
          {site.github && <a href={site.github} target="_blank" rel="noreferrer">GitHub</a>}
          {site.x && <a href={site.x} target="_blank" rel="noreferrer">X</a>}
          {site.telegram && <a href={site.telegram} target="_blank" rel="noreferrer">Telegram</a>}
          {site.tokenMint && <a href={`https://pump.fun/coin/${site.tokenMint}`} target="_blank" rel="noreferrer">pump.fun</a>}
        </nav>
        <div className="foot-base micro">
          <span>Data, not verdicts</span>
          <span>© {year} Glass</span>
        </div>
      </div>
    </footer>
  );
}
