"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search as SearchIcon } from "./icons";

const B58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

/** Accepts a bare address or anything that contains one: a pump.fun, DexScreener, Solscan or GMGN link. */
export function pickAddress(raw: string) {
  const m = raw.trim().match(B58);
  return m ? m[0] : null;
}

interface Recent {
  mint: string;
  symbol: string;
  name: string;
  image: string | null;
  score: number;
}

export function Search({ autoFocus, id = "ca", recent: showRecent = true }: { autoFocus?: boolean; id?: string; recent?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const [recent, setRecent] = useState<Recent[] | null>(null);

  useEffect(() => {
    if (!showRecent) return;
    let live = true;
    fetch("/api/recent")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => live && setRecent(j.items || []))
      .catch(() => live && setRecent([]));
    return () => {
      live = false;
    };
  }, [showRecent]);

  const go = (raw: string) => {
    const a = pickAddress(raw);
    if (!a) {
      setErr("That does not contain a Solana address. Paste the token's contract address or a pump.fun / DexScreener link.");
      return;
    }
    setErr("");
    router.push(`/t/${a}`);
  };

  return (
    <div>
      <form
        className="search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(v);
        }}
      >
        <SearchIcon size={18} />
        <label className="sr" htmlFor={id}>Token address</label>
        <input
          id={id}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder="Paste a CA or a pump.fun link"
          value={v}
          onChange={(e) => {
            setV(e.target.value);
            if (err) setErr("");
          }}
          onPaste={(e) => {
            const a = pickAddress(e.clipboardData.getData("text"));
            if (a) {
              e.preventDefault();
              setV(a);
              go(a);
            }
          }}
        />
        <button className="btn btn-acc" type="submit" disabled={!v.trim()}>Map it</button>
      </form>
      {err && <p className="search-err" role="alert">{err}</p>}
      {showRecent && <div className="tries">
        {recent && recent.length > 0 && <span className="micro">Mapped recently</span>}
        {recent?.slice(0, 6).map((r) => (
          <a key={r.mint} className="chip" href={`/t/${r.mint}`}>
            {r.image ? <img src={r.image} alt="" width={18} height={18} loading="lazy" /> : <span className="tok-blank" />}
            <span>${r.symbol || r.mint.slice(0, 4)}</span>
            <span className="sc num">{r.score}</span>
          </a>
        ))}
      </div>}
    </div>
  );
}
