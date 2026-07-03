import type { ReviewFlow } from "./types";

// Blank starting point: no assignments, no review flows yet.
export const reviewFlows: ReviewFlow[] = [];

export function getReviewFlow(sessionId: string): ReviewFlow | undefined {
  return reviewFlows.find((r) => r.sessionId === sessionId);
}
