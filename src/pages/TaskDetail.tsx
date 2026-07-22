import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Ban,
  RotateCcw,
  X,
  Download,
} from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui";
import Badge, { statusTone } from "@/components/Badge";
import DownloadCsvMenu from "@/components/DownloadCsvMenu";
import { USER_OPTIONS, useCurrentUserStore, isViewer, shortNameOf } from "@/lib/currentUser";
import { canToggleInvalid, passesAntiSelfReview, samePerson } from "@/lib/access";
import { downloadCsv } from "@/lib/csv";
import { caseSets } from "@/mock/caseSets";
import { type CaseRow, type ProblemType, type ScoreSnapshot, resultGroupOf } from "@/mock/types";
import { useRubricStore } from "@/store/rubricStore";
import {
  useSessionStore,
  type CaseFlow,
  type RoundResult,
  caseStatus,
  effectiveRound,
  slotStatus,
} from "@/store/sessionStore";
import { RESULT_GROUPS, individualMetricsForType } from "@/lib/aggregate";
import { formatAccuracy } from "@/lib/scoring";

const PROCESS_STATUSES = [
  "All",
  "Unassigned",
  "Assigned",
  "Submitted (No QC)",
  "待拉齐（Diff）",
  "Waiting for QC",
  "QC Completed",
  "Invalid",
] as const;

