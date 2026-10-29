import type { MapResult, Stage } from "./types";

export type Line =
  | { kind: "result"; map: MapResult }
  | { kind: "partial"; map: MapResult }
  | { kind: "error"; error: { code: string; message: string } }
  | { kind: "stage"; stage: Stage }
  | { kind: "skip" };

/** One NDJSON line of a scan. Progress lines carry a numeric `done`; only `result` is the finished map. */
export function readLine(raw: string): Line {
  if (!raw.trim()) return { kind: "skip" };
  const m = JSON.parse(raw) as Record<string, unknown>;
  if (m.result && typeof m.result === "object" && Array.isArray((m.result as MapResult).nodes)) return { kind: "result", map: m.result as MapResult };
  if (m.partial && typeof m.partial === "object" && Array.isArray((m.partial as MapResult).nodes)) return { kind: "partial", map: m.partial as MapResult };
  if (m.error && typeof m.error === "object") return { kind: "error", error: m.error as { code: string; message: string } };
  if (typeof m.stage === "string") return { kind: "stage", stage: m as unknown as Stage };
  return { kind: "skip" };
}
