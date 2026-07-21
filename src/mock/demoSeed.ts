// Pre-seeded "Demo Sample" task so every PRD scenario is immediately
// screenshottable without manually walking the whole flow.
//
// Covers: Normal & Back-to-Back modes; Unassigned / Assigned / Submitted /
// 待拉齐(Diff) / Waiting for QC / QC Completed / Invalid; Skip (both agree &
// disagree); multi-result Type 2 (Chatbot + Ticketbot); and finished-QC cases
// with computable per-annotator accuracy.

import type {
  CaseRow,
  CaseType,
  ExpectedResult,
  ProblemType,
  ResultScore,
  ServiceSubtype,
} from "@/mock/types";
import type { CaseFlow, RoundResult } from "@/store/sessionStore";
import type { ActivityEntry } from "@/mock/types";
import { defaultWeights } from "@/mock/settings";

export const DEMO_TASK_ID = "TASK-DEMO-001";
export const DEMO_TASK_NAME = "Demo Sample · Normal 全场景";
export const DEMO_B2B_TASK_ID = "TASK-DEMO-002";
export const DEMO_B2B_TASK_NAME = "Demo Sample · Back-to-Back 全场景";

// Demo annotator identities (from currentUser USER_OPTIONS).
export const DEMO = {
  aaron: "editor.aaron@bytedance.com",
  usagi: "editor.usagi@bytedance.com",
  hachi: "editor.hachi@bytedance.com",
  chiikawa: "editor.chiikawa@bytedance.com",
  admin: "admin.lead@bytedance.com",
};

const SQS_KEYS = [
  "understanding_accuracy",
  "execution_correctness",
  "solution_adoption",
  "responsiveness",
  "service_efficiency",
  "language_quality",
];
const UEF_KEY = "user_expectation_fulfillment";

function nowMinus(days: number, h = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(h, 0, 0, 0);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Build a ResultScore from a per-dim map. Value `"skip:<reason>"` = Skip. */
function mkScore(map: Record<string, number | string>, problemType?: ProblemType): ResultScore {
  const scores: Record<string, number> = {};
  const skips: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "string" && v.startsWith("skip:")) skips[k] = v.slice(5);
    else scores[k] = v as number;
  }
  const sqsNums = SQS_KEYS.filter((k) => skips[k] === undefined).map((k) => scores[k] ?? 0);
  const sqsAvg = sqsNums.length ? sqsNums.reduce((a, b) => a + b, 0) / sqsNums.length : 0;
  const uefTotal = skips[UEF_KEY] !== undefined ? 0 : scores[UEF_KEY] ?? 0;
  const w = defaultWeights;
  const wSum = w.sqsWeight + w.uefWeight;
  return {
    scores,
    skips,
    problemType,
    sqsAvg,
    uefTotal,
    uxs: (sqsAvg * w.sqsWeight + uefTotal * w.uefWeight) / wSum,
  };
}

/** Expected results for a Type (mirrors mock/sessions expectedResultsForType). */
function expected(caseType: CaseType, caseId: string): ExpectedResult[] {
  const mk = (
    n: number,
    resultType: ExpectedResult["resultType"],
    subtypes: ServiceSubtype[],
    entryMode: ExpectedResult["entryMode"],
  ): ExpectedResult => ({
    resultId: `${caseId}-R${n}`,
    resultType,
    serviceSubtypes: subtypes,
    entryMode,
    formTemplate: resultType === "Human" ? "Human" : "AI",
    coveredSourceIds: subtypes.map((s) => `${caseId}-${s}`),
  });
  switch (caseType) {
    case 1:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT")];
    case 2:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT"), mk(2, "Ticketbot", ["TICKETBOT"], "TRANSFERRED")];
    case 4:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT"), mk(2, "Human", ["HUMAN_IM"], "TRANSFERRED")];
    case 6:
      return [mk(1, "Human", ["HUMAN_IM"], "DIRECT")];
    default:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT")];
  }
}

