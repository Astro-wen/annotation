import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Users, ShieldCheck, Database, UploadCloud, Settings as SettingsIcon, Trash2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui";
import Badge from "@/components/Badge";
import AssignModal from "@/components/AssignModal";
import ImportByteHiModal from "@/components/ImportByteHiModal";
import NewAnnotationTaskModal from "@/components/NewAnnotationTaskModal";
import SamplingModal, { type QcFlowRow } from "@/components/SamplingModal";
import DownloadCsvMenu from "@/components/DownloadCsvMenu";
import { downloadCsv } from "@/lib/csv";
import { caseSets } from "@/mock/caseSets";
import type { CaseSet, SessionRow } from "@/mock/types";
import { useSessionStore } from "@/store/sessionStore";
import { useCurrentUserStore, isVendor } from "@/lib/currentUser";
import { caseVisibleTo } from "@/lib/access";
import { aggregateAccuracy } from "@/lib/diff";

export default function Home() {
  const navigate = useNavigate();
  const [rule, setRule] = useState<"old" | "new">("new");
  const [assignTask, setAssignTask] = useState<CaseSet | null>(null);
  const [importModal, setImportModal] = useState<"bytehi" | "csv" | null>(null);
  const [sourceFilter, setSourceFilter] = useState<"All" | "Import" | "ByteHi">("All");
  const [typeFilter, setTypeFilter] = useState<"All" | "Chatbot" | "Ticket">("All");
  const sessions = useSessionStore((s) => s.sessions);
  const reviewFlows = useSessionStore((s) => s.reviewFlows);
  const distributeTaskCases = useSessionStore((s) => s.distributeTaskCases);
  const reset = useSessionStore((s) => s.reset);
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  // 供应商标注员：首页只能看到自己有份的 case set，且看不到 Import / Export /
  // Sampling / Batch Assign / Clear All 等管理员操作入口。管理员 / QA 不受限。
  const vendor = isVendor(currentEmail);
  const [resetOpen, setResetOpen] = useState(false);
  // Sampling draws completed cases into QC; the actual QC review then happens
  // on each task's Detail page (the case's C/QC row), not here.
  const [samplingTaskId, setSamplingTaskId] = useState<string | null>(null);

  const filteredTasks = caseSets.filter(
    (t) =>
      (sourceFilter === "All" || t.source === sourceFilter) &&
      (typeFilter === "All" || t.taskType === typeFilter) &&
      // 供应商硬隔离：只保留至少含一条分配给自己的 case 的 case set。
      (!vendor ||
        sessions.some(
          (s) =>
            s.taskId === t.taskId &&
            caseVisibleTo(
              currentEmail,
              s,
              reviewFlows.find((rf) => rf.sessionId === s.sessionId),
            ),
        ))
  );

  // Live per-task progress from the store. "Assigned" = has an owner/annotator
  // (no longer Unassigned). "Completed" = annotation finished. For back-to-back
  // cases each case is TWO annotation units (A + B), so the denominator doubles.
  // "QC Complete" = cases finalized by C.
  const taskStats = (taskId: string) => {
    const rows = sessions.filter((s) => s.taskId === taskId);
    const total = rows.length;
    const assigned = rows.filter((s) => s.status !== "Unassigned").length;

    // Two rates:
    //  - Annotation Rate: the top (A) row completion across all cases —
    //    A submitted / total cases that have a flow.
    //  - B2B Completion Rate: the expanded (B) row completion among back-to-back
    //    cases only — B submitted / back-to-back cases. Normal tasks show "—".
    let aDone = 0;
    let aTotal = 0;
    let bDone = 0;
    let btbCases = 0;
    rows.forEach((s) => {
      const f = reviewFlows.find((rf) => rf.sessionId === s.sessionId);
      if (!f) return;
      aTotal += 1;
      if (f.aResultStatus === "Submitted") aDone += 1;
      if (f.backToBackEnabled) {
        btbCases += 1;
        if (f.bResultStatus === "Submitted") bDone += 1;
      }
    });
    const isBtb = btbCases > 0;
    const annPct = aTotal === 0 ? null : (aDone / aTotal) * 100;
    const b2bPct = btbCases === 0 ? null : (bDone / btbCases) * 100;

    // QC completion: cases finalized by C.
    const qcDone = reviewFlows.filter(
      (f) =>
        f.currentState === "Final Result Ready" &&
        rows.some((s) => s.sessionId === f.sessionId),
    ).length;
    // QC denominator: cases sampled into QC (final or in-QC).
    const qcTotal = reviewFlows.filter(
      (f) =>
        (f.sampledForQC || f.currentState === "Final Result Ready") &&
        rows.some((s) => s.sessionId === f.sessionId),
    ).length;

    // Score aggregates over rows that have a scored result.
    const scored = rows.filter((s) => s.bot);
    const n = scored.length;
    const avg = (pick: (b: NonNullable<SessionRow["bot"]>) => number) =>
      n === 0 ? "—" : (scored.reduce((acc, s) => acc + pick(s.bot!), 0) / n).toFixed(2);
    const sqsAvg = avg((b) => b.sqsTotal);
    const uesAvg = avg((b) => b.uesTotal);
    const userSatisfactionAvg = avg((b) => b.userSatisfaction);
    const sqsPassRate =
      n === 0 ? "—" : `${((scored.filter((s) => s.bot!.sqsPass).length / n) * 100).toFixed(1)}%`;

    // QC Accuracy: all-correct rule across C-finalized cases in this task. A
    // case counts only when every compared dimension matches (7-of-7); one
    // mismatch makes the whole case wrong. Accuracy = fully-correct / QC'd.
    // Never average the per-case dimension percentages — that runs high.
    const finalized = reviewFlows.filter(
      (f) =>
        f.currentState === "Final Result Ready" &&
        f.aResult &&
        f.cResult &&
        sessions.some((s) => s.sessionId === f.sessionId && s.taskId === taskId),
    );
    const acc = aggregateAccuracy(finalized);
    const qcAccuracy = acc === null ? "—" : `${acc.toFixed(1)}%`;

    return {
      total,
      assigned,
      aDone,
      aTotal,
      annPct,
      bDone,
      btbCases,
      b2bPct,
      isBtb,
      qcDone,
      qcTotal,
      sqsAvg,
      uesAvg,
      userSatisfactionAvg,
      sqsPassRate,
      qcAccuracy,
    };
  };

  // A task's back-to-back mode (uniform per task): "Unassigned" until any case
  // has a flow, then "B2B" or "Normal".
  const taskMode = (taskId: string): "Unassigned" | "Normal" | "B2B" => {
    const flows = reviewFlows.filter((f) =>
      sessions.some((s) => s.sessionId === f.sessionId && s.taskId === taskId),
    );
    if (flows.length === 0) return "Unassigned";
    return flows.some((f) => f.backToBackEnabled) ? "B2B" : "Normal";
  };

  // Cases still available for a NEW sampling batch: annotation complete
  // (A submitted, plus B if back-to-back), not yet sampled, not finalized.
  const qcPool = (taskId: string): QcFlowRow[] => {
    const taskSessions = sessions.filter((s) => s.taskId === taskId);
    return reviewFlows
      .map((flow) => ({
        flow,
        session: taskSessions.find((s) => s.sessionId === flow.sessionId),
      }))
      .filter(
        ({ flow, session }) =>
          !!session &&
          flow.aResultStatus === "Submitted" &&
          (!flow.backToBackEnabled || flow.bResultStatus === "Submitted") &&
          !flow.sampledForQC &&
          flow.currentState !== "Final Result Ready",
      );
  };

  const exportTaskToByteHi = (task: CaseSet) => {
    const rows = sessions
      .filter((s) => s.taskId === task.taskId)
      .map((s) => [
        s.sessionId,
        s.status,
        s.annotator ?? "",
        s.bot?.sqsTotal?.toFixed(2) ?? "",
        s.bot?.uesTotal?.toFixed(2) ?? "",
        s.bot?.userSatisfaction?.toFixed(2) ?? "",
      ]);

    downloadCsv(
      `${task.taskId}_bytehi_export.csv`,
      ["session_id", "status", "annotator", "sqs_total", "ues_total", "user_satisfaction"],
      rows,
    );
  };

  return (
    <Layout>
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight text-ink">Manual Annotation Tool</h1>
        <div className="flex items-center gap-2">
          {vendor ? (
            <Button icon={SettingsIcon} onClick={() => navigate("/settings")}>
              Settings
            </Button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Rule toggle + filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-line bg-white p-1">
            {(["new", "old"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRule(r)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  rule === r
                    ? "bg-brand text-white"
                    : "text-subtle hover:text-ink"
                }`}
              >
                {r === "old" ? "Old Rule" : "New Rule"}
              </button>
            ))}
          </div>

          {rule === "new" && (
            <>
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
              <label className="flex items-center gap-1.5 text-xs text-subtle">
                Task type
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                  className="h-8 rounded-md border border-line bg-white px-2 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="All">All</option>
                  <option value="Chatbot">Chatbot</option>
                  <option value="Ticket">Ticket</option>
                </select>
              </label>
            </>
          )}
        </div>

        {rule === "old" ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-subtle">
            Old Rule workspace is isolated from New Rule (GE Rate / P-Q-I).
            <br />
            This demo focuses on New Rule — switch back to continue.
          </div>
        ) : (
          <>
            {/* Task list */}
            <div className="overflow-hidden rounded-xl border border-line bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Task Type</th>
                      <th className="px-4 py-3 font-medium">Task Name</th>
                      <th className="px-4 py-3 font-medium">Back-to-Back</th>
                      <th className="px-4 py-3 font-medium">Cases</th>
                      <th className="px-4 py-3 font-medium">Assigned</th>
                      <th className="px-4 py-3 font-medium">Annotation Rate</th>
                      <th className="px-4 py-3 font-medium">Back-to-Back Complete Rate</th>
                      <th className="px-4 py-3 font-medium">QC Complete</th>
                      <th className="px-4 py-3 font-medium">SQS Pass Rate</th>
                      <th className="px-4 py-3 font-medium">SQS Avg</th>
                      <th className="px-4 py-3 font-medium">UES Avg</th>
                      <th className="px-4 py-3 font-medium">User Satisfaction</th>
                      <th className="px-4 py-3 font-medium">QC Accuracy</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((t) => {
                      const stats = taskStats(t.taskId);
                      return (
                        <tr
                          key={t.taskId}
                          className="border-b border-line last:border-0 hover:bg-page"
                        >
                          <td className="px-4 py-3">
                            <Badge tone="neutral">{t.source}</Badge>
                          </td>
                          <td className="px-4 py-3 text-subtle">{t.taskType}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-ink">{t.taskName}</div>
                            <div className="text-xs text-muted">{t.ruleVersion}</div>
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              const mode = taskMode(t.taskId);
                              if (mode === "Unassigned") return <Badge tone="neutral">未分配</Badge>;
                              if (mode === "B2B") return <Badge tone="brand">Back-to-Back</Badge>;
                              return <Badge tone="success">Normal</Badge>;
                            })()}
                          </td>
                          <td className="px-4 py-3 font-mono text-ink">{stats.total}</td>
                          <td className="px-4 py-3 font-mono text-ink">
                            {stats.assigned}
                            <span className="text-muted"> / {stats.total}</span>
                          </td>
                          {/* Annotation Rate — top (A) row completion, all cases */}
                          <td className="px-4 py-3">
                            {stats.annPct === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <span className="font-mono text-ink">
                                  {stats.aDone}
                                  <span className="text-muted"> / {stats.aTotal}</span>
                                </span>
                                <span className="text-xs text-subtle">({stats.annPct.toFixed(0)}%)</span>
                              </span>
                            )}
                          </td>
                          {/* B2B Complete Rate — expanded (B) row completion, back-to-back only */}
                          <td className="px-4 py-3">
                            {stats.b2bPct === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <span className="font-mono text-ink">
                                  {stats.bDone}
                                  <span className="text-muted"> / {stats.btbCases}</span>
                                </span>
                                <span className="text-xs text-subtle">({stats.b2bPct.toFixed(0)}%)</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {stats.qcTotal > 0 ? (
                              <span className="font-mono text-ink" title="QC finalized / sampled">
                                {stats.qcDone}
                                <span className="text-muted"> / {stats.qcTotal}</span>
                              </span>
                            ) : (
                              <span className="font-mono text-muted">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-ink">{stats.sqsPassRate}</td>
                          <td className="px-4 py-3 font-mono text-ink">{stats.sqsAvg}</td>
                          <td className="px-4 py-3 font-mono text-ink">{stats.uesAvg}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-md bg-brand-light px-2 py-1 font-mono text-sm font-semibold text-brand">
                              {stats.userSatisfactionAvg}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-medium text-brand">{stats.qcAccuracy}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                icon={Eye}
                                onClick={() => navigate(`/task/${t.taskId}`)}
                              >
                                Detail
                              </Button>
                              {!vendor && (
                                <>
                                  <Button
                                    variant="ghost"
                                    icon={Users}
                                    onClick={() => setAssignTask(t)}
                                  >
                                    Batch Assign
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    icon={ShieldCheck}
                                    onClick={() => setSamplingTaskId(t.taskId)}
                                  >
                                    Sampling
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    onClick={() => exportTaskToByteHi(t)}
                                  >
                                    Export to ByteHi
                                  </Button>
                                  <DownloadCsvMenu taskId={t.taskId} label="Download" />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {assignTask && (
        <AssignModal
          session={null}
          remainingCases={
            sessions.filter((s) => s.taskId === assignTask.taskId && s.status === "Unassigned").length
          }
          lockedMode={(() => {
            // If the task already has any flow, lock the mode to it (a task set
            // is uniformly one mode — no mixing normal + back-to-back).
            const taskFlows = reviewFlows.filter((f) =>
              sessions.some((s) => s.sessionId === f.sessionId && s.taskId === assignTask.taskId),
            );
            return taskFlows.length > 0 ? taskFlows.some((f) => f.backToBackEnabled) : undefined;
          })()}
          onClose={() => setAssignTask(null)}
          onConfirm={(config) => {
            try {
              distributeTaskCases(assignTask.taskId, config, currentEmail);
              navigate(`/task/${assignTask.taskId}`);
            } catch (e) {
              alert(e instanceof Error ? e.message : "分配失败");
            }
          }}
        />
      )}

      {samplingTaskId && (() => {
        const meta = caseSets.find((t) => t.taskId === samplingTaskId);
        const pool = qcPool(samplingTaskId);
        // Completed cases: A submitted (plus B if back-to-back) — the denominator.
        const completed = reviewFlows.filter(
          (f) =>
            sessions.some((s) => s.sessionId === f.sessionId && s.taskId === samplingTaskId) &&
            f.aResultStatus === "Submitted" &&
            (!f.backToBackEnabled || f.bResultStatus === "Submitted"),
        ).length;
        return (
          <SamplingModal
            taskId={samplingTaskId}
            taskName={meta?.taskName ?? samplingTaskId}
            totalCompleted={completed}
            pool={pool}
            currentEmail={currentEmail}
            onClose={() => setSamplingTaskId(null)}
            onConfirmed={(taskId) => {
              setSamplingTaskId(null);
              // QC now happens on the task's Detail page.
              navigate(`/task/${taskId}`);
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
      {importModal === "csv" && (
        <NewAnnotationTaskModal onClose={() => setImportModal(null)} />
      )}

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setResetOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-danger" />
              <h3 className="text-base font-semibold text-ink">Clear All Data（格式化）</h3>
            </div>
            <p className="mt-2 text-sm text-subtle">
              这会清空所有分配、标注、QC 和活动日志，把全部 session 重置为未分配的空白起点。此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setResetOpen(false)}
                className="rounded-md border border-line px-4 py-2 text-sm text-subtle hover:bg-page"
              >
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
