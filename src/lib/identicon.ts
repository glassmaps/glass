// The last-resort token picture: drawn from the mint itself, so it is always there and always the same.

const COLORS = ["#00d4ff", "#7b5cff", "#7cffb2", "#ffb547", "#ff6b5b", "#4da3ff", "#c6f36b", "#b98bff"];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function identiconSvg(mint: string, symbol = "") {
  const h = hash(mint || "glass");
  const a = COLORS[h % COLORS.length];
  const b = COLORS[(h >>> 8) % COLORS.length === h % COLORS.length ? (h + 3) % COLORS.length : (h >>> 8) % COLORS.length];
  const letter = esc((symbol.replace(/[^A-Za-z0-9]/g, "")[0] || mint[0] || "?").toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" fill="#151518"/><circle cx="26" cy="38" r="17" fill="url(#g)" opacity=".9"/><circle cx="40" cy="25" r="13" fill="url(#g)" opacity=".45"/><text x="32" y="41" text-anchor="middle" font-family="ui-monospace,monospace" font-size="22" font-weight="600" fill="#0a0a0b">${letter}</text></svg>`;
}

export const identiconUrl = (mint: string, symbol = "") => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(identiconSvg(mint, symbol))}`;