interface DemoCaseSpec {
  idx: number;
  task: string;
  caseType: CaseType;
  knowledgeSource: CaseRow["knowledgeSource"];
  scenario: string;
}

const N = DEMO_TASK_ID;
const B = DEMO_B2B_TASK_ID;

const SPECS: DemoCaseSpec[] = [
  { idx: 1, task: N, caseType: 1, knowledgeSource: "Skill", scenario: "Normal · QC Completed（准确率一致）" },
  { idx: 2, task: N, caseType: 1, knowledgeSource: "FAQ", scenario: "Normal · QC Completed（C 改了一维，准确率不满分）" },
  { idx: 3, task: N, caseType: 1, knowledgeSource: "SOP", scenario: "Normal · Waiting for QC（已抽样待 C）" },
  { idx: 4, task: N, caseType: 1, knowledgeSource: "Skill", scenario: "Normal · Submitted (No QC)" },
  { idx: 5, task: N, caseType: 1, knowledgeSource: "FAQ", scenario: "Normal · Assigned（未评）" },
  { idx: 6, task: N, caseType: 1, knowledgeSource: "Skill", scenario: "Unassigned" },
  { idx: 7, task: N, caseType: 2, knowledgeSource: "Skill", scenario: "Type2 多结果 · QC Completed（含 Skip）" },
  { idx: 8, task: N, caseType: 4, knowledgeSource: "FAQ", scenario: "AI 转人工 · Waiting for QC" },
  { idx: 12, task: N, caseType: 1, knowledgeSource: "SOP", scenario: "Invalid（整行置灰）" },
  { idx: 9, task: B, caseType: 1, knowledgeSource: "Skill", scenario: "Back-to-Back · 一致 → Waiting for QC" },
  { idx: 10, task: B, caseType: 1, knowledgeSource: "FAQ", scenario: "Back-to-Back · 待拉齐（Diff）" },
  { idx: 11, task: B, caseType: 1, knowledgeSource: "Skill", scenario: "Back-to-Back · QC Completed（个人准确率可算）" },
];

function fullNumeric(base: number, pt?: ProblemType): ResultScore {
  return mkScore(
    {
      understanding_accuracy: base,
      execution_correctness: base,
      solution_adoption: base >= 3 ? 3 : 1,
      responsiveness: 3,
      service_efficiency: base,
      language_quality: base,
      [UEF_KEY]: base,
    },
    pt,
  );
}

