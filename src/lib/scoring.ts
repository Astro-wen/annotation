import type { RubricDimension } from "@/mock/settings";
import type { ResultScore } from "@/mock/types";
import type { RubricWeights } from "@/store/rubricStore";

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Compute a ResultScore from raw per-dimension scores under a given rubric.
 *   SQS avg = average of the numeric SQS dimensions (Skipped dims excluded).
 *   UEF     = the UEF dimension value (0 when Skipped).
 *   UXS (North Star) = sqsAvg * sqsWeight + uef * uefWeight (weights normalized).
 * Skip does not change the business-score formula; a Skipped SQS dim simply
 * drops out of the average, and a Skipped UEF contributes 0.
 */
export function computeResultScore(
  scores: Record<string, number>,
  rubric: RubricDimension[],
  weights: RubricWeights,
  reasons?: Record<string, string>,
  problemType?: ResultScore["problemType"],
  skips?: Record<string, string>,
): ResultScore {
  const enabled = rubric.filter((d) => d.enabled);
  const skipSet = new Set(Object.keys(skips ?? {}));
  const sqsDims = enabled.filter((d) => d.group === "SQS" && !skipSet.has(d.key));
  const uefDims = enabled.filter((d) => d.group === "UEF" && !skipSet.has(d.key));

  const sqsAvg = avg(sqsDims.map((d) => scores[d.key] ?? 0));
  const uefTotal = avg(uefDims.map((d) => scores[d.key] ?? 0));

  const wSum = weights.sqsWeight + weights.uefWeight || 1;
  const uxs = (sqsAvg * weights.sqsWeight + uefTotal * weights.uefWeight) / wSum;

  return { scores, reasons, skips, problemType, sqsAvg, uefTotal, uxs };
}

/**
 * QC Accuracy over a set of finalized (QC-completed, non-Invalid) result pairs.
 *
 * Per PRD:
 *   QC Accuracy = Σ(per SQS-dim consistency rate × 65% ÷ 6) + UEF consistency rate × 35%
 *   Consistency per dimension:
 *     - both numeric & equal -> consistent
 *     - both Skip            -> consistent
 *     - one Skip, one numeric-> inconsistent
 *   Skip Reason / reason text / display-only fields do not affect Accuracy.
 *   Denominator = number of finalized results in this set.
 *   Empty set -> "—" (never 0%).
 */
export interface AccuracyPair {
  /** SQS+UEF dimension keys -> baseline numeric score (absent if skipped) */
  baseline: Record<string, number>;
  /** SQS+UEF dimension keys -> current numeric score (absent if skipped) */
  current: Record<string, number>;
  /** which dims were Skipped in the baseline */
  baselineSkips?: Set<string>;
  /** which dims were Skipped in the current-effective result */
  currentSkips?: Set<string>;
}

const SQS_DIM_KEYS = [
  "understanding_accuracy",
  "execution_correctness",
  "solution_adoption",
  "responsiveness",
  "service_efficiency",
  "language_quality",
] as const;

const UEF_DIM_KEY = "user_expectation_fulfillment";

/** Whether a single dimension is consistent between baseline and current. */
export function dimConsistent(p: AccuracyPair, key: string): boolean {
  const bSkip = p.baselineSkips?.has(key) ?? false;
  const cSkip = p.currentSkips?.has(key) ?? false;
  if (bSkip || cSkip) return bSkip && cSkip; // both skip = consistent; one skip = not
  return (p.baseline[key] ?? null) === (p.current[key] ?? null);
}

export function qcAccuracy(pairs: AccuracyPair[]): number | "—" {
  if (pairs.length === 0) return "—";
  const n = pairs.length;

  const sqsRates = SQS_DIM_KEYS.map((k) => pairs.filter((p) => dimConsistent(p, k)).length / n);
  const uefRate = pairs.filter((p) => dimConsistent(p, UEF_DIM_KEY)).length / n;

  // Use the exact 65% ÷ 6 per SQS dim to avoid rounding to 64.98%.
  const sqsPart = sqsRates.reduce((sum, r) => sum + (r * 0.65) / 6, 0);
  const uefPart = uefRate * 0.35;
  return sqsPart + uefPart;
}

/** Format an accuracy value for display: number -> "xx.x%", "—" -> "—". */
export function formatAccuracy(v: number | "—"): string {
  if (v === "—") return "—";
  return `${(v * 100).toFixed(1)}%`;
}
