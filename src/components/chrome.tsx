import Link from "next/link";
import { site } from "@/config/site";
import { short } from "@/lib/address";
import { Mark, Wordmark } from "./brand";
import { CopyButton } from "./copy";
import { GitHub, Tg, XLogo } from "./icons";

export function Header({ at }: { at?: "map" | "method" | "api" }) {
  return (
    <header className="head">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Glass home">
          <Mark className="mk" />
          <Wordmark className="wm" />
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/" aria-current={at === "map" ? "page" : undefined}>Map</Link>
          <Link href="/method" aria-current={at === "method" ? "page" : undefined}>Method</Link>
          <Link href="/#api" aria-current={at === "api" ? "page" : undefined}>API</Link>
          {site.github && <a href={site.github} target="_blank" rel="noreferrer">Source</a>}
        </nav>
        <div className="head-end">
          {site.x && <a className="icon-btn" href={site.x} target="_blank" rel="noreferrer" aria-label="Glass on X"><XLogo /></a>}
          {site.telegram && <a className="icon-btn" href={site.telegram} target="_blank" rel="noreferrer" aria-label="Glass on Telegram"><Tg /></a>}
          {site.github && <a className="icon-btn" href={site.github} target="_blank" rel="noreferrer" aria-label="Source code on GitHub"><GitHub /></a>}
          {site.tokenMint ? (
            <span className="ca">
              <b>${site.ticker}</b>
              <span className="full">{short(site.tokenMint, 4)}</span>
              <CopyButton value={site.tokenMint} label={`Copy the $${site.ticker} address`} size={12} />
            </span>
          ) : (
            <span className="ca off" title="The contract address appears here at launch">
              <b>${site.ticker}</b>
              <span className="full">not live</span>
            </span>
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
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Glass home">
          <Mark className="mk" />
          <Wordmark className="wm" />
        </Link>
        <span className="micro">Data, not verdicts · MIT licensed · {year}</span>
        <div className="foot-links micro">
          <Link href="/method">Method</Link>
          <Link href="/#api">API</Link>
          {site.github && <a href={site.github} target="_blank" rel="noreferrer">Source</a>}
          {site.x && <a href={site.x} target="_blank" rel="noreferrer">X</a>}
          {site.telegram && <a href={site.telegram} target="_blank" rel="noreferrer">Telegram</a>}
        </div>
      </div>
    </footer>
  );
}
