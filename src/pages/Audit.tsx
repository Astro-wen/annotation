import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileSearch, X } from "lucide-react";
import Layout from "@/components/Layout";
import { PageHeader, Button } from "@/components/ui";
import Badge from "@/components/Badge";
import { caseSets } from "@/mock/caseSets";
import { useCurrentUserStore } from "@/lib/currentUser";
import { useSessionStore } from "@/store/sessionStore";
import type { SamplingConfig } from "@/store/sessionStore";
import type { ReviewFlow } from "@/mock/types";
import { hasABDiff, hasCDiff } from "@/lib/diff";

function passFilters(
  flow: ReviewFlow,
  mode: "All" | "Double-blind" | "Normal",
  diff: "All" | "A/B Diff" | "C Diff" | "No Diff",
  cStatus: "All" | "Pending" | "Final Result Ready",
): boolean {
  // A case is double-blind (back-to-back) only once a second reviewer (B) has
  // actually submitted; otherwise it's Normal (A only so far).
  const isDouble = flow.bResultStatus === "Submitted";
  if (mode === "Double-blind" && !isDouble) return false;
  if (mode === "Normal" && isDouble) return false;
  if (diff !== "All") {
    const ab = isDouble && hasABDiff(flow); // A vs B disagreement (double-blind)
    const cd = hasCDiff(flow); // C overwrote the baseline (A or A/B)
    if (diff === "A/B Diff" && !ab) return false;
    if (diff === "C Diff" && !cd) return false;
    if (diff === "No Diff" && (ab || cd)) return false;
  }
  const isFinal = flow.currentState === "Final Result Ready";
  if (cStatus === "Final Result Ready" && !isFinal) return false;
  if (cStatus === "Pending" && isFinal) return false;
  return true;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-subtle">
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink outline-none focus:border-brand"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Audit() {
  const navigate = useNavigate();
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  const reviewFlows = useSessionStore((s) => s.reviewFlows);
  const sessions = useSessionStore((s) => s.sessions);
  const startSampling = useSessionStore((s) => s.startSampling);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [samplingTaskId, setSamplingTaskId] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<"All" | "Double-blind" | "Normal">("All");
  const [diffFilter, setDiffFilter] = useState<"All" | "A/B Diff" | "C Diff" | "No Diff">("All");
  const [cStatusFilter, setCStatusFilter] = useState<"All" | "Pending" | "Final Result Ready">("All");
  const [scope, setScope] = useState<SamplingConfig["scope"]>("all_qas");
  const [method, setMethod] = useState<SamplingConfig["method"]>("percentage");
  const [value, setValue] = useState(10);
  const [qaEmail, setQaEmail] = useState("");

  const flowRows = useMemo(
    () =>
      reviewFlows
        .map((flow) => ({
          flow,
          session: sessions.find((session) => session.sessionId === flow.sessionId),
        }))
        .filter((row) => row.session),
    [reviewFlows, sessions],
  );

  // A case enters QC once it's "complete":
  //  - Normal: A submitted.
  //  - Back-to-Back: both A and B submitted (double-blind needs both halves).
  const completedRows = useMemo(
    () =>
      flowRows.filter(({ flow }) =>
        flow.aResultStatus === "Submitted" &&
        (!flow.backToBackEnabled || flow.bResultStatus === "Submitted"),
      ),
    [flowRows],
  );

  const taskSummaries = useMemo(() => {
    const taskIds = new Set<string>(caseSets.map((task) => task.taskId));
    completedRows.forEach((row) => {
      if (row.session?.taskId) taskIds.add(row.session.taskId);
    });

    return Array.from(taskIds).map((taskId) => {
      const meta = caseSets.find((task) => task.taskId === taskId);
      const rows = completedRows.filter((row) => row.session?.taskId === taskId);
      const sampledRows = rows.filter((row) => row.flow.sampledForQC || row.flow.currentState === "Final Result Ready");
      const readyCount = sampledRows.filter((row) => row.flow.currentState === "Final Result Ready").length;
      // Cases still available for a new sampling batch (not yet sampled, not final).
      const poolCount = rows.filter(
        (row) => !row.flow.sampledForQC && row.flow.currentState !== "Final Result Ready",
      ).length;
      return {
        taskId,
        taskName: meta?.taskName ?? taskId,
        sampleName: meta?.sampleName ?? "Imported Sample",
        taskType: meta?.taskType ?? "Chatbot",
        source: meta?.source ?? "Import",
        rows,
        sampledRows,
        readyCount,
        poolCount,
      };
    });
  }, [completedRows]);

  const selectedTask = taskSummaries.find((task) => task.taskId === selectedTaskId) ?? null;
  const samplingTask = taskSummaries.find((task) => task.taskId === samplingTaskId) ?? null;
  // Pool that a new sampling batch can actually draw from: A submitted, not yet
  // sampled in a prior batch, not finalized. Mirrors the store's eligibility so
  // the modal estimate matches the real result.
  const samplingPool = useMemo(
    () =>
      (samplingTask?.rows ?? []).filter(
        (row) => !row.flow.sampledForQC && row.flow.currentState !== "Final Result Ready",
      ),
    [samplingTask],
  );
  // QAs who still have un-sampled cases in this task (as A or B reviewer).
  const qaOptions = useMemo(
    () =>
      Array.from(
        new Set(
          samplingPool.flatMap((row) =>
            [
              row.flow.aAnnotator ?? row.flow.aAssignee,
              row.flow.bAnnotator ?? row.flow.bAssignee,
            ].filter(Boolean),
          ),
        ),
      ) as string[],
    [samplingPool],
  );
  const samplingBaseRows = useMemo(() => {
    if (scope === "by_qa" && qaEmail) {
      // A QA counts if they participated as either first (A) or second (B) reviewer.
      return samplingPool.filter((row) => {
        const aPerson = row.flow.aAnnotator ?? row.flow.aAssignee;
        const bPerson = row.flow.bAnnotator ?? row.flow.bAssignee;
        return aPerson === qaEmail || bPerson === qaEmail;
      });
    }
    return samplingPool;
  }, [samplingPool, scope, qaEmail]);
  const sampleValue = method === "percentage" ? Math.min(Math.max(value, 0), 100) : Math.max(value, 0);
  const estimatedSamples =
    method === "percentage"
      ? sampleValue <= 0
        ? 0
        : Math.max(samplingBaseRows.length > 0 ? 1 : 0, Math.round((samplingBaseRows.length * sampleValue) / 100))
      : Math.min(sampleValue, samplingBaseRows.length);

  return (
    <Layout>
      <PageHeader
        title="Audit Review"
        subtitle={
          selectedTask
            ? `${selectedTask.taskName} · C sample QC sessions`
            : "QC 只保留 C sample QC · Back-to-back 是 QC 前置，不在 Audit Portal 里处理"
        }
      />

      <div className="space-y-4 p-6">
        <div className="rounded-lg border border-line bg-brand-light px-4 py-3 text-sm text-brand">
          Audit Portal 现在只负责 C sample QC。A / B 只在标注前置流程里完成；如果开启 back-to-back，必须等 B 评完之后，case 才会进入可抽样状态。
        </div>

        {!selectedTask ? (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-3 font-medium">Case Set</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Task Type</th>
                  <th className="px-4 py-3 font-medium">Completed Annotations</th>
                  <th className="px-4 py-3 font-medium">Sampled for C</th>
                  <th className="px-4 py-3 font-medium">Final Ready</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {taskSummaries.map((task) => (
                  <tr key={task.taskId} className="border-b border-line last:border-0 hover:bg-page">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{task.taskName}</div>
                      <div className="text-xs text-muted">{task.sampleName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="neutral">{task.source}</Badge>
                    </td>
                    <td className="px-4 py-3 text-subtle">{task.taskType}</td>
                    <td className="px-4 py-3 font-mono text-ink">{task.rows.length}</td>
                    <td className="px-4 py-3 font-mono text-brand">{task.sampledRows.length}</td>
                    <td className="px-4 py-3 font-mono text-success">{task.readyCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(() => {
                          // Still QC to do when some sampled cases aren't finalized.
                          const pendingQC = task.sampledRows.length - task.readyCount > 0;
                          const label = pendingQC ? "Start QC" : "View Result";
                          return (
                            <button
                              onClick={() => setSelectedTaskId(task.taskId)}
                              className={`rounded-md px-3 py-2 text-sm font-medium ${
                                pendingQC
                                  ? "bg-brand text-white hover:opacity-90"
                                  : "border border-line bg-white text-ink hover:bg-page"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })()}
                        <button
                          onClick={() => setSamplingTaskId(task.taskId)}
                          disabled={task.poolCount === 0}
                          className="rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-subtle hover:bg-page hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Set Sampling
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">{selectedTask.taskName}</p>
                <p className="text-xs text-subtle">
                  {selectedTask.sampleName} · {selectedTask.sampledRows.length} sampled sessions for C
                </p>
              </div>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="flex items-center gap-1.5 text-sm font-medium text-subtle hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Case Sets
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3">
              <FilterSelect label="Review Mode" value={modeFilter} onChange={(v) => setModeFilter(v as typeof modeFilter)} options={["All", "Double-blind", "Normal"]} />
              <FilterSelect label="Diff" value={diffFilter} onChange={(v) => setDiffFilter(v as typeof diffFilter)} options={["All", "A/B Diff", "C Diff", "No Diff"]} />
              <FilterSelect label="C Status" value={cStatusFilter} onChange={(v) => setCStatusFilter(v as typeof cStatusFilter)} options={["All", "Pending", "Final Result Ready"]} />
              <span className="ml-auto text-xs text-subtle">
                {selectedTask.sampledRows
                  .filter((r) => passFilters(r.flow, modeFilter, diffFilter, cStatusFilter))
                  .length}{" "}
                / {selectedTask.sampledRows.length} sessions
              </span>
            </div>

            {selectedTask.sampledRows.length === 0 && (
              <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-subtle">
                No Result
              </div>
            )}

            {selectedTask.sampledRows
              .filter((r) => passFilters(r.flow, modeFilter, diffFilter, cStatusFilter))
              .map(({ flow, session }) => {
              const isDouble = flow.bResultStatus === "Submitted";
              const diff = isDouble && hasABDiff(flow);
              const cDiff = hasCDiff(flow);
              return (
              <div key={flow.sessionId} className="rounded-xl border border-line bg-white p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-ink">{flow.sessionId}</span>
                    <Badge tone="neutral">{session?.knowledgeSource}</Badge>
                    <Badge tone={isDouble ? "brand" : "neutral"}>
                      {isDouble ? "Double-blind" : "Normal"}
                    </Badge>
                    {isDouble && (
                      <Badge tone={diff ? "danger" : "success"}>{diff ? "A/B Diff" : "A/B Same"}</Badge>
                    )}
                    {flow.currentState === "Final Result Ready" && (
                      <Badge tone={cDiff ? "danger" : "success"}>
                        {cDiff ? "C Overwrote" : "C Unchanged"}
                      </Badge>
                    )}
                    <Badge tone={flow.currentState === "Final Result Ready" ? "success" : "brand"}>
                      {flow.currentState === "Final Result Ready" ? "Final Result Ready" : "C Sample QC"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {flow.currentState !== "Final Result Ready" ? (
                      <Button variant="primary" icon={FileSearch} onClick={() => navigate(`/audit/review/${flow.sessionId}`)}>
                        C Review
                      </Button>
                    ) : (
                      <Button onClick={() => navigate(`/audit/review/${flow.sessionId}`)}>
                        View Final
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-3 text-xs text-subtle">
                  <span>A: <span className="font-medium text-ink">{flow.aAnnotator ?? flow.aAssignee ?? "—"}</span></span>
                  <span>B: <span className="font-medium text-ink">{isDouble ? (flow.bAnnotator ?? flow.bAssignee ?? "—") : "N/A"}</span></span>
                  <span>C: <span className="font-medium text-ink">{flow.cReviewer ?? currentEmail}</span></span>
                  <span>Subtype: <span className="font-medium text-ink">{session?.serviceSubtype ?? "—"}</span></span>
                </div>

                <div className="rounded-lg border border-line bg-page px-4 py-3 text-xs text-subtle">
                  <p>
                    Pre-QC annotation completed by{" "}
                    <span className="font-medium text-ink">
                      {isDouble
                        ? `${flow.aAnnotator ?? flow.aAssignee ?? "A"} + ${flow.bAnnotator ?? flow.bAssignee ?? "B"}`
                        : flow.aAnnotator ?? flow.aAssignee ?? "A"}
                    </span>
                    . Sample batch: <span className="font-medium text-ink">{flow.sampleBatchLabel ?? "manual sample"}</span>
                  </p>
                  <p className="mt-1">C 可以直接 overwrite A / B 的结果，并提交为最终结果。</p>
                </div>
              </div>
              );
            })}
          </>
        )}
      </div>

      {samplingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h3 className="text-xl font-semibold text-ink">Set sampling size</h3>
                <p className="mt-1 text-sm text-subtle">
                  Available to sample: <span className="font-semibold text-ink">{samplingPool.length}</span>{" "}
                  of {samplingTask.rows.length} completed cases
                </p>
              </div>
              <button onClick={() => setSamplingTaskId(null)} className="text-subtle hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setScope("all_qas")}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                    scope === "all_qas" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"
                  }`}
                >
                  All QAs
                </button>
                <button
                  onClick={() => setScope("by_qa")}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                    scope === "by_qa" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"
                  }`}
                >
                  By QA
                </button>
              </div>

              {scope === "by_qa" && (
                <select
                  value={qaEmail}
                  onChange={(e) => setQaEmail(e.target.value)}
                  className="h-12 w-full rounded-xl border border-line bg-page px-4 text-sm text-ink outline-none focus:border-brand"
                >
                  <option value="">Select QA</option>
                  {qaOptions.map((qa) => (
                    <option key={qa} value={qa}>
                      {qa}
                    </option>
                  ))}
                </select>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMethod("percentage")}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                    method === "percentage" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"
                  }`}
                >
                  Percentage (%)
                </button>
                <button
                  onClick={() => setMethod("absolute")}
                  className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                    method === "absolute" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"
                  }`}
                >
                  Absolute number
                </button>
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-page px-4 py-4">
                <input
                  type="number"
                  min={1}
                  max={method === "percentage" ? 100 : undefined}
                  value={value}
                  onChange={(e) => setValue(Number(e.target.value))}
                  className="h-11 flex-1 rounded-xl border border-line bg-white px-4 text-lg font-semibold text-ink outline-none focus:border-brand"
                />
                <span className="text-2xl font-semibold text-subtle">
                  {method === "percentage" ? "%" : "cases"}
                </span>
              </div>

              <p className="text-center text-base text-subtle">
                Estimated samples: <span className="font-semibold text-brand">{estimatedSamples}</span> cases
              </p>
            </div>

            <div className="flex items-center justify-end gap-4 px-6 pb-5">
              <button onClick={() => setSamplingTaskId(null)} className="text-sm font-medium text-brand hover:underline">
                Cancel
              </button>
              <button
                onClick={() => {
                  startSampling(
                    samplingTask.taskId,
                    {
                      scope,
                      qaEmail: scope === "by_qa" ? qaEmail : undefined,
                      method,
                      value: sampleValue,
                    },
                    currentEmail,
                  );
                  setSamplingTaskId(null);
                  setSelectedTaskId(samplingTask.taskId);
                  // Reset modal state for the next open.
                  setScope("all_qas");
                  setMethod("percentage");
                  setValue(10);
                  setQaEmail("");
                }}
                disabled={estimatedSamples === 0 || (scope === "by_qa" && !qaEmail)}
                className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start sampling
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
