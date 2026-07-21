// New scoring model (English metrics), PRD-aligned:
//   SQS = Service Quality Score  = average of 6 SQS dimensions
//   UEF = User Expectation Fulfillment = 1 independent user-view dimension
//   UXS = User Experience Score (North Star) = SQS * 0.65 + UEF * 0.35
//
// This file only holds the DEFAULT rubric. The editable, live rubric lives in
// src/store/rubricStore.ts (Settings edits it, Annotation reads from it).

import type { KnowledgeSource } from "@/mock/types";

export interface ReasonOption {
  score: number;
  text: string;
}

export type RubricGroup = "SQS" | "UEF";

export interface RubricDimension {
  /** stable id, used for snapshots and per-dimension display */
  key: string;
  dimension: string;
  group: RubricGroup;
  /** allowed scores, high -> low */
  options: number[];
  reasons: ReasonOption[];
  /** machine auto-scored dimension (annotator skips it, read-only value) */
  auto?: boolean;
  /** enabled/disabled via the Settings toggle */
  enabled: boolean;
  /** true for the seeded standard dimensions (cannot be removed, only disabled) */
  builtin: boolean;
}

export const defaultRubric: RubricDimension[] = [
  {
    key: "understanding_accuracy",
    dimension: "Understanding Accuracy",
    group: "SQS",
    options: [3, 2, 1, 0],
    enabled: true,
    builtin: true,
    reasons: [
      { score: 3, text: "No negative understanding signal. Every meaningful user query was correctly understood or effectively clarified." },
      { score: 2, text: "One negative understanding signal. The user intent was recovered after a minor misunderstanding." },
      { score: 1, text: "Two negative understanding signals. The conversation showed repeated misunderstanding before recovering." },
      { score: 0, text: "Three or more negative understanding signals, or the user problem was never correctly understood." },
    ],
  },
  {
    key: "execution_correctness",
    dimension: "Execution Correctness",
    group: "SQS",
    // Base options; the actual selectable scores depend on Knowledge Source
    // (Skill = 3/2/1/0, FAQ/SOP = 3/1/0). See executionOptions() below.
    options: [3, 2, 1, 0],
    enabled: true,
    builtin: true,
    reasons: [
      { score: 3, text: "Route, branch, action and reply are all correct and complete." },
      { score: 2, text: "Route / branch / action are correct, but reply detail has a minor gap." },
      { score: 1, text: "Route is correct, but branch or action judgement is wrong." },
      { score: 0, text: "Route is wrong and the session entered the wrong workflow." },
    ],
  },
  {
    key: "solution_adoption",
    dimension: "Solution Adoption",
    group: "SQS",
    options: [3, 1, 0],
    enabled: true,
    builtin: true,
    reasons: [
      { score: 3, text: "The resolution is fully achieved for the problem type: R1 accurate and complete, R2 correctly retrieved and fully presented, or R3 successfully executed and effective." },
      { score: 1, text: "The resolution is partially achieved: R1 mostly correct with gaps, R2 retrieved but incomplete, or R3 triggered but not fully effective." },
      { score: 0, text: "The resolution is not achieved: wrong answer, impossible promise, or answer does not solve the user problem." },
    ],
  },
  {
    key: "responsiveness",
    dimension: "Responsiveness",
    group: "SQS",
    options: [3, 0],
    auto: true,
    enabled: true,
    builtin: true,
    reasons: [
      { score: 3, text: "First response is within the latency threshold for this channel (Chatbot ≤10s / Human IM ≤120s / Ticket ≤24hr)." },
      { score: 0, text: "First response exceeded the latency threshold for this channel." },
    ],
  },
  {
    key: "service_efficiency",
    dimension: "Service Efficiency",
    group: "SQS",
    options: [3, 2, 1, 0],
    enabled: true,
    builtin: true,
    reasons: [
      { score: 3, text: "No negative behavior signal. The conversation progresses smoothly." },
      { score: 2, text: "One negative behavior signal, such as redundant confirmation or one unnecessary follow-up." },
      { score: 1, text: "Two negative behavior signals, such as repeated info requests or ineffective follow-ups." },
      { score: 0, text: "Three or more negative behavior signals, or a clear wheel-spinning dialogue." },
    ],
  },
  {
    key: "language_quality",
    dimension: "Language Quality",
    group: "SQS",
    options: [3, 2, 1, 0],
    enabled: true,
    builtin: true,
    reasons: [
      { score: 3, text: "No negative language signal. Natural wording, readable formatting and appropriate emotional response." },
      { score: 2, text: "One mild language signal, such as template feel or minor readability issue." },
      { score: 1, text: "One severe signal, or two or more mild language signals." },
      { score: 0, text: "Two or more severe signals, or three or more mild language signals." },
    ],
  },
  {
    key: "user_expectation_fulfillment",
    dimension: "User Expectation Fulfillment",
    group: "UEF",
    options: [3, 2, 1, 0],
    enabled: true,
    builtin: true,
    reasons: [
      { score: 3, text: "User expectation is fully met, with positive feedback or no negative user feedback signal." },
      { score: 2, text: "Expectation is not fully met, but a workable alternative is provided and there is no strong negative user feedback." },
      { score: 1, text: "Expectation is not met, or there is explicit negative user feedback." },
      { score: 0, text: "User expectation is completely unmet: the result is wrong or the problem is left entirely unresolved." },
    ],
  },
];

export const defaultWeights = {
  /** UXS = sqsAvg * sqsWeight + uef * uefWeight (weights normalized when applied) */
  sqsWeight: 0.65,
  uefWeight: 0.35,
};

/**
 * Configurable Skip Reasons (rubric-version scoped). When an annotator Skips a
 * SQS/UEF dimension, they must pick one of these reasons. Skip is a comparable
 * answer for Accuracy but is not any of the 3/2/1/0 numeric scores.
 */
export const defaultSkipReasons: string[] = [
  "Not applicable to this case",
  "Insufficient evidence to judge",
  "Blocked by upstream error / cannot evaluate",
  "Out of current rubric scope",
];

export const configVersion = {
  version: "v1",
  effectiveFrom: "Effective from 2026-07-01 14:30",
  scope: "6-dim SQS (65%) + UEF (35%) · User Experience Score (North Star)",
};

/**
 * Execution Correctness selectable scores depend on Knowledge Source:
 *   Skill    -> 3 / 2 / 1 / 0
 *   FAQ, SOP -> 3 / 1 / 0 (no "2" tier)
 */
export function executionOptions(source: KnowledgeSource): number[] {
  return source === "Skill" ? [3, 2, 1, 0] : [3, 1, 0];
}
