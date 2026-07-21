import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Users, ShieldCheck, Database, UploadCloud, Settings as SettingsIcon, Trash2, Sparkles } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui";
import Badge from "@/components/Badge";
import AssignModal, { type TypeAvailability } from "@/components/AssignModal";
import ImportByteHiModal from "@/components/ImportByteHiModal";
import NewAnnotationTaskModal from "@/components/NewAnnotationTaskModal";
import SamplingModal from "@/components/SamplingModal";
import DownloadCsvMenu from "@/components/DownloadCsvMenu";
import { downloadCsv } from "@/lib/csv";
import { caseSets } from "@/mock/caseSets";
import type { CaseSet, CaseType } from "@/mock/types";
import {
  useSessionStore,
  type CaseFlow,
  type DistributeConfig,
  type SamplingConfig,
  effectiveRound,
  caseStatus,
} from "@/store/sessionStore";
import { useCurrentUserStore } from "@/lib/currentUser";
import { samePerson } from "@/lib/access";
import { computeTaskStats, fmt, RESULT_TYPES } from "@/lib/aggregate";
import { formatAccuracy } from "@/lib/scoring";
import { useRubricStore } from "@/store/rubricStore";

export default function Home() {
  const navigate = useNavigate();
  const [rule, setRule] = useState<"old" | "new">("new");
  const [assignTask, setAssignTask] = useState<CaseSet | null>(null);
  const [importModal, setImportModal] = useState<"bytehi" | "csv" | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"All" | "Import" | "ByteHi">("All");
  const [resetOpen, setResetOpen] = useState(false);
  const [samplingTaskId, setSamplingTaskId] = useState<string | null>(null);

  const cases = useSessionStore((s) => s.cases);
  const flows = useSessionStore((s) => s.flows);
  const distributeCases = useSessionStore((s) => s.distributeCases);
  const startSampling = useSessionStore((s) => s.startSampling);
  const loadDemo = useSessionStore((s) => s.loadDemo);
  const reset = useSessionStore((s) => s.reset);
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  const configVersion = useRubricStore((s) => s.version);

  const flowOf = (caseId: string): CaseFlow | undefined => flows.find((f) => f.caseId === caseId);
  const rowsOfTask = (taskId: string) =>
    cases.filter((c) => c.taskId === taskId).map((row) => ({ row, flow: flowOf(row.caseId) }));

  const filteredTasks = caseSets.filter((t) => sourceFilter === "All" || t.source === sourceFilter);

  const taskModeOf = (taskId: string): "Normal" | "Back-to-Back" | undefined => {
    const f = flows.find((x) => x.taskId === taskId);
    return f?.mode;
  };

  // Per-Type availability for the Batch Assign modal.
  const typeAvailability = (taskId: string): TypeAvailability[] => {
    const rows = cases.filter((c) => c.taskId === taskId && !c.invalid);
    const byType = new Map<CaseType, { total: number; remaining: number; combo: string }>();
    for (const c of rows) {
      const cur = byType.get(c.caseType) ?? {
        total: 0,
        remaining: 0,
        combo: Array.from(new Set(c.expectedResults.map((r) => r.resultType))).join(" + "),
      };
      cur.total += 1;
      if (!flowOf(c.caseId)?.aAssignee) cur.remaining += 1;
      byType.set(c.caseType, cur);
    }
    return Array.from(byType.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([caseType, v]) => ({ caseType, total: v.total, remaining: v.remaining, resultCombo: v.combo }));
  };

  // ---- Sampling helper closures (scope-aware) ----
  const scopeRows = (taskId: string, scope: "all_qas" | "by_qa", qaEmail?: string) =>
    rowsOfTask(taskId).filter(({ row, flow }) => {
      if (row.invalid) return false;
      if (scope === "by_qa" && qaEmail) {
        const aP = flow?.aResult?.by ?? flow?.aAssignee;
        const bP = flow?.bResult?.by ?? flow?.bAssignee;
        return samePerson(aP, qaEmail) || samePerson(bP, qaEmail);
      }
      return true;
    });

  const exportTaskToByteHi = (task: CaseSet) => {
    const rows = rowsOfTask(task.taskId).flatMap(({ row, flow }) => {
      const eff = effectiveRound(flow);
      return row.expectedResults.map((er) => {
        const s = eff?.results[er.resultId];
        return [
          row.caseId,
          row.sessionId,
          er.resultType,
          caseStatus(row, flow),
          s ? s.sqsAvg.toFixed(2) : "",
          s ? s.uefTotal.toFixed(2) : "",
          s ? s.uxs.toFixed(2) : "",
        ];
      });
    });
    downloadCsv(
      `${task.taskId}_bytehi_export.csv`,
      ["case_id", "session_id", "result_type", "case_status", "sqs_avg", "uef_avg", "uxs"],
      rows,
    );
  };

  return (
    <Layout>
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Manual Annotation Tool</h1>
          <p className="text-xs text-subtle">当前生效评分标准版本：Config v{configVersion}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={Sparkles} onClick={() => loadDemo()}>
            Load Demo Sample
          </Button>
          <Button icon={Database} onClick={() => setImportModal("bytehi")}>
            Import from ByteHi
          </Button>
          <Button variant="primary" icon={UploadCloud} onClick={() => setImportModal("csv")}>
            Upload CSV
          </Button>
          <Button icon={SettingsIcon} onClick={() => navigate("/settings")}>
            Settings
          </Button>
          <button
            onClick={() => setResetOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-4 w-4" /> Clear All Data
          </button>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-line bg-white p-1">
            {(["new", "old"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRule(r)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  rule === r ? "bg-brand text-white" : "text-subtle hover:text-ink"
                }`}
              >
                {r === "old" ? "Old Rule" : "New Rule"}
              </button>
            ))}
          </div>
          {rule === "new" && (
            <label className="flex items-center gap-1.5 text-xs text-subtle">
              Source type
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}
                className="h-8 rounded-md border border-line bg-white px-2 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="All">All</option>
                <option value="Import">Import</option>
                <option value="ByteHi">ByteHi</option>
              </select>
            </label>
          )}
          <span className="ml-auto text-xs text-subtle">Settings 与 Clear All Data 为 Demo-only，不属于 Phase 1 承诺范围。</span>
        </div>

        {rule === "old" ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-subtle">
            Old Rule workspace 与 New Rule 完全隔离（GE Rate / P-Q-I）。
            <br />
            本 demo 聚焦 New Rule — 切回 New Rule 继续。
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
                    <th className="px-3 py-3 font-medium">Source</th>
                    <th className="px-3 py-3 font-medium">Task Name</th>
                    <th className="px-3 py-3 font-medium">评分模式</th>
                    <th className="px-3 py-3 font-medium">Cases</th>
                    <th className="px-3 py-3 font-medium">Assigned</th>
                    <th className="px-3 py-3 font-medium">Annotation Finish Rate</th>
                    <th className="px-3 py-3 font-medium">Back-to-Back Complete Rate</th>
                    <th className="px-3 py-3 font-medium">QC Complete</th>
                    <th className="px-3 py-3 font-medium">SQS / UEF / UXS · QC Acc（按结果类型）</th>
                    <th className="px-3 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((t) => {
                    const mode = taskModeOf(t.taskId);
                    const stats = computeTaskStats(rowsOfTask(t.taskId), mode);
                    const annPct = stats.effective === 0 ? null : (stats.aFinished / stats.effective) * 100;
                    const b2bPct = stats.bTotal === 0 ? null : (stats.bFinished / stats.bTotal) * 100;
                    return (
                      <tr key={t.taskId} className="border-b border-line align-top last:border-0 hover:bg-page">
                        <td className="px-3 py-3">
                          <Badge tone="neutral">{t.source}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-ink">{t.taskName}</div>
                          <div className="text-xs text-muted">{t.ruleVersion}</div>
                        </td>
                        <td className="px-3 py-3">
                          {mode === undefined ? (
                            <Badge tone="neutral">未分配</Badge>
                          ) : mode === "Back-to-Back" ? (
                            <Badge tone="brand">Back-to-Back</Badge>
                          ) : (
                            <Badge tone="success">Normal</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-ink">
                          {stats.effective}
                          {stats.invalid > 0 && <span className="ml-1 text-[10px] text-danger">(Invalid {stats.invalid})</span>}
                        </td>
                        <td className="px-3 py-3 font-mono text-ink">
                          {stats.assigned}
                          <span className="text-muted"> / {stats.effective}</span>
                        </td>
                        <td className="px-3 py-3">
                          {annPct === null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className="font-mono text-ink">
                              {stats.aFinished}<span className="text-muted"> / {stats.effective}</span>
                              <span className="ml-1 text-xs text-subtle">({annPct.toFixed(0)}%)</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {b2bPct === null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            <span className="font-mono text-ink">
                              {stats.bFinished}<span className="text-muted"> / {stats.bTotal}</span>
                              <span className="ml-1 text-xs text-subtle">({b2bPct.toFixed(0)}%)</span>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {stats.qcSampled > 0 ? (
                            <span className="font-mono text-ink">
                              {stats.qcDone}<span className="text-muted"> / {stats.qcSampled}</span>
                            </span>
                          ) : (
                            <span className="font-mono text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <table className="text-[11px]">
                            <thead>
                              <tr className="text-[9px] uppercase text-muted">
                                <th className="pr-2 text-left font-medium"></th>
                                <th className="px-1 font-medium">SQS</th>
                                <th className="px-1 font-medium">UEF</th>
                                <th className="px-1 font-medium">UXS</th>
                                <th className="px-1 font-medium">QC Acc</th>
                              </tr>
                            </thead>
                            <tbody className="font-mono">
                              {RESULT_TYPES.map((rt) => {
                                const m = stats.byType[rt];
                                return (
                                  <tr key={rt}>
                                    <td className="pr-2 text-[9px] uppercase text-muted">{rt}</td>
                                    <td className="px-1 text-center text-ink">{m.sqsAvg === null ? "—" : fmt(m.sqsAvg)}</td>
                                    <td className="px-1 text-center text-ink">{m.uefAvg === null ? "—" : fmt(m.uefAvg)}</td>
                                    <td className="px-1 text-center text-ink">{m.uxsAvg === null ? "—" : fmt(m.uxsAvg)}</td>
                                    <td className="px-1 text-center text-brand">{formatAccuracy(m.qcAccuracy)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                            <Button variant="ghost" icon={Eye} onClick={() => navigate(`/task/${t.taskId}`)}>
                              Detail
                            </Button>
                            <Button variant="ghost" icon={Users} onClick={() => setAssignTask(t)}>
                              Assign
                            </Button>
                            <Button variant="ghost" icon={ShieldCheck} onClick={() => setSamplingTaskId(t.taskId)}>
                              Sampling
                            </Button>
                            <Button variant="ghost" onClick={() => exportTaskToByteHi(t)}>
                              Export
                            </Button>
                            <DownloadCsvMenu taskId={t.taskId} label="Download" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {assignTask && (
        <AssignModal
          taskName={assignTask.taskName}
          types={typeAvailability(assignTask.taskId)}
          lockedMode={taskModeOf(assignTask.taskId)}
          onClose={() => setAssignTask(null)}
          onConfirm={(config: DistributeConfig) => {
            try {
              distributeCases(assignTask.taskId, config, currentEmail);
              const id = assignTask.taskId;
              setAssignTask(null);
              navigate(`/task/${id}`);
            } catch (e) {
              alert(e instanceof Error ? e.message : "分配失败");
            }
          }}
        />
      )}

      {samplingTaskId && (() => {
        const meta = caseSets.find((t) => t.taskId === samplingTaskId)!;
        const isFinalized = (f?: CaseFlow) => !!f?.finalizedBaseline;
        const effectiveOf = (scope: "all_qas" | "by_qa", qa?: string) => scopeRows(samplingTaskId, scope, qa).length;
        const alreadySampledOf = (scope: "all_qas" | "by_qa", qa?: string) =>
          scopeRows(samplingTaskId, scope, qa).filter(({ flow }) => flow?.sampledForQC).length;
        const invalidOf = (scope: "all_qas" | "by_qa", qa?: string) =>
          rowsOfTask(samplingTaskId).filter(({ row, flow }) => {
            if (!row.invalid) return false;
            if (scope === "by_qa" && qa) {
              const aP = flow?.aResult?.by ?? flow?.aAssignee;
              const bP = flow?.bResult?.by ?? flow?.bAssignee;
              return samePerson(aP, qa) || samePerson(bP, qa);
            }
            return true;
          }).length;
        const excludedOf = (scope: "all_qas" | "by_qa", qa: string | undefined, c: string | undefined) => {
          if (!c) return 0;
          return scopeRows(samplingTaskId, scope, qa).filter(({ flow }) => {
            if (!isFinalized(flow) || flow?.sampledForQC) return false;
            const aP = flow?.aResult?.by ?? flow?.aAssignee;
            const bP = flow?.bResult?.by ?? flow?.bAssignee;
            return samePerson(c, aP) || samePerson(c, bP);
          }).length;
        };
        const availableOf = (scope: "all_qas" | "by_qa", qa: string | undefined, c: string | undefined, override: boolean) =>
          scopeRows(samplingTaskId, scope, qa).filter(({ flow }) => {
            if (!isFinalized(flow) || flow?.sampledForQC) return false;
            if (c && !override) {
              const aP = flow?.aResult?.by ?? flow?.aAssignee;
              const bP = flow?.bResult?.by ?? flow?.bAssignee;
              if (samePerson(c, aP) || samePerson(c, bP)) return false;
            }
            return true;
          }).length;
        const blockersOf = (scope: "all_qas" | "by_qa", qa?: string) => {
          const rows = scopeRows(samplingTaskId, scope, qa);
          const pendingDiff = rows.filter(({ flow }) => flow?.reconcileStatus === "Pending").length;
          const unsubmitted = rows.filter(({ flow }) => !isFinalized(flow) && flow?.reconcileStatus !== "Pending").length;
          return { unsubmitted, pendingDiff };
        };
        return (
          <SamplingModal
            taskName={meta.taskName}
            currentEmail={currentEmail}
            effectiveOf={effectiveOf}
            alreadySampledOf={alreadySampledOf}
            availableOf={availableOf}
            invalidOf={invalidOf}
            excludedOf={excludedOf}
            blockersOf={blockersOf}
            onClose={() => setSamplingTaskId(null)}
            onConfirm={(config: SamplingConfig) => {
              try {
                startSampling(samplingTaskId, config, currentEmail);
                const id = samplingTaskId;
                setSamplingTaskId(null);
                navigate(`/task/${id}`);
              } catch (e) {
                alert(e instanceof Error ? e.message : "抽样失败");
              }
            }}
          />
        );
      })()}

      {importModal === "bytehi" && (
        <ImportByteHiModal
          onClose={() => setImportModal(null)}
          onConfirm={(task) => {
            setImportModal(null);
            navigate(`/task/${task.taskId}`);
          }}
        />
      )}
      {importModal === "csv" && <NewAnnotationTaskModal onClose={() => setImportModal(null)} />}

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setResetOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-danger" />
              <h3 className="text-base font-semibold text-ink">Clear All Data（Demo-only）</h3>
            </div>
            <p className="mt-2 text-sm text-subtle">
              这会清空所有分配、标注、QC 和活动日志，把全部 case 重置为未分配的空白起点。此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setResetOpen(false)} className="rounded-md border border-line px-4 py-2 text-sm text-subtle hover:bg-page">
                Cancel
              </button>
              <button
                onClick={() => {
                  reset();
                  setResetOpen(false);
                }}
                className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
