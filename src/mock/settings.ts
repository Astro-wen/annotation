// New scoring model (English metrics):
//   SQS = Service Quality Score  = average of 6 dimensions
//   UES = User Experience Score = 1 dimension (Service Outcome Expectation)
//   User Satisfaction (North Star) = W_SQS * SQS + W_UES * UES  (equal weights by default)
//
// This file only holds the DEFAULT rubric. The editable, live rubric lives in
// src/store/rubricStore.ts (Settings edits it, Annotation reads from it).

export interface ReasonOption {
  score: number;
  text: string;
}

export type RubricGroup = "SQS" | "UES";

export interface RubricDimension {
  /** stable id, used for gating references and snapshots */
  key: string;
  dimension: string;
  group: RubricGroup;
  /** allowed scores, high -> low */
  options: number[];
  reasons: ReasonOption[];
  /** machine auto-scored dimension (annotator skips it) */
  auto?: boolean;
  /** enabled/disabled via the Settings slider toggle */
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
    key: "service_outcome_expectation",
    dimension: "Service Outcome Expectation",
    group: "UES",
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
  /** North Star = sqs * sqsWeight + ues * uesWeight (weights normalized when applied) */
  sqsWeight: 0.5,
  uesWeight: 0.5,
};

export const configVersion = {
  version: "v1",
  effectiveFrom: "Effective from 2026-07-01 14:30",
  scope: "6-dim SQS + 1-dim UES · weighted User Satisfaction (North Star)",
};
