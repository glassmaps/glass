"use client";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="lost">
      <div>
        <h1 className="h2">Something broke on our side</h1>
        <p>The page failed to render. Reloading usually fixes it; the data on chain is unaffected.</p>
        {(error.digest || error.message) && <p className="micro err-ref">ref {error.digest || error.message.slice(0, 80)}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-acc" onClick={reset}>Reload</button>
          <Link className="btn btn-line" href="/">Home</Link>
        </div>
      </div>
    </main>
  );
}
