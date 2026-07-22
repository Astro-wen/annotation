import type { AccuracyPair } from "@/lib/scoring";
import { dimCounts, dimConsistent } from "@/lib/scoring";

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
 * Per-dimension consistency rate over a set of baseline/current pairs.
 * Skip-aware: a pair where either side Skipped this dimension is excluded from
 * the denominator (aligned with scoring.ts). Returns null when no comparable
 * sample exists (never a fake 0).
 */
export function dimConsistency(pairs: AccuracyPair[], key: string): number | null {
  const counted = pairs.filter((p) => dimCounts(p, key));
  if (counted.length === 0) return null;
  return counted.filter((p) => dimConsistent(p, key)).length / counted.length;
}

/** Format a 0..1 rate as a percentage string, or "" when null. */
export function formatRate(v: number | null): string {
  return v === null ? "" : `${(v * 100).toFixed(1)}%`;
}
