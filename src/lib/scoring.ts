import type { RubricDimension } from "@/mock/settings";
import type { ActorScore } from "@/mock/types";
import type { RubricWeights } from "@/store/rubricStore";

export const PASS_THRESHOLD = 2;

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Compute an ActorScore from raw per-dimension scores under the active rubric.
 * SQS = equal-weight average of enabled SQS dimensions.
 * UES = equal-weight average of enabled UES dimensions.
 * User Satisfaction (North Star) = normalized weighted blend of SQS and UES.
 */
export function computeActorScore(
  scores: Record<string, number>,
  rubric: RubricDimension[],
  weights: RubricWeights,
  reasons?: Record<string, string>,
): ActorScore {
  const enabled = rubric.filter((d) => d.enabled);

  const sqsDims = enabled.filter((d) => d.group === "SQS");
  const uesDims = enabled.filter((d) => d.group === "UES");

  const sqsTotal = avg(sqsDims.map((d) => scores[d.key] ?? 0));
  const uesTotal = avg(uesDims.map((d) => scores[d.key] ?? 0));

  const wSum = weights.sqsWeight + weights.uesWeight || 1;
  const userSatisfaction = (sqsTotal * weights.sqsWeight + uesTotal * weights.uesWeight) / wSum;

  return {
    scores,
    reasons,
    sqsTotal,
    sqsPass: sqsTotal >= PASS_THRESHOLD,
    uesTotal,
    uesPass: uesTotal >= PASS_THRESHOLD,
    userSatisfaction,
  };
}
