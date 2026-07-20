import type { AccuracyPair } from "@/lib/scoring";

/** Mock CSV download — generates a tiny CSV string and triggers a browser download. */
export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers, ...rows].map((r) => r.map(escape).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** The six SQS dimension keys (aligned with scoring.ts). */
export const SQS_DIM_KEYS = [
  "understanding_accuracy",
  "execution_correctness",
  "solution_adoption",
  "responsiveness",
  "service_efficiency",
  "language_quality",
] as const;

/** The single UEF dimension key (aligned with scoring.ts). */
export const UEF_DIM_KEY = "user_expectation_fulfillment";

/**
 * Raw per-dimension consistency rate over a set of baseline/current pairs.
 * consistency = the dimension score is identical between baseline and current.
 * Returns null for an empty set (never a fake 0).
 */
export function dimConsistency(pairs: AccuracyPair[], key: string): number | null {
  if (pairs.length === 0) return null;
  const consistent = pairs.filter(
    (p) => (p.baseline[key] ?? null) === (p.current[key] ?? null),
  ).length;
  return consistent / pairs.length;
}

/** Format a 0..1 rate as a percentage string, or "" when null. */
export function formatRate(v: number | null): string {
  return v === null ? "" : `${(v * 100).toFixed(1)}%`;
}
