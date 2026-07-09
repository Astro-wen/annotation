import type { ReviewFlow, ReviewAnnotationResult, ActorScore } from "./types";
import { sessions } from "./sessions";
import { computeActorScore } from "@/lib/scoring";
import { defaultRubric, defaultWeights } from "./settings";

// ---------------------------------------------------------------------------
// Presentation seed.
//
// The platform normally boots from a blank slate (no assignments, no flows).
// For the walkthrough demo we pre-fill representative cases so the reviewer can
// tell the whole story without clicking through assignment first. Scenarios are
// split across DIFFERENT case sets (tasks) so each set stays single-themed:
//
//   TASK-20260623-001 (Sample A) · 双人评主线
//     1) 盲检不一致 · 待拉齐 Diff（Pending reconcile）
//     2) 盲检一致 · 已抽样进 QC（指派了 C，待复核）
//     3) 盲检一致 · 无分歧（未抽样，Ready for C Sampling）
//   TASK-20260623-002 (Sample B) · 单人评
//     4) 单人评普通 case（A 已提交，无 B / 拉齐 / QC）
//   TASK-20260623-003 (Sample C) · QC 定案
//     5) C 已复核 · Final Result Ready（含 overwrite 维度）
//
// Accounts used (see src/lib/currentUser.ts):
//   vendor.a@partner.com  → A (第一评 / 单人评)
//   vendor.b@partner.com  → B (盲检第二评)
//   vendor.c@partner.com  → C (QC 复核)
//   qa.lead@bytedance.com → reconciler / sampler (管理员 / QA)
// ---------------------------------------------------------------------------

const A_EMAIL = "vendor.a@partner.com";
const B_EMAIL = "vendor.b@partner.com";
const C_EMAIL = "vendor.c@partner.com";
const QA_EMAIL = "qa.lead@bytedance.com";

const RULE_VERSION = 1;

function score(scores: Record<string, number>): ActorScore {
  return computeActorScore(scores, defaultRubric, defaultWeights);
}

function result(scores: Record<string, number>): ReviewAnnotationResult {
  return { ruleVersion: RULE_VERSION, bot: score(scores) };
}

/** Nth (0-based) case of a given task, used as a demo carrier. */
function caseOf(taskId: string, index: number) {
  return sessions.filter((s) => s.taskId === taskId)[index];
}

const reviewFlows: ReviewFlow[] = [];

// ---------------------------------------------------------------------------
// TASK-001 · 双人评主线
// ---------------------------------------------------------------------------

// 1) 盲检不一致 · 待拉齐 Diff。
const caseDiff = caseOf("TASK-20260623-001", 0);
if (caseDiff) {
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
  caseDiff.bot = score(aScores);
  caseDiff.qaOwner = A_EMAIL;
  caseDiff.annotator = A_EMAIL;
  caseDiff.ruleVersion = RULE_VERSION;
  caseDiff.status = "Submitted";
  caseDiff.latestActivityLog = "B independent blind review submitted · waiting for reconcile";
}

// 2) 盲检一致 · 已抽样进 QC，指派了 C（待复核）。
const caseSampled = caseOf("TASK-20260623-001", 1);
if (caseSampled) {
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
    sessionId: caseSampled.sessionId,
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
    sampledForQC: true,
    sampleBatchLabel: "Sampling · 2026-06-23",
  });
  caseSampled.bot = score(scores);
  caseSampled.qaOwner = A_EMAIL;
  caseSampled.annotator = A_EMAIL;
  caseSampled.ruleVersion = RULE_VERSION;
  caseSampled.status = "Waiting for QC";
  caseSampled.latestActivityLog = `Sampled into QC by ${QA_EMAIL} · assigned to ${C_EMAIL}`;
}

