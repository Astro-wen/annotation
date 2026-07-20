import type { RubricDimension } from "@/mock/settings";
import type { ResultScore } from "@/mock/types";
import type { RubricWeights } from "@/store/rubricStore";

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Compute a ResultScore from raw per-dimension scores under a given rubric.
 *   SQS avg = average of the enabled SQS dimensions.
 *   UEF     = the single enabled UEF dimension value.
 *   UXS (North Star) = sqsAvg * sqsWeight + uef * uefWeight (weights normalized).
 */
export function computeResultScore(
  scores: Record<string, number>,
  rubric: RubricDimension[],
  weights: RubricWeights,
  reasons?: Record<string, string>,
  problemType?: ResultScore["problemType"],
): ResultScore {
  const enabled = rubric.filter((d) => d.enabled);
  const sqsDims = enabled.filter((d) => d.group === "SQS");
  const uefDims = enabled.filter((d) => d.group === "UEF");

  const sqsAvg = avg(sqsDims.map((d) => scores[d.key] ?? 0));
  const uefTotal = avg(uefDims.map((d) => scores[d.key] ?? 0));

  const wSum = weights.sqsWeight + weights.uefWeight || 1;
  const uxs = (sqsAvg * weights.sqsWeight + uefTotal * weights.uefWeight) / wSum;

  return { scores, reasons, problemType, sqsAvg, uefTotal, uxs };
}

/**
 * QC Accuracy over a set of finalized (QC-completed, non-Invalid) result pairs.
 *
 * Per PRD:
 *   QC Accuracy = Σ(per SQS-dim consistency rate × 65% ÷ 6) + UEF consistency rate × 35%
 *   consistency = the dimension score equals between baseline and current-effective
 *   result (reason text / display-only fields do not affect accuracy).
 *   Denominator = number of finalized results in this set.
 *   Empty set -> "—" (never 0%).
 */
export interface AccuracyPair {
  /** the six SQS dimension keys -> baseline score */
  baseline: Record<string, number>;
  /** the six SQS dimension keys -> current-effective score */
  current: Record<string, number>;
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

export function qcAccuracy(pairs: AccuracyPair[]): number | "—" {
  if (pairs.length === 0) return "—";
  const n = pairs.length;

  // per-dimension consistency rate = (#consistent) / n
  const sqsRates = SQS_DIM_KEYS.map((k) => {
    const consistent = pairs.filter((p) => (p.baseline[k] ?? null) === (p.current[k] ?? null)).length;
    return consistent / n;
  });
  const uefConsistent = pairs.filter(
    (p) => (p.baseline[UEF_DIM_KEY] ?? null) === (p.current[UEF_DIM_KEY] ?? null),
  ).length;
  const uefRate = uefConsistent / n;

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
