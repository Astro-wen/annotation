import type { ReviewFlow, ReviewAnnotationResult } from "./types";
import { sessions } from "./sessions";
import { computeActorScore } from "@/lib/scoring";
import { defaultRubric, defaultWeights } from "./settings";

// ---------------------------------------------------------------------------
// Presentation seed.
//
// The platform normally boots from a blank slate (no assignments, no flows).
// For the walkthrough demo we pre-fill a couple of cases in TASK-20260623-001
// so the reviewer can immediately show the double-blind + reconcile + QC story
// without clicking through the whole assignment flow first.
//
// Accounts used (see src/lib/currentUser.ts):
//   vendor.a@partner.com  → A (第一评)
//   vendor.b@partner.com  → B (盲检第二评)
//   vendor.c@partner.com  → C (QC 复核)  ← seeded as C reviewer for the QC case
//   qa.lead@bytedance.com → reconciler / sampler (管理员 / QA)
// ---------------------------------------------------------------------------

const A_EMAIL = "vendor.a@partner.com";
const B_EMAIL = "vendor.b@partner.com";
const C_EMAIL = "vendor.c@partner.com";
const QA_EMAIL = "qa.lead@bytedance.com";

const RULE_VERSION = 1;

function result(scores: Record<string, number>): ReviewAnnotationResult {
  return {
    ruleVersion: RULE_VERSION,
    bot: computeActorScore(scores, defaultRubric, defaultWeights),
  };
}

// Pick the first N cases of the primary demo task as demo carriers.
const demoTaskCases = sessions.filter((s) => s.taskId === "TASK-20260623-001");
const caseDiff = demoTaskCases[0];
const caseAgreed = demoTaskCases[1];

const reviewFlows: ReviewFlow[] = [];

if (caseDiff) {
  // Case 1 — 盲检不一致，待拉齐 Diff。
  // A 和 B 各自独立评完，两人在两个维度上打分不同 → reconcileStatus: "Pending"。
  // 这条用来演示"第三步拉齐"：QA 把有分歧的维度过一遍、敲定统一答案回填。
  const aScores = {
    understanding_accuracy: 3,
    execution_correctness: 3,
    solution_adoption: 3,
    responsiveness: 3,
    service_efficiency: 3,
    language_quality: 3,
    service_outcome_expectation: 3,
  };
  const bScores = {
    understanding_accuracy: 2, // 分歧维度
    execution_correctness: 3,
    solution_adoption: 1, // 分歧维度
    responsiveness: 3,
    service_efficiency: 3,
    language_quality: 3,
    service_outcome_expectation: 2, // 分歧维度
  };

  reviewFlows.push({
    sessionId: caseDiff.sessionId,
    annotationMode: "Back-to-Back",
    currentState: "A Annotation",
    backToBackEnabled: true,
    bMode: "blind",
    aAssignee: A_EMAIL,
    aAnnotator: A_EMAIL,
    bAssignee: B_EMAIL,
    bAnnotator: B_EMAIL,
    aResult: result(aScores),
    bResult: result(bScores),
    aResultStatus: "Submitted",
    bResultStatus: "Submitted",
    reconcileStatus: "Pending",
  });

  // Reflect A's submitted result on the session row so the list/exports match.
  caseDiff.bot = result(aScores).bot;
  caseDiff.qaOwner = A_EMAIL;
  caseDiff.annotator = A_EMAIL;
  caseDiff.ruleVersion = RULE_VERSION;
  caseDiff.status = "Submitted";
  caseDiff.latestActivityLog = "B independent blind review submitted · waiting for reconcile";
}

if (caseAgreed) {
  // Case 2 — 盲检一致，已抽样进 QC，指派了 C。
  // 用来演示抽样指派与 C 复核这一段。
  const scores = {
    understanding_accuracy: 3,
    execution_correctness: 2,
    solution_adoption: 3,
    responsiveness: 3,
    service_efficiency: 2,
    language_quality: 3,
    service_outcome_expectation: 3,
  };

  reviewFlows.push({
    sessionId: caseAgreed.sessionId,
    annotationMode: "Back-to-Back",
    currentState: "Ready for C Sampling",
    backToBackEnabled: true,
    bMode: "blind",
    aAssignee: A_EMAIL,
    aAnnotator: A_EMAIL,
    bAssignee: B_EMAIL,
    bAnnotator: B_EMAIL,
    cReviewer: C_EMAIL,
    aResult: result(scores),
    bResult: result(scores),
    aResultStatus: "Submitted",
    bResultStatus: "Submitted",
    reconcileStatus: undefined,
    sampledForQC: true,
    sampleBatchLabel: "Sampling · 2026-06-23",
  });

  caseAgreed.bot = result(scores).bot;
  caseAgreed.qaOwner = A_EMAIL;
  caseAgreed.annotator = A_EMAIL;
  caseAgreed.ruleVersion = RULE_VERSION;
  caseAgreed.status = "Waiting for QC";
  caseAgreed.latestActivityLog = `Sampled into QC by ${QA_EMAIL} · assigned to ${C_EMAIL}`;
}

export { reviewFlows };