export function buildDemoSeed(): { cases: CaseRow[]; flows: CaseFlow[]; logs: ActivityEntry[] } {
  const cases: CaseRow[] = [];
  const flows: CaseFlow[] = [];
  const logs: ActivityEntry[] = [];

  const caseId = (task: string, i: number) => `${task}-C${String(i).padStart(3, "0")}`;
  const at3 = nowMinus(3);
  const at2 = nowMinus(2);
  const at1 = nowMinus(1);

  for (const spec of SPECS) {
    const id = caseId(spec.task, spec.idx);
    const ers = expected(spec.caseType, id);
    const transferToHuman = ers.some((r) => r.resultType === "Human" && r.entryMode === "TRANSFERRED");
    const row: CaseRow = {
      caseId: id,
      sessionId: `76DEMO${String(spec.idx).padStart(4, "0")}`,
      taskId: spec.task,
      caseType: spec.caseType,
      knowledgeSource: spec.knowledgeSource,
      annotationCategory: `demo-type-${spec.caseType}`,
      category: `cat-${spec.caseType}`,
      mergeId: `MG-DEMO-${spec.idx}`,
      sourceRecordIds: ers.flatMap((r) => r.coveredSourceIds),
      language: ["en", "id", "ar"][spec.idx % 3],
      regionCode: ["US", "ID", "SA"][spec.idx % 3],
      transferToHuman,
      expectedResults: ers,
      ruleVersion: 1,
    };
    cases.push(row);

    // helper to build a per-result round (all expected results scored the same base)
    const round = (by: string, when: string, builder: (er: ExpectedResult) => ResultScore): RoundResult => ({
      results: Object.fromEntries(ers.map((er) => [er.resultId, builder(er)])),
      ruleVersion: 1,
      by,
      at: when,
    });

    const pushLog = (e: Omit<ActivityEntry, "at">, when: string) => logs.push({ ...e, at: when });

    // Base flow
    const flow: CaseFlow = { caseId: id, taskId: spec.task, mode: spec.task === B ? "Back-to-Back" : "Normal" };

    switch (spec.idx) {
      case 1: {
        // Normal QC Completed, A == C (accuracy 100%). Annotator: aaron (A), usagi (C).
        const a = round(DEMO.aaron, at3, () => fullNumeric(3, "R1"));
        flow.aAssignee = DEMO.aaron;
        flow.aResult = a;
        flow.aFirstResult = a;
        flow.finalizedBaseline = a;
        flow.baselineFinalizedBy = DEMO.aaron;
        flow.sampledForQC = true;
        flow.sampledBaseline = a;
        flow.cReviewer = DEMO.usagi;
        flow.cResult = round(DEMO.usagi, at1, () => fullNumeric(3, "R1"));
        flow.currentResult = flow.cResult;
        flow.qcCompleted = true;
        flow.finalSource = "qc";
        flow.qcReviewer = DEMO.usagi;
        pushLog({ caseId: id, operator: DEMO.aaron, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: a.results } }, at3);
        pushLog({ caseId: id, operator: DEMO.usagi, action: "Sampled for QC" }, at2);
        pushLog({ caseId: id, operator: DEMO.usagi, role: "C", action: "C Decision (Final)", version: 2, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: flow.cResult.results } }, at1);
        break;
      }
      case 2: {
        // Normal QC Completed, C changed one dim (accuracy < 100%). A: usagi, C: hachi.
        const a = round(DEMO.usagi, at3, () => fullNumeric(3, "R2"));
        const c = round(DEMO.hachi, at1, () => mkScore({
          understanding_accuracy: 3, execution_correctness: 1, solution_adoption: 3,
          responsiveness: 3, service_efficiency: 3, language_quality: 3, [UEF_KEY]: 3,
        }, "R2"));
        flow.aAssignee = DEMO.usagi; flow.aResult = a; flow.aFirstResult = a;
        flow.finalizedBaseline = a; flow.baselineFinalizedBy = DEMO.usagi;
        flow.sampledForQC = true; flow.sampledBaseline = a;
        flow.cReviewer = DEMO.hachi; flow.cResult = c; flow.currentResult = c;
        flow.qcCompleted = true; flow.finalSource = "qc"; flow.qcReviewer = DEMO.hachi;
        pushLog({ caseId: id, operator: DEMO.usagi, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: a.results } }, at3);
        pushLog({ caseId: id, operator: DEMO.hachi, role: "C", action: "C Decision (Final)", version: 2, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: c.results } }, at1);
        break;
      }
      case 3: {
        // Normal, sampled, awaiting C. A: aaron, C assigned: chiikawa.
        const a = round(DEMO.aaron, at2, () => fullNumeric(2, "R3"));
        flow.aAssignee = DEMO.aaron; flow.aResult = a; flow.aFirstResult = a;
        flow.finalizedBaseline = a; flow.baselineFinalizedBy = DEMO.aaron;
        flow.sampledForQC = true; flow.sampledBaseline = a; flow.cReviewer = DEMO.chiikawa; flow.finalSource = "baseline";
        pushLog({ caseId: id, operator: DEMO.aaron, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: a.results } }, at2);
        pushLog({ caseId: id, operator: DEMO.aaron, action: "Sampled for QC", detail: `C: ${DEMO.chiikawa}` }, at1);
        break;
      }
      case 4: {
        // Normal, A submitted, not sampled (Submitted / No QC). A: usagi.
        const a = round(DEMO.usagi, at1, () => fullNumeric(3, "R1"));
        flow.aAssignee = DEMO.usagi; flow.aResult = a; flow.aFirstResult = a;
        flow.finalizedBaseline = a; flow.baselineFinalizedBy = DEMO.usagi; flow.finalSource = "baseline";
        pushLog({ caseId: id, operator: DEMO.usagi, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: a.results } }, at1);
        break;
      }
      case 5: {
        // Normal, assigned, not yet annotated. A: hachi.
        flow.aAssignee = DEMO.hachi;
        pushLog({ caseId: id, operator: DEMO.admin, action: "Batch Assign A=" + DEMO.hachi, detail: "Normal" }, at2);
        break;
      }
      case 6: {
        // Unassigned — leave no flow at all.
        continue;
      }
      case 7: {
        // Type 2 (Chatbot + Ticketbot), QC Completed, one dim Skipped on both baseline & C (consistent). A: aaron, C: usagi.
        const build = (): ResultScore => mkScore({
          understanding_accuracy: 3, execution_correctness: 2, solution_adoption: 3,
          responsiveness: 3, service_efficiency: "skip:Insufficient evidence to judge",
          language_quality: 3, [UEF_KEY]: 3,
        }, "R1");
        const a = round(DEMO.aaron, at3, build);
        const c = round(DEMO.usagi, at1, build);
        flow.aAssignee = DEMO.aaron; flow.aResult = a; flow.aFirstResult = a;
        flow.finalizedBaseline = a; flow.baselineFinalizedBy = DEMO.aaron;
        flow.sampledForQC = true; flow.sampledBaseline = a;
        flow.cReviewer = DEMO.usagi; flow.cResult = c; flow.currentResult = c;
        flow.qcCompleted = true; flow.finalSource = "qc"; flow.qcReviewer = DEMO.usagi;
        pushLog({ caseId: id, operator: DEMO.aaron, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: a.results } }, at3);
        pushLog({ caseId: id, operator: DEMO.usagi, role: "C", action: "C Decision (Final)", version: 2, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: c.results } }, at1);
        break;
      }
      case 8: {
        // Type 4 (Chatbot → Human IM), sampled, awaiting C. A: chiikawa, C: admin.
        const a = round(DEMO.chiikawa, at2, () => fullNumeric(3, "R3"));
        flow.aAssignee = DEMO.chiikawa; flow.aResult = a; flow.aFirstResult = a;
        flow.finalizedBaseline = a; flow.baselineFinalizedBy = DEMO.chiikawa;
        flow.sampledForQC = true; flow.sampledBaseline = a; flow.cReviewer = DEMO.admin; flow.finalSource = "baseline";
        pushLog({ caseId: id, operator: DEMO.chiikawa, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: a.results } }, at2);
        break;
      }
      case 9: {
        // Back-to-Back, A & B agree → finalized, sampled awaiting C. A: aaron, B: usagi, C: hachi.
        flow.mode = "Back-to-Back";
        const a = round(DEMO.aaron, at3, () => fullNumeric(3, "R1"));
        const b = round(DEMO.usagi, at3, () => fullNumeric(3, "R1"));
        flow.aAssignee = DEMO.aaron; flow.bAssignee = DEMO.usagi;
        flow.aResult = a; flow.aFirstResult = a; flow.bResult = b; flow.bFirstResult = b;
        flow.reconcileStatus = "Reconciled"; flow.finalizedBaseline = a; flow.baselineFinalizedBy = DEMO.usagi;
        flow.sampledForQC = true; flow.sampledBaseline = a; flow.cReviewer = DEMO.hachi; flow.finalSource = "baseline";
        pushLog({ caseId: id, operator: DEMO.aaron, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: a.results } }, at3);
        pushLog({ caseId: id, operator: DEMO.usagi, role: "B", action: "Submit B Annotation", version: 2, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: b.results } }, at3);
        pushLog({ caseId: id, operator: DEMO.aaron, action: "Sampled for QC", detail: `C: ${DEMO.hachi}` }, at1);
        break;
      }
      case 10: {
        // Back-to-Back, A & B disagree → 待拉齐(Diff). A: aaron, B: usagi.
        flow.mode = "Back-to-Back";
        const a = round(DEMO.aaron, at1, () => fullNumeric(3, "R1"));
        const b = round(DEMO.usagi, at1, () => mkScore({
          understanding_accuracy: 2, execution_correctness: 1, solution_adoption: 1,
          responsiveness: 3, service_efficiency: 2, language_quality: 3, [UEF_KEY]: 2,
        }, "R2"));
        flow.aAssignee = DEMO.aaron; flow.bAssignee = DEMO.usagi;
        flow.aResult = a; flow.aFirstResult = a; flow.bResult = b; flow.bFirstResult = b;
        flow.reconcileStatus = "Pending";
        pushLog({ caseId: id, operator: DEMO.aaron, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: a.results } }, at1);
        pushLog({ caseId: id, operator: DEMO.usagi, role: "B", action: "Submit B Annotation", version: 2, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: b.results } }, at1);
        break;
      }
      case 11: {
        // Back-to-Back, reconciled → sampled → QC completed. Individual accuracy computable.
        // A: hachi (first submit differs from final in 1 dim), B: chiikawa, C: aaron.
        flow.mode = "Back-to-Back";
        const aFirst = round(DEMO.hachi, at3, () => mkScore({
          understanding_accuracy: 3, execution_correctness: 3, solution_adoption: 3,
          responsiveness: 3, service_efficiency: 2, language_quality: 3, [UEF_KEY]: 3,
        }, "R1"));
        const bFirst = round(DEMO.chiikawa, at3, () => fullNumeric(3, "R1"));
        const reconciled = round(DEMO.hachi, at2, () => fullNumeric(3, "R1"));
        const c = round(DEMO.aaron, at1, () => fullNumeric(3, "R1"));
        flow.aAssignee = DEMO.hachi; flow.bAssignee = DEMO.chiikawa;
        flow.aResult = reconciled; flow.aFirstResult = aFirst;
        flow.bResult = reconciled; flow.bFirstResult = bFirst;
        flow.reconcileStatus = "Reconciled"; flow.reconciledBy = DEMO.hachi;
        flow.finalizedBaseline = reconciled; flow.baselineFinalizedBy = DEMO.hachi;
        flow.sampledForQC = true; flow.sampledBaseline = reconciled;
        flow.cReviewer = DEMO.aaron; flow.cResult = c; flow.currentResult = c;
        flow.qcCompleted = true; flow.finalSource = "qc"; flow.qcReviewer = DEMO.aaron;
        pushLog({ caseId: id, operator: DEMO.hachi, role: "A", action: "Submit A Annotation", version: 1, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: aFirst.results } }, at3);
        pushLog({ caseId: id, operator: DEMO.chiikawa, role: "B", action: "Submit B Annotation", version: 2, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: bFirst.results } }, at3);
        pushLog({ caseId: id, operator: DEMO.hachi, action: "Reconcile A/B Diff", version: 3, resultType: "Chatbot", detail: `reconciled by ${DEMO.hachi}`, snapshot: { ruleVersion: 1, results: reconciled.results } }, at2);
        pushLog({ caseId: id, operator: DEMO.aaron, role: "C", action: "C Decision (Final)", version: 4, resultType: "Chatbot", snapshot: { ruleVersion: 1, results: c.results } }, at1);
        break;
      }
      case 12: {
        // Invalid case (was assigned then marked invalid).
        flow.aAssignee = DEMO.aaron;
        row.invalid = true;
        row.prevStatusBeforeInvalid = "Assigned";
        pushLog({ caseId: id, operator: DEMO.admin, action: "Mark Invalid" }, at1);
        break;
      }
    }

    flows.push(flow);
  }

  return { cases, flows, logs };
}
