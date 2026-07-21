import { type CaseRow, type ResultGroup, RESULT_GROUPS, resultGroupOf } from "@/mock/types";
import {
  type CaseFlow,
  type RoundResult,
  caseFlowStatus,
  effectiveRound,
  slotStatus,
} from "@/store/sessionStore";
import { qcAccuracy, type AccuracyPair } from "@/lib/scoring";
import { samePerson } from "@/lib/access";

export { RESULT_GROUPS };

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function fmt(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

/** Per result-group aggregate metrics for a set of (case, flow) pairs. */
export interface ResultTypeMetrics {
  sqsAvg: number | null;
  uefAvg: number | null;
  uxsAvg: number | null;
  qcAccuracy: number | "—";
}

/** Collect the effective per-result score entries for one result type. */
function effectiveEntriesForType(
  rows: { row: CaseRow; flow?: CaseFlow }[],
  rt: ResultGroup,
) {
  const out: { sqsAvg: number; uefTotal: number; uxs: number }[] = [];
  for (const { row, flow } of rows) {
    if (row.invalid) continue;
    const eff = effectiveRound(flow);
    if (!eff) continue;
    for (const er of row.expectedResults) {
      if (resultGroupOf(er) !== rt) continue;
      const s = eff.results[er.resultId];
      if (!s) continue;
      out.push({ sqsAvg: s.sqsAvg, uefTotal: s.uefTotal, uxs: s.uxs });
    }
  }
  return out;
}

/** QC accuracy pairs (baseline vs current) per result type for finalized cases. */
function qcPairsForType(
  rows: { row: CaseRow; flow?: CaseFlow }[],
  rt: ResultGroup,
  baselineOf: (flow: CaseFlow) => RoundResult | undefined,
): AccuracyPair[] {
  const pairs: AccuracyPair[] = [];
  for (const { row, flow } of rows) {
    // Accuracy is computed only when BOTH a Finalized Baseline and the current
    // C result exist (A/B annotation and C QC run in parallel).
    if (row.invalid || !flow || !flow.finalizedBaseline || !flow.currentResult) continue;
    const baseline = baselineOf(flow);
    const current = flow.currentResult;
    if (!baseline || !current) continue;
    for (const er of row.expectedResults) {
      if (resultGroupOf(er) !== rt) continue;
      const b = baseline.results[er.resultId];
      const c = current.results[er.resultId];
      if (!b || !c) continue;
      pairs.push({
        baseline: b.scores,
        current: c.scores,
        baselineSkips: new Set(Object.keys(b.skips ?? {})),
        currentSkips: new Set(Object.keys(c.skips ?? {})),
      });
    }
  }
  return pairs;
}

export function metricsForType(
  rows: { row: CaseRow; flow?: CaseFlow }[],
  rt: ResultGroup,
): ResultTypeMetrics {
  const entries = effectiveEntriesForType(rows, rt);
  const pairs = qcPairsForType(rows, rt, (f) => f.sampledBaseline ?? f.finalizedBaseline);
  return {
    sqsAvg: mean(entries.map((e) => e.sqsAvg)),
    uefAvg: mean(entries.map((e) => e.uefTotal)),
    uxsAvg: mean(entries.map((e) => e.uxs)),
    qcAccuracy: qcAccuracy(pairs),
  };
}

/** Individual accuracy: compare a person's FIRST submission vs current-effective. */
export function individualMetricsForType(
  rows: { row: CaseRow; flow?: CaseFlow }[],
  rt: ResultGroup,
  email: string,
): ResultTypeMetrics {
  const pairs: AccuracyPair[] = [];
  for (const { row, flow } of rows) {
    // Individual accuracy compares a person's FIRST submission against the current
    // C result. It only needs the person's submission and a C result to exist —
    // it does NOT require a Finalized Baseline (with parallel QC, a case can be
    // QC-completed while A/B are still unreconciled).
    if (row.invalid || !flow || !flow.currentResult) continue;
    // the person must have submitted as A or B on this case
    const aFirst = flow.aFirstResult;
    const bFirst = flow.bFirstResult;
    const mine =
      aFirst && samePerson(aFirst.by, email)
        ? aFirst
        : bFirst && samePerson(bFirst.by, email)
          ? bFirst
          : undefined;
    const current = flow.currentResult;
    if (!mine || !current) continue;
    for (const er of row.expectedResults) {
      if (resultGroupOf(er) !== rt) continue;
      const b = mine.results[er.resultId];
      const c = current.results[er.resultId];
      if (!b || !c) continue;
      pairs.push({
        baseline: b.scores,
        current: c.scores,
        baselineSkips: new Set(Object.keys(b.skips ?? {})),
        currentSkips: new Set(Object.keys(c.skips ?? {})),
      });
    }
  }
  return { sqsAvg: null, uefAvg: null, uxsAvg: null, qcAccuracy: qcAccuracy(pairs) };
}

/** Home row stats for one task. */
export interface TaskStats {
  effective: number; // non-invalid case count
  invalid: number;
  assigned: number;
  aFinished: number;
  bFinished: number;
  bTotal: number; // B2B non-invalid case count
  qcDone: number;
  qcSampled: number;
  byType: Record<ResultGroup, ResultTypeMetrics>;
}

/** Whether every expected result for a case has been scored in a round. */
function roundComplete(row: CaseRow, round?: RoundResult): boolean {
  if (!round) return false;
  return row.expectedResults.every((er) => !!round.results[er.resultId]);
}

export function computeTaskStats(
  rows: { row: CaseRow; flow?: CaseFlow }[],
  mode: "Normal" | "Back-to-Back" | undefined,
): TaskStats {
  const valid = rows.filter((r) => !r.row.invalid);
  const invalid = rows.length - valid.length;

  const assigned = valid.filter(({ flow }) => {
    if (!flow) return false;
    if (flow.mode === "Back-to-Back") return !!flow.aAssignee && !!flow.bAssignee;
    return !!flow.aAssignee;
  }).length;

  const aFinished = valid.filter(({ row, flow }) => roundComplete(row, flow?.aResult)).length;
  const b2bRows = valid.filter(({ flow }) => flow?.mode === "Back-to-Back");
  const bFinished = b2bRows.filter(({ row, flow }) => roundComplete(row, flow?.bResult)).length;

  const qcSampled = valid.filter(({ flow }) => flow?.sampledForQC).length;
  const qcDone = valid.filter(({ flow }) => flow?.qcCompleted).length;

  const byType = Object.fromEntries(
    RESULT_GROUPS.map((rt) => [rt, metricsForType(valid, rt)]),
  ) as Record<ResultGroup, ResultTypeMetrics>;

  return {
    effective: valid.length,
    invalid,
    assigned,
    aFinished,
    bFinished,
    bTotal: mode === "Back-to-Back" ? b2bRows.length : 0,
    qcDone,
    qcSampled,
    byType,
  };
}

/** Compact status classification for a case, used by filters. */
export function statusKey(row: CaseRow, flow?: CaseFlow): string {
  if (row.invalid) return "Invalid";
  const cf = caseFlowStatus(flow);
  if (cf) return cf === "Diff" ? "Diff" : cf; // "Diff" | "Waiting for QC" | "QC Completed"
  return slotStatus(flow, "A"); // "Unassigned" | "Assigned" | "Submitted (No QC)"
}
