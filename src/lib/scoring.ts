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
 * Per spec §5.8 / 最新会议口径：
 *   QC Accuracy = Σ(per SQS-dim consistency rate × 65% ÷ 6) + UEF consistency rate × 35%
 *   一致性判定（逐维、逐样本）：
 *     - 两侧都是数字且相等 -> 一致
 *     - 任一侧选择 Skip     -> 该维「该样本」不进入分母（既不算对也不算错）
 *   Skip Reason / reason 文本 / 展示字段不影响 Accuracy。
 *   每个维度的分母 = 该维两侧都给了数字的样本数；分母为 0 时该维不计入。
 *   整个集合为空 -> "—"（不显示 0%）。
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

/** Whether this pair counts toward the given dimension's denominator (both sides numeric). */
export function dimCounts(p: AccuracyPair, key: string): boolean {
  const bSkip = p.baselineSkips?.has(key) ?? false;
  const cSkip = p.currentSkips?.has(key) ?? false;
  return !bSkip && !cSkip; // any-side Skip -> drop from denominator
}

/** Whether a single dimension is consistent (only meaningful when dimCounts is true). */
export function dimConsistent(p: AccuracyPair, key: string): boolean {
  if (!dimCounts(p, key)) return false;
  return (p.baseline[key] ?? null) === (p.current[key] ?? null);
}

/** Per-dimension consistency rate across pairs, Skip samples excluded from denominator. */
function dimRate(pairs: AccuracyPair[], key: string): number | null {
  const counted = pairs.filter((p) => dimCounts(p, key));
  if (counted.length === 0) return null; // no comparable sample for this dim
  return counted.filter((p) => dimConsistent(p, key)).length / counted.length;
}

export function qcAccuracy(pairs: AccuracyPair[]): number | "—" {
  if (pairs.length === 0) return "—";

  const sqsRates = SQS_DIM_KEYS.map((k) => dimRate(pairs, k));
  const uefRate = dimRate(pairs, UEF_DIM_KEY);

  // A dimension with no comparable sample (all Skipped) contributes nothing and
  // its weight is redistributed across the dimensions that do have samples.
  let weightSum = 0;
  let weighted = 0;
  sqsRates.forEach((r) => {
    if (r === null) return;
    weighted += r * (0.65 / 6);
    weightSum += 0.65 / 6;
  });
  if (uefRate !== null) {
    weighted += uefRate * 0.35;
    weightSum += 0.35;
  }
  if (weightSum === 0) return "—"; // every dimension Skipped on every sample
  return weighted / weightSum;
}

/** Format an accuracy value for display: number -> "xx.x%", "—" -> "—". */
export function formatAccuracy(v: number | "—"): string {
  if (v === "—") return "—";
  return `${(v * 100).toFixed(1)}%`;
}