// 3) 盲检一致 · 无分歧（未抽样），作为"直接通过、无需拉齐"的对照。
const caseAgreed = caseOf("TASK-20260623-001", 2);
if (caseAgreed) {
  const scores = {
    understanding_accuracy: 3,
    execution_correctness: 3,
    solution_adoption: 3,
    responsiveness: 3,
    service_efficiency: 3,
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
    aResult: result(scores),
    bResult: result(scores),
    aResultStatus: "Submitted",
    bResultStatus: "Submitted",
  });
  caseAgreed.bot = score(scores);
  caseAgreed.qaOwner = A_EMAIL;
  caseAgreed.annotator = A_EMAIL;
  caseAgreed.ruleVersion = RULE_VERSION;
  caseAgreed.status = "Back-to-Back Completed";
  caseAgreed.latestActivityLog = "A/B agreed · no diff · ready for sampling";
}

// ---------------------------------------------------------------------------
// TASK-002 · 单人评（normal 普通例子）
// ---------------------------------------------------------------------------

// 4) 单人评普通 case：只有 A，评完提交，没有 B / 拉齐 / QC。
const caseSingle = caseOf("TASK-20260623-002", 0);
if (caseSingle) {
  const scores = {
    understanding_accuracy: 3,
    execution_correctness: 3,
    solution_adoption: 3,
    responsiveness: 3,
    service_efficiency: 2,
    language_quality: 3,
    service_outcome_expectation: 3,
  };
  reviewFlows.push({
    sessionId: caseSingle.sessionId,
    annotationMode: "Single Annotation",
    currentState: "Ready for C Sampling",
    backToBackEnabled: false,
    aAssignee: A_EMAIL,
    aAnnotator: A_EMAIL,
    aResult: result(scores),
    aResultStatus: "Submitted",
  });
  caseSingle.bot = score(scores);
  caseSingle.qaOwner = A_EMAIL;
  caseSingle.annotator = A_EMAIL;
  caseSingle.ruleVersion = RULE_VERSION;
  caseSingle.status = "Submitted (No QC)";
  caseSingle.latestActivityLog = `A single review submitted by ${A_EMAIL}`;
}

// ---------------------------------------------------------------------------
// TASK-003 · QC 定案
// ---------------------------------------------------------------------------

// 5) C 已复核 · Final Result Ready。C 相对 A/B baseline 改了 1 个维度。
const caseFinal = caseOf("TASK-20260623-003", 0);
if (caseFinal) {
  const abScores = {
    understanding_accuracy: 3,
    execution_correctness: 3,
    solution_adoption: 3,
    responsiveness: 3,
    service_efficiency: 3,
    language_quality: 3,
    service_outcome_expectation: 3,
  };
  const cScores = {
    ...abScores,
    execution_correctness: 2, // C 复核时下调的维度
  };
  reviewFlows.push({
    sessionId: caseFinal.sessionId,
    annotationMode: "Back-to-Back",
    currentState: "Final Result Ready",
    backToBackEnabled: true,
    bMode: "blind",
    aAssignee: A_EMAIL,
    aAnnotator: A_EMAIL,
    bAssignee: B_EMAIL,
    bAnnotator: B_EMAIL,
    cReviewer: C_EMAIL,
    aResult: result(abScores),
    bResult: result(abScores),
    cResult: result(cScores),
    aResultStatus: "Submitted",
    bResultStatus: "Submitted",
    cResultStatus: "Submitted",
    sampledForQC: true,
    sampleBatchLabel: "Sampling · 2026-06-23",
    finalResultStatus: "Ready",
    overwrittenDims: ["execution_correctness"],
  });
  caseFinal.bot = score(cScores);
  caseFinal.qaOwner = A_EMAIL;
  caseFinal.annotator = A_EMAIL;
  caseFinal.ruleVersion = RULE_VERSION;
  caseFinal.status = "Final Result Ready";
  caseFinal.latestActivityLog = `C overwrite (final) by ${C_EMAIL} · 1 dim changed`;
}

export { reviewFlows };