export default function TaskDetail() {
  const { taskId = "" } = useParams();
  const navigate = useNavigate();
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  const viewer = isViewer(currentEmail);

  const cases = useSessionStore((s) => s.cases);
  const flows = useSessionStore((s) => s.flows);
  const assignSingleCase = useSessionStore((s) => s.assignSingleCase);
  const reconcileDiff = useSessionStore((s) => s.reconcileDiff);
  const markInvalid = useSessionStore((s) => s.markInvalid);
  const restoreInvalid = useSessionStore((s) => s.restoreInvalid);
  const batchEdit = useSessionStore((s) => s.batchEdit);
  const getLogs = useSessionStore((s) => s.getLogs);
  const activeRubricForVersion = useRubricStore((s) => s.activeRubricForVersion);
  const skipReasonsForVersion = useRubricStore((s) => s.skipReasonsForVersion);

  const meta = caseSets.find((c) => c.taskId === taskId);
  const flowOf = (caseId: string) => flows.find((f) => f.caseId === caseId);

  // ---- filters / toolbar state ----
  const [fSubtype, setFSubtype] = useState("All");
  const [fSource, setFSource] = useState("All");
  const [fProblem, setFProblem] = useState<"All" | ProblemType>("All");
  const [fStatus, setFStatus] = useState<(typeof PROCESS_STATUSES)[number]>("All");
  const [sqsExpanded, setSqsExpanded] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [assignModal, setAssignModal] = useState<{ caseId: string; slot: "A" | "B" } | null>(null);
  const [reconcileCaseId, setReconcileCaseId] = useState<string | null>(null);
  const [logCaseId, setLogCaseId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<{ version: number; snap: ScoreSnapshot } | null>(null);

  const taskCases = useMemo(() => cases.filter((c) => c.taskId === taskId), [cases, taskId]);
  const ruleVersion = taskCases[0]?.ruleVersion ?? 1;
  const rubricDims = activeRubricForVersion(ruleVersion);
  const skipReasons = skipReasonsForVersion(ruleVersion);
  const sqsDims = rubricDims.filter((d) => d.group === "SQS");
  const uefDims = rubricDims.filter((d) => d.group === "UEF");

  const matchesFilters = (c: CaseRow): boolean => {
    const f = flowOf(c.caseId);
    const subtypes = c.expectedResults.flatMap((r) => r.serviceSubtypes);
    if (fSubtype !== "All" && !subtypes.includes(fSubtype as never)) return false;
    if (fSource !== "All" && c.knowledgeSource !== fSource) return false;
    if (fProblem !== "All") {
      const eff = effectiveRound(f);
      const pts = eff ? Object.values(eff.results).map((r) => r.problemType) : [];
      if (!pts.includes(fProblem)) return false;
    }
    if (fStatus !== "All") {
      const st = caseStatus(c, f);
      if (fStatus === "待拉齐（Diff）" ? st !== "待拉齐（Diff）" : st !== fStatus) return false;
    }
    return true;
  };

  const visibleCases = taskCases.filter(matchesFilters);

  const toggleExpand = (caseId: string) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });

  // Expandable = any case that has a flow (matches the row-level `expandable`),
  // and is currently visible under the active filters.
  const expandableIds = visibleCases
    .filter((c) => !!flowOf(c.caseId))
    .map((c) => c.caseId);
  const allExpanded = expandableIds.length > 0 && expandableIds.every((id) => expandedRows.has(id));
  const toggleExpandAll = () => setExpandedRows(allExpanded ? new Set() : new Set(expandableIds));

  const toggleSelect = (caseId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });

  // All participants (A/B annotators) and their four-group personal Accuracy —
  // shown directly at the top of Detail, no per-person filter required (spec §5.5).
  const participants = useMemo(() => {
    const set = new Set<string>();
    taskCases.forEach((c) => {
      const f = flowOf(c.caseId);
      [f?.aResult?.by ?? f?.aAssignee, f?.bResult?.by ?? f?.bAssignee].forEach((p) => p && set.add(p));
    });
    return Array.from(set);
  }, [taskCases, flows]);

  const rowsForAcc = taskCases.map((row) => ({ row, flow: flowOf(row.caseId) }));
  const personalAccuracy = participants.map((email) => ({
    email,
    groups: RESULT_GROUPS.map((rt) => individualMetricsForType(rowsForAcc, rt, email).qcAccuracy),
  }));

  // ---- score cell helpers ----
  const scoreCells = (row: CaseRow, round: RoundResult | undefined, group: "SQS" | "UEF", finalRound?: RoundResult) => {
    return (
      <div className="space-y-1">
        {row.expectedResults.map((er) => {
          const s = round?.results[er.resultId];
          const val = !s ? "—" : group === "SQS" ? s.sqsAvg.toFixed(2) : s.uefTotal.toFixed(2);
          const fs = finalRound?.results[er.resultId];
          const fVal = !fs ? undefined : group === "SQS" ? fs.sqsAvg.toFixed(2) : fs.uefTotal.toFixed(2);
          const changed = finalRound && fVal !== undefined && fVal !== val;
          return (
            <div key={er.resultId} className="flex items-center gap-1 font-mono text-xs">
              <span className="w-20 text-[10px] uppercase text-muted">{resultGroupOf(er)}</span>
              {changed ? (
                <span>
                  <span className="text-muted line-through">{val}</span>
                  <span className="ml-1 font-semibold text-brand">{fVal}</span>
                </span>
              ) : (
                <span className="text-ink">{val}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Per-dimension cell. When `finalRound` is given (the reconciled/finalized
  // baseline), a dimension whose raw value differs from the final one is shown as
  // the original struck-through followed by the reconciled value, so 拉齐结果 is visible.
  const dimCells = (row: CaseRow, round: RoundResult | undefined, dimKey: string, finalRound?: RoundResult) => (
    <div className="space-y-1">
      {row.expectedResults.map((er) => {
        const s = round?.results[er.resultId];
        const skipped = s?.skips?.[dimKey] !== undefined;
        const v = s?.scores[dimKey];
        const raw = skipped ? "Skip" : v === undefined ? "—" : v;
        // compare with finalized baseline for this dim
        const fs = finalRound?.results[er.resultId];
        const fSkipped = fs?.skips?.[dimKey] !== undefined;
        const fv = fs?.scores[dimKey];
        const fin = fSkipped ? "Skip" : fv === undefined ? undefined : fv;
        const changed = finalRound && fin !== undefined && String(raw) !== String(fin);
        return (
          <div key={er.resultId} className="font-mono text-xs text-ink" title={skipped ? s?.skips?.[dimKey] : undefined}>
            {changed ? (
              <span>
                <span className="text-muted line-through">{raw}</span>
                <span className="ml-1 font-semibold text-brand">{fin}</span>
              </span>
            ) : skipped ? (
              <span className="text-[#B45309]">Skip</span>
            ) : (
              raw
            )}
          </div>
        );
      })}
    </div>
  );

  const uxsCell = (row: CaseRow, round: RoundResult | undefined) => (
    <div className="space-y-1">
      {row.expectedResults.map((er) => {
        const s = round?.results[er.resultId];
        return (
          <span key={er.resultId} className="inline-flex items-center rounded-md bg-brand-light px-2 py-0.5 font-mono text-xs font-semibold text-brand">
            {s ? s.uxs.toFixed(2) : "—"}
          </span>
        );
      })}
    </div>
  );

  const subtypeCell = (row: CaseRow) => (
    <div className="flex flex-wrap gap-1">
      {Array.from(new Set(row.expectedResults.flatMap((r) => r.serviceSubtypes))).map((st) => (
        <Badge key={st} tone="neutral">{st}</Badge>
      ))}
    </div>
  );

  // Colspan for dynamic dimension columns.
  const totalCols = 9 + (sqsExpanded ? sqsDims.length : 0);

  const exportLog = (caseId: string) => {
    const logs = getLogs(caseId);
    downloadCsv(
      `${caseId}_activity_log.csv`,
      ["time", "operator", "role", "action", "result_type", "version", "detail"],
      logs.map((l) => [l.at, l.operator, l.role ?? "", l.action, l.resultType ?? "", l.version ? `V${l.version}` : "", l.detail ?? ""]),
    );
  };

  if (!meta) {
    return (
      <Layout>
        <div className="p-10 text-sm text-subtle">Task not found. <button className="text-brand underline" onClick={() => navigate("/home")}>Back to Home</button></div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <div>
          <button onClick={() => navigate("/home")} className="mb-1 flex items-center gap-1 text-xs text-subtle hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <h1 className="text-lg font-semibold text-ink">{meta.taskName}</h1>
          <p className="text-xs text-subtle">Detail · Session List · {taskId} · SQS (6) + UEF · User Experience Score (North Star) · Config {meta.ruleVersion}</p>
        </div>
        <DownloadCsvMenu taskId={taskId} label="Download CSV" />
      </div>

      {/* Personal Accuracy — all participants, four groups, no per-person filter. */}
      <div className="border-b border-line bg-white px-6 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Personal Accuracy（按结果组）</p>
        {personalAccuracy.length === 0 ? (
          <p className="text-xs text-muted">暂无参与标注员，或尚无可比较的 QC 结果。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[520px] text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-muted">
                  <th className="py-1 pr-4 text-left font-medium">标注员</th>
                  {RESULT_GROUPS.map((rt) => <th key={rt} className="px-3 py-1 text-center font-medium">{rt}</th>)}
                </tr>
              </thead>
              <tbody className="font-mono">
                {personalAccuracy.map((p) => (
                  <tr key={p.email} className="border-t border-line/60">
                    <td className="py-1 pr-4 font-sans text-ink">{shortNameOf(p.email)}</td>
                    {p.groups.map((acc, i) => (
                      <td key={i} className="px-3 py-1 text-center text-brand">{formatAccuracy(acc)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-6 py-3 text-xs">
        <button
          disabled={selected.size === 0 || viewer}
          onClick={() => setBatchOpen(true)}
          className="rounded-md border border-line px-3 py-1.5 font-medium text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-50"
        >
          Batch Edit ({selected.size})
        </button>
        <button onClick={toggleExpandAll} className="rounded-md border border-line px-3 py-1.5 text-ink hover:bg-page">{allExpanded ? "Collapse all" : "Expand all"}</button>

        <select value={fSubtype} onChange={(e) => setFSubtype(e.target.value)} className="h-8 rounded-md border border-line bg-white px-2 text-ink outline-none focus:border-brand">
          {["All", "CHATBOT", "TICKETBOT", "HUMAN_IM", "HUMAN_TICKET"].map((v) => <option key={v} value={v}>{v === "All" ? "Service Subtype: All" : v}</option>)}
        </select>
        <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="h-8 rounded-md border border-line bg-white px-2 text-ink outline-none focus:border-brand">
          {["All", "Skill", "FAQ", "SOP"].map((v) => <option key={v} value={v}>{v === "All" ? "Source: All" : v}</option>)}
        </select>
        <select value={fProblem} onChange={(e) => setFProblem(e.target.value as typeof fProblem)} className="h-8 rounded-md border border-line bg-white px-2 text-ink outline-none focus:border-brand">
          {["All", "R1", "R2", "R3"].map((v) => <option key={v} value={v}>{v === "All" ? "Problem Type: All" : v}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className="h-8 rounded-md border border-line bg-white px-2 text-ink outline-none focus:border-brand">
          {PROCESS_STATUSES.map((v) => <option key={v} value={v}>{v === "All" ? "流程状态: All" : v}</option>)}
        </select>
        <span className="ml-auto text-subtle">{visibleCases.length} cases</span>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
              <th className="w-8 px-2 py-3"></th>
              <th className="px-3 py-3 font-medium">Session ID</th>
              <th className="px-3 py-3 font-medium">Subtype</th>
              <th className="px-3 py-3 font-medium">Source</th>
              {sqsExpanded && sqsDims.map((d) => <th key={d.key} className="px-2 py-3 text-[10px] font-medium">{d.dimension}</th>)}
              <th className="px-3 py-3 font-medium">
                <button onClick={() => setSqsExpanded((v) => !v)} className="flex items-center gap-1">
                  SQS {sqsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
              </th>
              <th className="px-3 py-3 font-medium">UEF</th>
              <th className="px-3 py-3 font-medium">User Experience Score</th>
              <th className="px-3 py-3 font-medium">Transfer to human?</th>
              <th className="px-3 py-3 font-medium">Assign QA</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleCases.map((row) => {
              const flow = flowOf(row.caseId);
              const isB2B = flow?.mode === "Back-to-Back";
              // The main row is the Final Result; A/B/C live in the expandable rows.
              // Expandable once the case has been assigned (has a flow).
              const expandable = !!flow;
              const expanded = expandedRows.has(row.caseId);
              const status = caseStatus(row, flow);
              const eff = effectiveRound(flow);
              const invalid = row.invalid;
              const isDiff = flow?.reconcileStatus === "Pending";
              const canReconcile =
                !invalid && isDiff &&
                (samePerson(currentEmail, flow?.aResult?.by) || samePerson(currentEmail, flow?.bResult?.by));
              return (
                <>
                  {/* Main row = Final Result (QC > Baseline > —); A/B/C in expand. */}
                  <tr key={row.caseId} className={`border-b border-line align-top ${invalid ? "bg-gray-50 opacity-60" : "hover:bg-page"}`}>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <input type="checkbox" checked={selected.has(row.caseId)} onChange={() => toggleSelect(row.caseId)} disabled={invalid} />
                        {expandable && (
                          <button onClick={() => toggleExpand(row.caseId)} className="text-subtle">
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => navigate(`/annotate/${row.sessionId}`)} className="font-mono text-xs text-brand hover:underline">{row.sessionId}</button>
                      <div className="text-[10px] text-muted">Type {row.caseType} · {row.caseId}</div>
                    </td>
                    <td className="px-3 py-3">{subtypeCell(row)}</td>
                    <td className="px-3 py-3"><Badge tone={row.knowledgeSource === "SOP" ? "neutral" : "brand"}>{row.knowledgeSource}</Badge></td>
                    {sqsExpanded && sqsDims.map((d) => <td key={d.key} className="px-2 py-3">{dimCells(row, eff, d.key)}</td>)}
                    <td className="px-3 py-3">{scoreCells(row, eff, "SQS")}</td>
                    <td className="px-3 py-3">{scoreCells(row, eff, "UEF")}</td>
                    <td className="px-3 py-3">
                      {uxsCell(row, eff)}
                      {(() => {
                        // Final Result source label (spec §5.8): QC / Finalized Baseline / —.
                        const src = flow?.currentResult ? "QC" : flow?.finalizedBaseline ? "Finalized Baseline" : "—";
                        return (
                          <span className={`mt-1 block text-[10px] ${src === "QC" ? "text-brand" : src === "—" ? "text-muted" : "text-subtle"}`}>
                            来源：{src}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3"><Badge tone={row.transferToHuman ? "warning" : "neutral"}>{row.transferToHuman ? "Yes" : "No"}</Badge></td>
                    <td className="px-3 py-3">
                      {/* Final-level owners summary (details & re-assign live in A/B/C rows). */}
                      <div className="space-y-0.5 text-[11px]">
                        <div><span className="text-muted">标注</span> {shortNameOf(flow?.aAssignee)}</div>
                        {isB2B && <div><span className="text-muted">复评</span> {shortNameOf(flow?.bAssignee)}</div>}
                        <div><span className="text-muted">QC</span> {flow?.cReviewer ? <span className="text-brand">{shortNameOf(flow.cReviewer)}</span> : "—"}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><Badge tone={statusTone(status)}>{status}</Badge></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {/* Back-to-Back Diff: a single Reconcile entry at the Final level. */}
                        {canReconcile && (
                          <button onClick={() => setReconcileCaseId(row.caseId)} className="rounded-md bg-danger px-2 py-1 text-xs font-medium text-white">Reconcile</button>
                        )}
                        <button onClick={() => setLogCaseId(row.caseId)} className="text-subtle hover:text-ink" title="Activity Log"><FileText className="h-4 w-4" /></button>
                        {canToggleInvalid(currentEmail, status) && (
                          invalid ? (
                            <button onClick={() => restoreInvalid(row.caseId, currentEmail)} className="text-subtle hover:text-ink" title="Restore"><RotateCcw className="h-4 w-4" /></button>
                          ) : (
                            <button onClick={() => markInvalid(row.caseId, currentEmail)} className="text-subtle hover:text-danger" title="Mark Invalid"><Ban className="h-4 w-4" /></button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* A row (expanded) */}
                  {expanded && (
                    <tr key={`${row.caseId}-A`} className="border-b border-line bg-gray-50 align-top text-xs">
                      <td className="px-2 py-2"></td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink">{shortNameOf(flow?.aAssignee)}</span>
                        <Badge tone="neutral" className="ml-1">标注</Badge>
                      </td>
                      <td className="px-3 py-2">{subtypeCell(row)}</td>
                      <td className="px-3 py-2"><Badge tone={row.knowledgeSource === "SOP" ? "neutral" : "brand"}>{row.knowledgeSource}</Badge></td>
                      {sqsExpanded && sqsDims.map((d) => <td key={d.key} className="px-2 py-2">{dimCells(row, flow?.aResult, d.key, isB2B ? flow?.finalizedBaseline : undefined)}</td>)}
                      <td className="px-3 py-2">{scoreCells(row, flow?.aResult, "SQS", isB2B ? flow?.finalizedBaseline : undefined)}</td>
                      <td className="px-3 py-2">{scoreCells(row, flow?.aResult, "UEF", isB2B ? flow?.finalizedBaseline : undefined)}</td>
                      <td className="px-3 py-2">{uxsCell(row, flow?.aResult)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2">
                        <button
                          disabled={invalid || viewer || !!flow?.finalizedBaseline}
                          onClick={() => setAssignModal({ caseId: row.caseId, slot: "A" })}
                          className="text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                        >
                          {flow?.aAssignee ? shortNameOf(flow.aAssignee) : "分配标注员"}
                        </button>
                      </td>
                      <td className="px-3 py-2"><Badge tone={statusTone(slotStatus(flow, "A"))}>{slotStatus(flow, "A")}</Badge></td>
                      <td className="px-3 py-2">
                        {canReconcile ? (
                          <button onClick={() => setReconcileCaseId(row.caseId)} className="rounded-md bg-danger px-2 py-1 font-medium text-white">Reconcile</button>
                        ) : (
                          <button onClick={() => navigate(`/annotate/${row.sessionId}?role=A`)} className="text-brand hover:underline">{flow?.aResult ? "View" : "Annotate"}</button>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* Second-reviewer row (double annotation) */}
                  {expanded && isB2B && (
                    <tr key={`${row.caseId}-B`} className="border-b border-line bg-gray-100 align-top text-xs">
                      <td className="px-2 py-2"></td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink">{shortNameOf(flow?.bAssignee)}</span>
                        <Badge tone="neutral" className="ml-1">复评</Badge>
                      </td>
                      <td className="px-3 py-2">{subtypeCell(row)}</td>
                      <td className="px-3 py-2"><Badge tone={row.knowledgeSource === "SOP" ? "neutral" : "brand"}>{row.knowledgeSource}</Badge></td>
                      {sqsExpanded && sqsDims.map((d) => <td key={d.key} className="px-2 py-2">{dimCells(row, flow?.bResult, d.key, flow?.finalizedBaseline)}</td>)}
                      <td className="px-3 py-2">{scoreCells(row, flow?.bResult, "SQS", flow?.finalizedBaseline)}</td>
                      <td className="px-3 py-2">{scoreCells(row, flow?.bResult, "UEF", flow?.finalizedBaseline)}</td>
                      <td className="px-3 py-2">{uxsCell(row, flow?.bResult)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2">
                        <button
                          disabled={invalid || viewer || !!flow?.finalizedBaseline}
                          onClick={() => setAssignModal({ caseId: row.caseId, slot: "B" })}
                          className="text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
                        >
                          {flow?.bAssignee ? shortNameOf(flow.bAssignee) : "分配复评"}
                        </button>
                      </td>
                      <td className="px-3 py-2"><Badge tone={statusTone(slotStatus(flow, "B"))}>{slotStatus(flow, "B")}</Badge></td>
                      <td className="px-3 py-2">
                        {flow?.reconcileStatus === "Pending" && (samePerson(currentEmail, flow.aResult?.by) || samePerson(currentEmail, flow.bResult?.by)) ? (
                          <button onClick={() => setReconcileCaseId(row.caseId)} className="rounded-md bg-danger px-2 py-1 font-medium text-white">Reconcile</button>
                        ) : (
                          <button onClick={() => navigate(`/annotate/${row.sessionId}?role=B`)} className="text-brand hover:underline">{flow?.bResult ? "View" : "Annotate"}</button>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* Review row (抽样复核) */}
                  {expanded && flow?.sampledForQC && (
                    <tr key={`${row.caseId}-C`} className="border-b border-line bg-brand-light/40 align-top text-xs">
                      <td className="px-2 py-2"></td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink">{shortNameOf(flow?.cReviewer)}</span>
                        <Badge tone="brand" className="ml-1">QC</Badge>
                      </td>
                      <td className="px-3 py-2">{subtypeCell(row)}</td>
                      <td className="px-3 py-2"><Badge tone={row.knowledgeSource === "SOP" ? "neutral" : "brand"}>{row.knowledgeSource}</Badge></td>
                      {sqsExpanded && sqsDims.map((d) => <td key={d.key} className="px-2 py-2">{dimCells(row, flow?.cResult, d.key)}</td>)}
                      <td className="px-3 py-2">{scoreCells(row, flow?.cResult, "SQS")}</td>
                      <td className="px-3 py-2">{scoreCells(row, flow?.cResult, "UEF")}</td>
                      <td className="px-3 py-2">{uxsCell(row, flow?.cResult)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"><Badge tone={flow?.qcCompleted ? "success" : "warning"}>{flow?.qcCompleted ? "QC 完成" : "待 QC"}</Badge></td>
                      <td className="px-3 py-2">
                        {(() => {
                          const isMyC = samePerson(currentEmail, flow?.cReviewer);
                          if (flow?.qcCompleted) {
                            const reQc = () => {
                              if (window.confirm("将覆盖已完成的 QC 结果，重新复核该 case。确定继续？")) {
                                navigate(`/annotate/${row.sessionId}?role=C`);
                              }
                            };
                            return (
                              <div className="flex items-center gap-2">
                                <button onClick={() => navigate(`/annotate/${row.sessionId}?role=C&view=1`)} className="text-brand hover:underline">View</button>
                                {isMyC && !viewer && <button onClick={reQc} className="text-subtle hover:text-ink hover:underline">Edit QC</button>}
                              </div>
                            );
                          }
                          const selfConflict = samePerson(currentEmail, flow?.aResult?.by) || samePerson(currentEmail, flow?.bResult?.by);
                          if (selfConflict) return <span className="text-muted">你已标过当前 session！</span>;
                          if (isMyC) return <button onClick={() => navigate(`/annotate/${row.sessionId}?role=C`)} className="rounded-md bg-brand px-2 py-1 font-medium text-white">Do QC</button>;
                          return <span className="text-muted">等待 QC</span>;
                        })()}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {visibleCases.length === 0 && (
              <tr><td colSpan={totalCols} className="px-4 py-10 text-center text-sm text-subtle">No cases match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Assign QA modal */}
      {assignModal && (
        <SingleAssignModal
          slot={assignModal.slot}
          currentEmail={currentEmail}
          conflictPeople={(() => {
            const f = flowOf(assignModal.caseId);
            return assignModal.slot === "A" ? [f?.bResult?.by ?? f?.bAssignee] : [f?.aResult?.by ?? f?.aAssignee];
          })()}
          onClose={() => setAssignModal(null)}
          onConfirm={(name) => {
            try {
              assignSingleCase(assignModal.caseId, assignModal.slot, name, currentEmail);
              setAssignModal(null);
            } catch (e) {
              alert(e instanceof Error ? e.message : "指派失败");
            }
          }}
        />
      )}

      {/* Reconcile modal */}
      {reconcileCaseId && (
        <ReconcileModal
          caseRow={taskCases.find((c) => c.caseId === reconcileCaseId)!}
          flow={flowOf(reconcileCaseId)!}
          sqsDims={sqsDims}
          uefDims={uefDims}
          skipReasons={skipReasons}
          ruleVersion={ruleVersion}
          onClose={() => setReconcileCaseId(null)}
          onConfirm={(agreed) => {
            reconcileDiff(reconcileCaseId, agreed, ruleVersion, currentEmail);
            setReconcileCaseId(null);
          }}
        />
      )}

      {/* Batch Edit modal */}
      {batchOpen && (
        <BatchEditModal
          dims={rubricDims}
          onClose={() => setBatchOpen(false)}
          onApply={(reasonByDim) => {
            batchEdit(Array.from(selected), reasonByDim, currentEmail);
            setBatchOpen(false);
            setSelected(new Set());
          }}
          note="批量修改选中 Case 当前生效结果的 reason；防自审与个人 Accuracy 归属不受影响。"
        />
      )}

      {/* Activity Log drawer */}
      {logCaseId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setLogCaseId(null)}>
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">Activity Log · {logCaseId}</h3>
              <div className="flex items-center gap-2">
                <Button icon={Download} onClick={() => exportLog(logCaseId)}>Export CSV</Button>
                <button onClick={() => setLogCaseId(null)} className="text-subtle hover:text-ink"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-left uppercase text-subtle">
                  <th className="py-2">Time</th><th className="py-2">Operator</th><th className="py-2">Role</th><th className="py-2">Action</th><th className="py-2">Version</th>
                </tr>
              </thead>
              <tbody>
                {getLogs(logCaseId).slice().reverse().map((l, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-2 font-mono text-[11px] text-muted">{l.at}</td>
                    <td className="py-2 text-ink">{shortNameOf(l.operator)}</td>
                    <td className="py-2 text-subtle">{l.role === "A" ? "标注" : l.role === "B" ? "复评" : l.role === "C" ? "QC" : "—"}</td>
                    <td className="py-2 text-ink">{l.action}{l.resultType ? `（${l.resultType}）` : ""}{l.detail ? <span className="block text-[10px] text-muted">{l.detail}</span> : null}</td>
                    <td className="py-2">
                      {l.version && l.snapshot ? (
                        <button onClick={() => setSnapshot({ version: l.version!, snap: l.snapshot! })} className="rounded bg-brand-light px-2 py-0.5 font-mono text-[11px] text-brand">V{l.version}</button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                {getLogs(logCaseId).length === 0 && <tr><td colSpan={5} className="py-6 text-center text-subtle">没有人做任何事</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Version snapshot */}
      {snapshot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setSnapshot(null)}>
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-ink">Scoring Snapshot · V{snapshot.version}</h4>
              <button onClick={() => setSnapshot(null)} className="text-subtle hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            {Object.entries(snapshot.snap.results).map(([rid, s]) => (
              <div key={rid} className="mb-3 rounded-lg border border-line p-3">
                <p className="mb-1 font-mono text-xs text-muted">{rid}</p>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(s.scores).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span className="text-subtle">{k}</span><span className="font-mono text-ink">{v}</span></div>
                  ))}
                  {Object.entries(s.skips ?? {}).map(([k, reason]) => (
                    <div key={k} className="flex justify-between" title={reason}><span className="text-subtle">{k}</span><span className="font-mono text-[#B45309]">Skip</span></div>
                  ))}
                </div>
                <p className="mt-2 font-mono text-xs text-brand">SQS {s.sqsAvg.toFixed(2)} · UEF {s.uefTotal.toFixed(2)} · UXS {s.uxs.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}

// ---- Assign QA (single case) ------------------------------------------------

function SingleAssignModal({
  slot,
  currentEmail,
  conflictPeople,
  onClose,
  onConfirm,
}: {
  slot: "A" | "B";
  currentEmail: string;
  conflictPeople: (string | undefined)[];
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const ok = name.trim() && passesAntiSelfReview(currentEmail, name, conflictPeople);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">{slot === "A" ? "分配标注员" : "分配复评标注员"}</h3>
          <button onClick={onClose} className="text-subtle hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <select value={name} onChange={(e) => setName(e.target.value)} className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white">
          <option value="">选择标注员…</option>
          {USER_OPTIONS.map((u) => <option key={u.email} value={u.email}>{u.label}</option>)}
        </select>
        {name && !ok && <p className="mt-2 text-xs text-danger">防自审：同一条 case 的两名标注员不能是同一人。</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-line px-4 py-2 text-sm text-subtle hover:bg-page">取消</button>
          <button disabled={!ok} onClick={() => onConfirm(name)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white disabled:bg-page disabled:text-subtle">确认</button>
        </div>
      </div>
    </div>
  );
}

// ---- Reconcile (拉齐) modal --------------------------------------------------

function ReconcileModal({
  caseRow,
  flow,
  sqsDims,
  uefDims,
  skipReasons,
  ruleVersion,
  onClose,
  onConfirm,
}: {
  caseRow: CaseRow;
  flow: CaseFlow;
  sqsDims: { key: string; dimension: string; options: number[] }[];
  uefDims: { key: string; dimension: string; options: number[] }[];
  skipReasons: string[];
  ruleVersion: number;
  onClose: () => void;
  onConfirm: (agreed: Record<string, import("@/mock/types").ResultScore>) => void;
}) {
  const dims = [...sqsDims, ...uefDims];
  const weights = useRubricStore((s) => s.weights);
  type Choice = number | { skip: string };
  // seed choices from A per result/dim (numeric score or Skip reason)
  const [choice, setChoice] = useState<Record<string, Record<string, Choice>>>(() => {
    const init: Record<string, Record<string, Choice>> = {};
    for (const er of caseRow.expectedResults) {
      const a = flow.aResult?.results[er.resultId];
      const row: Record<string, Choice> = {};
      for (const d of dims) {
        if (a?.skips?.[d.key] !== undefined) row[d.key] = { skip: a.skips[d.key] };
        else if (a?.scores[d.key] !== undefined) row[d.key] = a.scores[d.key];
      }
      init[er.resultId] = row;
    }
    return init;
  });

  const setNum = (rid: string, dimKey: string, v: number) =>
    setChoice((prev) => ({ ...prev, [rid]: { ...prev[rid], [dimKey]: v } }));
  const setSkip = (rid: string, dimKey: string) =>
    setChoice((prev) => ({ ...prev, [rid]: { ...prev[rid], [dimKey]: { skip: skipReasons[0] ?? "" } } }));

  const isSkip = (c?: Choice): c is { skip: string } => typeof c === "object" && c !== null;

  const build = () => {
    const out: Record<string, import("@/mock/types").ResultScore> = {};
    for (const er of caseRow.expectedResults) {
      const row = choice[er.resultId] ?? {};
      const scores: Record<string, number> = {};
      const skips: Record<string, string> = {};
      for (const d of dims) {
        const c = row[d.key];
        if (isSkip(c)) skips[d.key] = c.skip;
        else if (typeof c === "number") scores[d.key] = c;
      }
      const sqsNums = sqsDims.filter((d) => skips[d.key] === undefined).map((d) => scores[d.key] ?? 0);
      const sqsAvg = sqsNums.length ? sqsNums.reduce((a, b) => a + b, 0) / sqsNums.length : 0;
      const uefNums = uefDims.filter((d) => skips[d.key] === undefined).map((d) => scores[d.key] ?? 0);
      const uefTotal = uefNums.length ? uefNums.reduce((a, b) => a + b, 0) / uefNums.length : 0;
      const wSum = weights.sqsWeight + weights.uefWeight || 1;
      out[er.resultId] = { scores, skips, sqsAvg, uefTotal, uxs: (sqsAvg * weights.sqsWeight + uefTotal * weights.uefWeight) / wSum };
    }
    return out;
  };

  const fmtSide = (r?: import("@/store/sessionStore").RoundResult, rid?: string, key?: string) => {
    const s = rid && r ? r.results[rid] : undefined;
    if (s?.skips?.[key!] !== undefined) return "Skip";
    const v = key ? s?.scores[key] : undefined;
    return v ?? "—";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-lg font-semibold text-ink">拉齐分歧 · {caseRow.caseId}</h3>
          <button onClick={onClose} className="text-subtle hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <p className="text-xs text-subtle">逐维展示两名标注员的分歧，选择统一结论（一致维度自动沿用；可选数字或 Skip）。ruleVersion v{ruleVersion}。</p>
          {caseRow.expectedResults.map((er) => {
            const aRes = flow.aResult;
            const bRes = flow.bResult;
            return (
              <div key={er.resultId} className="rounded-lg border border-line p-3">
                <p className="mb-2 text-sm font-semibold text-ink">{resultGroupOf(er)} <span className="font-mono text-xs text-muted">{er.resultId}</span></p>
                <div className="space-y-2">
                  {dims.map((d) => {
                    const aVal = fmtSide(aRes, er.resultId, d.key);
                    const bVal = fmtSide(bRes, er.resultId, d.key);
                    const consistent = aVal === bVal;
                    const cur = choice[er.resultId]?.[d.key];
                    return (
                      <div key={d.key} className="flex items-center justify-between gap-3 text-xs">
                        <span className="w-40 text-ink">{d.dimension}</span>
                        {consistent ? (
                          <span className="flex-1 text-success">一致（{String(aVal)}）</span>
                        ) : (
                          <div className="flex flex-1 flex-wrap items-center gap-1">
                            <span className="text-muted">标注={String(aVal)}，复评={String(bVal)} →</span>
                            {d.options.map((opt) => {
                              const sel = cur === opt;
                              return (
                                <button key={opt} onClick={() => setNum(er.resultId, d.key, opt)} className={`h-7 w-7 rounded-md border text-xs font-semibold ${sel ? "border-brand bg-brand text-white" : "border-line text-subtle hover:border-brand/50"}`}>{opt}</button>
                              );
                            })}
                            <button
                              onClick={() => setSkip(er.resultId, d.key)}
                              className={`h-7 rounded-md border px-2 text-xs font-semibold ${isSkip(cur) ? "border-warning bg-warning-light text-[#B45309]" : "border-line text-subtle hover:border-brand/50"}`}
                            >
                              Skip
                            </button>
                            {isSkip(cur) && (
                              <select
                                value={cur.skip}
                                onChange={(e) => setChoice((prev) => ({ ...prev, [er.resultId]: { ...prev[er.resultId], [d.key]: { skip: e.target.value } } }))}
                                className="h-7 rounded-md border border-warning/40 bg-white px-1 text-[11px] text-ink outline-none focus:border-brand"
                              >
                                {skipReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-brand hover:bg-page">Cancel</button>
          <button onClick={() => onConfirm(build())} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">确认拉齐</button>
        </div>
      </div>
    </div>
  );
}

// ---- Batch Edit modal -------------------------------------------------------

function BatchEditModal({
  dims,
  note,
  onClose,
  onApply,
}: {
  dims: { key: string; dimension: string; group: string; reasons: { score: number; text: string }[] }[];
  note: string;
  onClose: () => void;
  onApply: (reasonByDim: Record<string, string>) => void;
}) {
  const [reasonByDim, setReasonByDim] = useState<Record<string, string>>({});
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-lg font-semibold text-ink">Batch Edit</h3>
          <button onClick={onClose} className="text-subtle hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <p className="rounded-md bg-page px-3 py-2 text-xs text-subtle">{note}</p>
          {dims.map((d) => (
            <div key={d.key}>
              <label className="text-xs font-medium text-ink">{d.dimension} <span className="text-muted">({d.group})</span></label>
              <select
                value={reasonByDim[d.key] ?? ""}
                onChange={(e) => setReasonByDim((prev) => ({ ...prev, [d.key]: e.target.value }))}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-page px-2 text-xs text-ink outline-none focus:border-brand focus:bg-white"
              >
                <option value="">Keep</option>
                {d.reasons.map((r) => <option key={r.score} value={r.text}>[{r.score}] {r.text.slice(0, 60)}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-brand hover:bg-page">Cancel</button>
          <button onClick={() => onApply(reasonByDim)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">Apply</button>
        </div>
      </div>
    </div>
  );
}
