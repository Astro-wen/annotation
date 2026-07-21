import { useState } from "react";
import { Download, FileText, FileBarChart } from "lucide-react";
import { Button } from "./ui";
import {
  downloadCsv,
  dimConsistency,
  formatRate,
  SQS_DIM_KEYS,
  UEF_DIM_KEY,
} from "@/lib/csv";
import {
  useSessionStore,
  effectiveRound,
  caseStatus,
  RESULT_TYPES,
  type CaseFlow,
  type RoundResult,
} from "@/store/sessionStore";
import { useRubricStore } from "@/store/rubricStore";
import { qcAccuracy, formatAccuracy, type AccuracyPair } from "@/lib/scoring";
import { assertNoPII } from "@/lib/pii";
import type { CaseRow, ResultType } from "@/mock/types";

type CaseWithFlow = { row: CaseRow; flow?: CaseFlow };

/** Baseline used for QC comparison (sampled snapshot preferred). */
function qcBaseline(flow: CaseFlow): RoundResult | undefined {
  return flow.sampledBaseline ?? flow.finalizedBaseline;
}

/** QC accuracy pairs for one result_type over QC-completed, non-invalid cases. */
function qcPairsForType(rows: CaseWithFlow[], rt: ResultType): AccuracyPair[] {
  const pairs: AccuracyPair[] = [];
  for (const { row, flow } of rows) {
    if (row.invalid || !flow || !flow.qcCompleted) continue;
    const baseline = qcBaseline(flow);
    const current = flow.currentResult;
    if (!baseline || !current) continue;
    for (const er of row.expectedResults) {
      if (er.resultType !== rt) continue;
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

function mean(nums: number[]): string {
  if (nums.length === 0) return "";
  return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2);
}

export default function DownloadCsvMenu({
  taskId,
  label = "Download CSV",
}: {
  taskId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const cases = useSessionStore((s) => s.cases);
  const flows = useSessionStore((s) => s.flows);
  const version = useRubricStore((s) => s.version);

  const configVersion = `v${version}`;

  const scoped: CaseWithFlow[] = cases
    .filter((row) => !taskId || row.taskId === taskId)
    .map((row) => ({ row, flow: flows.find((f) => f.caseId === row.caseId) }));

  const downloadSummary = () => {
    const headers = [
      "result_type",
      "total_samples",
      "invalid_count",
      "annotated_count",
      "annotated_rate",
      "sqs_avg",
      "uef_avg",
      "uxs_avg",
      "understanding_accuracy_consistency",
      "execution_correctness_consistency",
      "solution_adoption_consistency",
      "responsiveness_consistency",
      "service_efficiency_consistency",
      "language_quality_consistency",
      "uef_accuracy",
      "qc_accuracy",
      ...SQS_DIM_KEYS.map((k) => `${k}_skip_count`),
      `${UEF_DIM_KEY}_skip_count`,
      "config_version",
    ];

    const rows: string[][] = [];
    for (const rt of RESULT_TYPES) {
      let total = 0;
      let invalid = 0;
      const sqs: number[] = [];
      const uef: number[] = [];
      const uxs: number[] = [];
      let annotated = 0;
      const skipCounts: Record<string, number> = {};

      for (const { row, flow } of scoped) {
        const eff = row.invalid ? undefined : effectiveRound(flow);
        for (const er of row.expectedResults) {
          if (er.resultType !== rt) continue;
          total += 1;
          if (row.invalid) {
            invalid += 1;
            continue;
          }
          const s = eff?.results[er.resultId];
          if (s) {
            annotated += 1;
            sqs.push(s.sqsAvg);
            uef.push(s.uefTotal);
            uxs.push(s.uxs);
            for (const k of Object.keys(s.skips ?? {})) skipCounts[k] = (skipCounts[k] ?? 0) + 1;
          }
        }
      }

      if (total === 0) continue; // only emit result_types that have data

      const denom = total - invalid;
      const annotatedRate = denom > 0 ? formatRate(annotated / denom) : "";

      const pairs = qcPairsForType(scoped, rt);
      const consistencyCols = SQS_DIM_KEYS.map((k) => formatRate(dimConsistency(pairs, k)));
      const uefAccuracy = formatRate(dimConsistency(pairs, UEF_DIM_KEY));
      const qcAcc = formatAccuracy(qcAccuracy(pairs));
      const skipCountCols = [...SQS_DIM_KEYS, UEF_DIM_KEY].map((k) => String(skipCounts[k] ?? 0));

      rows.push([
        rt,
        String(total),
        String(invalid),
        String(annotated),
        annotatedRate,
        mean(sqs),
        mean(uef),
        mean(uxs),
        ...consistencyCols,
        uefAccuracy,
        qcAcc === "—" ? "" : qcAcc,
        ...skipCountCols,
        configVersion,
      ]);
    }

    downloadCsv("annotation_summary.csv", headers, rows);
    setOpen(false);
  };

  const downloadData = () => {
    const scoreKeys = [...SQS_DIM_KEYS, UEF_DIM_KEY];
    // Each dimension outputs numeric score + is_skip + skip_reason (PRD).
    const scoreHeaderCols = scoreKeys.flatMap((k) => [k, `${k}_is_skip`, `${k}_skip_reason`]);

    const baseHeaders = [
      "type_number",
      "annotation_category",
      "category",
      "merge_id",
      "case_id",
      "result_id",
      "result_type",
      "service_subtypes",
      "entry_mode",
      "covered_source_ids",
      "case_status",
      "final_source",
      ...scoreHeaderCols,
      "uxs",
      "annotator",
    ];

    const historyHeaders = [
      ...baseHeaders,
      "round",
      "role",
      "is_final",
      "round_submitted_at",
      "config_version",
    ];

    const rows: string[][] = [];

    // For one ResultScore, emit [score, is_skip, skip_reason] per dimension key.
    const scoreCellsFor = (s?: import("@/mock/types").ResultScore): string[] =>
      scoreKeys.flatMap((k) => {
        if (!s) return ["", "", ""];
        const isSkip = s.skips?.[k] !== undefined;
        return [
          isSkip ? "" : String(s.scores[k] ?? ""),
          isSkip ? "true" : "false",
          isSkip ? assertNoPII(s.skips![k]) : "",
        ];
      });

    for (const { row, flow } of scoped) {
      const status = caseStatus(row, flow);
      const finalSource = flow?.finalSource ?? "";
      const annotator = flow?.aResult?.by ?? flow?.aAssignee ?? "";

      for (const er of row.expectedResults) {
        const baseCells = [
          String(row.caseType),
          assertNoPII(row.annotationCategory),
          assertNoPII(row.category),
          assertNoPII(row.mergeId),
          assertNoPII(row.caseId),
          assertNoPII(er.resultId),
          er.resultType,
          assertNoPII(er.serviceSubtypes.join("|")),
          er.entryMode,
          assertNoPII(er.coveredSourceIds.join("|")),
          assertNoPII(status),
          assertNoPII(finalSource),
        ];

        if (!includeHistory) {
          const eff = row.invalid ? undefined : effectiveRound(flow);
          const s = eff?.results[er.resultId];
          rows.push([
            ...baseCells,
            ...scoreCellsFor(s),
            s ? s.uxs.toFixed(2) : "",
            assertNoPII(annotator),
          ]);
          continue;
        }

        // History mode: one row per (result × round).
        const eff = effectiveRound(flow);
        const rounds: {
          round: RoundResult | undefined;
          role: string;
        }[] = [
          { round: flow?.aFirstResult, role: "A" },
          { round: flow?.bFirstResult, role: "B" },
          { round: flow?.finalizedBaseline, role: "baseline" },
          { round: flow?.currentResult, role: "current" },
        ];

        rounds.forEach(({ round, role }, idx) => {
          if (!round) return;
          const s = round.results[er.resultId];
          const isFinal = role === "current" && round === eff;
          rows.push([
            ...baseCells,
            ...scoreCellsFor(s),
            s ? s.uxs.toFixed(2) : "",
            assertNoPII(round.by ?? ""),
            String(idx + 1),
            role,
            isFinal ? "true" : "false",
            assertNoPII(round.at ?? ""),
            configVersion,
          ]);
        });
      }
    }

    downloadCsv(
      "annotation_data.csv",
      includeHistory ? historyHeaders : baseHeaders,
      rows,
    );
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button icon={Download} onClick={() => setOpen((o) => !o)}>
        {label}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-line bg-white p-1 shadow-lg">
            <button
              onClick={downloadSummary}
              className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-50"
            >
              <FileBarChart className="mt-0.5 h-4 w-4 text-brand" />
              <span>
                <span className="block text-sm font-medium">annotation_summary.csv</span>
                <span className="block text-xs text-subtle">
                  Aggregate per result_type: SQS / UEF / UXS avg, consistency, QC accuracy
                </span>
              </span>
            </button>

            <div className="my-1 border-t border-line" />

            <div className="px-3 py-1.5">
              <span className="block text-xs font-medium uppercase tracking-wide text-subtle">
                明细结果范围
              </span>
              <div className="mt-1 flex rounded-md border border-line p-0.5 text-xs">
                <button
                  onClick={() => setIncludeHistory(false)}
                  className={
                    "flex-1 rounded px-2 py-1 font-medium transition-colors " +
                    (!includeHistory ? "bg-brand text-white" : "text-ink hover:bg-gray-50")
                  }
                >
                  仅最新结果
                </button>
                <button
                  onClick={() => setIncludeHistory(true)}
                  className={
                    "flex-1 rounded px-2 py-1 font-medium transition-colors " +
                    (includeHistory ? "bg-brand text-white" : "text-ink hover:bg-gray-50")
                  }
                >
                  包含历史结果
                </button>
              </div>
            </div>

            <button
              onClick={downloadData}
              className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-50"
            >
              <FileText className="mt-0.5 h-4 w-4 text-brand" />
              <span>
                <span className="block text-sm font-medium">annotation_data.csv</span>
                <span className="block text-xs text-subtle">
                  Row-level: one row per Case × expected result
                  {includeHistory ? " × round" : ""}
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
