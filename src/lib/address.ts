import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519.js";

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isAddress(s: string): boolean {
  if (!B58.test(s)) return false;
  try {
    return bs58.decode(s).length === 32;
  } catch {
    return false;
  }
}

/**
 * A program-derived address has no private key and is never on the ed25519 curve.
 * Token accounts owned by a PDA belong to a program: a bonding curve, a pool vault, a locker.
 */
export function isOnCurve(s: string): boolean {
  try {
    ed25519.Point.fromBytes(bs58.decode(s));
    return true;
  } catch {
    return false;
  }
}

export const short = (a: string, n = 4) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);
