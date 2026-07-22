import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Users, ShieldCheck, UploadCloud, Settings as SettingsIcon, Trash2, Sparkles } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui";
import Badge from "@/components/Badge";
import AssignModal, { type TypeAvailability } from "@/components/AssignModal";
import NewAnnotationTaskModal from "@/components/NewAnnotationTaskModal";
import SamplingModal from "@/components/SamplingModal";
import DownloadCsvMenu from "@/components/DownloadCsvMenu";
import { caseSets } from "@/mock/caseSets";
import type { CaseSet, CaseType } from "@/mock/types";
import {
  useSessionStore,
  type CaseFlow,
  type DistributeConfig,
  type SamplingConfig,
} from "@/store/sessionStore";
import { useCurrentUserStore, shortNameOf } from "@/lib/currentUser";
import { samePerson } from "@/lib/access";
import { computeTaskStats, fmt, RESULT_GROUPS } from "@/lib/aggregate";
import { formatAccuracy } from "@/lib/scoring";
import { useRubricStore } from "@/store/rubricStore";

export default function Home() {
  const navigate = useNavigate();
  const [rule, setRule] = useState<"old" | "new">("new");
  const [assignTask, setAssignTask] = useState<CaseSet | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
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

  // "只看我的 Task": tasks where the current user is A / B / C on any case.
  const isMyTask = (taskId: string): boolean =>
    rowsOfTask(taskId).some(({ flow }) => {
      if (!flow) return false;
      const people = [flow.aResult?.by, flow.aAssignee, flow.bResult?.by, flow.bAssignee, flow.cReviewer];
      return people.some((p) => samePerson(p, currentEmail));
    });

  const filteredTasks = caseSets.filter((t) => !onlyMine || isMyTask(t.taskId));

  // Distinct owners of a task (for the 负责人 column).
  const ownersOf = (taskId: string) => {
    const ab = new Set<string>();
    const c = new Set<string>();
    rowsOfTask(taskId).forEach(({ flow }) => {
      if (!flow) return;
      [flow.aResult?.by ?? flow.aAssignee, flow.bResult?.by ?? flow.bAssignee].forEach((p) => p && ab.add(p));
      if (flow.cReviewer) c.add(flow.cReviewer);
    });
    return { ab: Array.from(ab), c: Array.from(c) };
  };

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
          <Button variant="primary" icon={UploadCloud} onClick={() => setCsvOpen(true)}>
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
            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              只看我的 Task
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
            <div className="flex items-center justify-between border-b border-line bg-page px-3 py-1.5 text-[11px] text-muted md:hidden">
              <span>← 左右拖动查看全部列 →</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
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
                    <th className="px-3 py-3 font-medium">负责人（A/B · QC）</th>
                    <th className="px-3 py-3 font-medium">SQS / UEF / UXS · QC Acc（按结果组）</th>
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
                          {(() => {
                            const { ab, c } = ownersOf(t.taskId);
                            if (ab.length === 0 && c.length === 0) return <span className="text-muted">—</span>;
                            return (
                              <div className="space-y-0.5 text-xs">
                                <div>
                                  <span className="text-[10px] uppercase text-muted">A/B</span>{" "}
                                  {ab.length ? ab.map(shortNameOf).join("、") : <span className="text-muted">—</span>}
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase text-muted">QC</span>{" "}
                                  {c.length ? <span className="text-brand">{c.map(shortNameOf).join("、")}</span> : <span className="text-muted">—</span>}
                                </div>
                              </div>
                            );
                          })()}
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
                              {RESULT_GROUPS.map((rt) => {
                                const m = stats.byType[rt];
                                return (
                                  <tr key={rt}>
                                    <td className="pr-2 whitespace-nowrap text-[9px] uppercase text-muted">{rt}</td>
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
                              Batch Assign
                            </Button>
                            <Button variant="ghost" icon={ShieldCheck} onClick={() => setSamplingTaskId(t.taskId)}>
                              Sampling
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
        // Assignment-ready: Normal needs A; Back-to-Back needs A & B (QC starts after assignment).
        const ready = (f?: CaseFlow) => !!f?.aAssignee && (f.mode !== "Back-to-Back" || !!f.bAssignee);
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
        const unassignedOf = (scope: "all_qas" | "by_qa", qa?: string) =>
          scopeRows(samplingTaskId, scope, qa).filter(({ flow }) => !ready(flow)).length;
        const excludedOf = (scope: "all_qas" | "by_qa", qa: string | undefined, c: string | undefined) => {
          if (!c) return 0;
          return scopeRows(samplingTaskId, scope, qa).filter(({ flow }) => {
            if (!ready(flow) || flow?.sampledForQC) return false;
            const aP = flow?.aResult?.by ?? flow?.aAssignee;
            const bP = flow?.bResult?.by ?? flow?.bAssignee;
            return samePerson(c, aP) || samePerson(c, bP);
          }).length;
        };
        const availableOf = (scope: "all_qas" | "by_qa", qa: string | undefined, c: string | undefined) =>
          scopeRows(samplingTaskId, scope, qa).filter(({ flow }) => {
            if (!ready(flow) || flow?.sampledForQC) return false;
            if (c) {
              const aP = flow?.aResult?.by ?? flow?.aAssignee;
              const bP = flow?.bResult?.by ?? flow?.bAssignee;
              if (samePerson(c, aP) || samePerson(c, bP)) return false;
            }
            return true;
          }).length;
        // Task-level anti-self-review: the chosen C cannot be any A/B in this task.
        const cIsTaskAB = (c: string | undefined) => {
          if (!c) return false;
          return rowsOfTask(samplingTaskId).some(({ flow }) => {
            const aP = flow?.aResult?.by ?? flow?.aAssignee;
            const bP = flow?.bResult?.by ?? flow?.bAssignee;
            return samePerson(c, aP) || samePerson(c, bP);
          });
        };
        return (
          <SamplingModal
            taskName={meta.taskName}
            currentEmail={currentEmail}
            cIsTaskAB={cIsTaskAB}
            effectiveOf={effectiveOf}
            alreadySampledOf={alreadySampledOf}
            availableOf={availableOf}
            invalidOf={invalidOf}
            excludedOf={excludedOf}
            unassignedOf={unassignedOf}
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

      {csvOpen && <NewAnnotationTaskModal onClose={() => setCsvOpen(false)} />}

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
