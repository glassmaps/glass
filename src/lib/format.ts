const MINUS = "−";

export function fmtPct(v: number) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0%";
  if (v < 0.01) return "<0.01%";
  return `${v < 10 ? v.toFixed(2) : v.toFixed(1)}%`;
}

export function fmtUsd(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? MINUS : "";
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(a < 1 ? 4 : 0)}`;
}

export function fmtInt(v: number) {
  return Number.isFinite(v) ? Math.round(v).toLocaleString("en-US") : "—";
}

export function fmtAmount(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(v < 1 ? 4 : 0);
}

export function fmtSol(v: number) {
  return `${v < 0.01 ? v.toFixed(4) : v < 10 ? v.toFixed(3) : v.toFixed(1)} SOL`;
}

export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function utc(sec: number) {
  if (!sec) return "—";
  return new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
