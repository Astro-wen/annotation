import { useMemo, useState, useEffect, Fragment } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Edit3, User, FileClock, ChevronRight, ChevronDown, ListChecks, X, Download } from "lucide-react";
import Layout from "@/components/Layout";
import { PageHeader, Button } from "@/components/ui";
import Badge from "@/components/Badge";
import { SingleAssignModal } from "@/components/AssignModal";
import DownloadCsvMenu from "@/components/DownloadCsvMenu";
import { downloadCsv } from "@/lib/csv";
import { caseSets } from "@/mock/caseSets";
import type { ActivityEntry, ActorScore, SessionRow } from "@/mock/types";
import { useCurrentUserStore, USER_OPTIONS } from "@/lib/currentUser";
import { useSessionStore } from "@/store/sessionStore";
import { useRubricStore } from "@/store/rubricStore";

const extractLastUpdatedAt = (text?: string) => {
  if (!text) return "—";
  const match = text.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  return match?.[0] ?? "—";
};

export default function TaskDetail() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [assignSession, setAssignSession] = useState<SessionRow | null>(null);
  const [assignBSession, setAssignBSession] = useState<SessionRow | null>(null);
  const [logSession, setLogSession] = useState<SessionRow | null>(null);
  const [snapshotEntry, setSnapshotEntry] = useState<ActivityEntry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [sqsExpanded, setSqsExpanded] = useState(false);
  const [uesExpanded, setUesExpanded] = useState(false);
  const [subtypeFilter, setSubtypeFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [passFilter, setPassFilter] = useState("All");
  const [problemTypeFilter, setProblemTypeFilter] = useState("All");
  const [humanFilter, setHumanFilter] = useState("All");
  // Expanded back-to-back rows (each expands a dark "B version" row below it).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const task = caseSets.find((t) => t.taskId === taskId) ?? caseSets[0];

  const sessions = useSessionStore((s) => s.sessions);
  const imported = useSessionStore((s) => s.imported);
  const assignSingleQa = useSessionStore((s) => s.assignSingleQa);
  const getReviewFlow = useSessionStore((s) => s.getReviewFlow);
  const logs = useSessionStore((s) => s.logs);
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  const rubric = useRubricStore((s) => s.rubric);

  const activeDims = useMemo(() => rubric.filter((d) => d.enabled), [rubric]);
  const sqsDims = activeDims.filter((d) => d.group === "SQS");
  const uesDims = activeDims.filter((d) => d.group === "UES");
  const dimName = (key: string) => rubric.find((d) => d.key === key)?.dimension ?? key;
  const shortName = (email?: string) =>
    email ? USER_OPTIONS.find((u) => u.email === email)?.shortName ?? email : undefined;

  // Simplified per-slot status: Unassigned / Assigned / Completed / QCed.
  // A row reads the A slot, the expanded B row reads the B slot.
  const slotStatus = (
    flow: ReturnType<typeof getReviewFlow>,
    slot: "A" | "B",
  ): { label: string; tone: "neutral" | "brand" | "success" } => {
    if (!flow) return { label: "Unassigned", tone: "neutral" };
    const assignee = slot === "A" ? flow.aAssignee ?? flow.aAnnotator : flow.bAssignee ?? flow.bAnnotator;
    const submitted = slot === "A" ? flow.aResultStatus === "Submitted" : flow.bResultStatus === "Submitted";
    // "QCed" only applies to a slot that actually submitted and got finalized.
    // A B slot that never evaluated stays Assigned/Unassigned even post-finalize.
    if (flow.currentState === "Final Result Ready" && submitted) return { label: "QCed", tone: "success" };
    if (submitted) return { label: "Completed", tone: "success" };
    if (assignee) return { label: "Assigned", tone: "brand" };
    return { label: "Unassigned", tone: "neutral" };
  };

  const rows = useMemo(() => {
    return sessions.filter((s) => {
      if (!imported && s.taskId !== task.taskId) return false;
      if (subtypeFilter !== "All" && s.serviceSubtype !== subtypeFilter) return false;
      if (sourceFilter !== "All" && s.knowledgeSource !== sourceFilter) return false;
      if (problemTypeFilter !== "All" && s.problemType !== problemTypeFilter) return false;
      if (passFilter === "Pass" && s.bot?.sqsPass !== true) return false;
      if (passFilter === "No Pass" && s.bot?.sqsPass !== false) return false;
      if (humanFilter === "Has Human" && s.hasHumanTransfer !== true) return false;
      if (humanFilter === "Bot Only" && s.hasHumanTransfer === true) return false;
      return true;
    });
  }, [sessions, imported, task.taskId, subtypeFilter, sourceFilter, passFilter, problemTypeFilter, humanFilter]);

  // Prune selection / expansion state that no longer maps to a visible row
  // (e.g. after Clear All Data resets the store), so no ghost selected/expanded.
  useEffect(() => {
    const ids = new Set(rows.map((r) => r.sessionId));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setExpanded((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  // Batch-editable rows: scored, and not yet finalized by C (final results are
  // immutable, so they can't be batch-edited).
  const selectableIds = rows
    .filter((r) => r.bot && getReviewFlow(r.sessionId)?.currentState !== "Final Result Ready")
    .map((r) => r.sessionId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected(() => (allSelected ? new Set() : new Set(selectableIds)));

  // Back-to-back rows can expand a dark "B version" row. "Expand all" toggles
  // every back-to-back row at once.
  const btbIds = rows
    .filter((r) => getReviewFlow(r.sessionId)?.backToBackEnabled)
    .map((r) => r.sessionId);
  const allExpanded = btbIds.length > 0 && btbIds.every((id) => expanded.has(id));
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleExpandAll = () =>
    setExpanded(() => (allExpanded ? new Set() : new Set(btbIds)));

  const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => (
    <label className="flex items-center gap-2 text-xs text-subtle">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-line bg-white px-2 text-sm text-ink outline-none focus:border-brand"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  const versionEntries = logSession
    ? logs.filter((l) => l.sessionId === logSession.sessionId).slice().reverse()
    : [];

  const exportActivityLog = () => {
    if (!logSession) return;
    const rows = versionEntries.map((l) => [
      l.at,
      l.operator,
      l.action,
      l.version ? `V${l.version}` : "",
      l.detail ?? "",
    ]);
    downloadCsv(
      `${logSession.sessionId}_activity_log.csv`,
      ["operation_time", "operator", "operation", "version", "detail"],
      rows,
    );
  };

  return (
    <Layout>
      <PageHeader
        title={task.taskName}
        subtitle={`Detail · Session List · ${task.taskId} · SQS (6) + UES · User Satisfaction (North Star)`}
        actions={<DownloadCsvMenu taskId={task.taskId} />}
      />

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-white px-4 py-3">
          <button
            onClick={() => setBatchOpen(true)}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-light disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
          >
            <ListChecks className="h-4 w-4" /> Batch Edit Reasons ({selected.size})
          </button>
          {btbIds.length > 0 && (
            <button
              onClick={toggleExpandAll}
              className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-page"
            >
              {allExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {allExpanded ? "Collapse all B" : "Expand all B"}
            </button>
          )}
          <span className="h-5 w-px bg-line" />
          <Select label="Service Subtype" value={subtypeFilter} onChange={setSubtypeFilter} options={["All", "Chatbot", "Ticketbot"]} />
          <Select label="Knowledge Source" value={sourceFilter} onChange={setSourceFilter} options={["All", "Skill", "FAQ", "SOP"]} />
          <Select label="Problem Type" value={problemTypeFilter} onChange={setProblemTypeFilter} options={["All", "R1 Information", "R2 Personalized Info", "R3 Operation"]} />
          <Select label="SQS" value={passFilter} onChange={setPassFilter} options={["All", "Pass", "No Pass"]} />
          <Select label="Human Result" value={humanFilter} onChange={setHumanFilter} options={["All", "Has Human", "Bot Only"]} />
          <span className="ml-auto text-xs text-subtle">{rows.length} sessions</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="sticky left-0 z-10 bg-page px-3 py-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  </th>
                  <th className="px-3 py-3 font-medium">Session ID</th>
                  <th className="px-3 py-3 font-medium">Subtype</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  {/* SQS 6 dimensions expanded only when SQS column is expanded */}
                  {sqsExpanded &&
                    sqsDims.map((d) => (
                      <th key={d.key} className="px-3 py-3 font-medium text-brand" title={d.dimension}>
                        {d.dimension}
                      </th>
                    ))}
                  <th className="px-3 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => setSqsExpanded((v) => !v)}
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                      title={sqsExpanded ? "Collapse SQS dimensions" : "Expand SQS dimensions"}
                    >
                      {sqsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      SQS
                    </button>
                  </th>
                  {/* UES dimensions expanded only when UES column is expanded */}
                  {uesExpanded &&
                    uesDims.map((d) => (
                      <th key={d.key} className="px-3 py-3 font-medium text-success" title={d.dimension}>
                        {d.dimension}
                      </th>
                    ))}
                  <th className="px-3 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => setUesExpanded((v) => !v)}
                      className="inline-flex items-center gap-1 text-success hover:underline"
                      title={uesExpanded ? "Collapse UES dimensions" : "Expand UES dimensions"}
                    >
                      {uesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      UES
                    </button>
                  </th>
                  <th className="px-3 py-3 font-medium">User Satisfaction</th>
                  <th className="px-3 py-3 font-medium">Transfer to human?</th>
                  <th className="px-3 py-3 font-medium">Assign QA</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const flow = getReviewFlow(s.sessionId);
                  const aReviewer = flow?.aAnnotator ?? flow?.aAssignee;
                  const isFinal = flow?.currentState === "Final Result Ready";
                  const isBackToBack = flow?.backToBackEnabled === true;
                  const bReviewer = flow?.bAnnotator ?? flow?.bAssignee;
                  const bBot = flow?.bResult?.bot;
                  const isOpen = expanded.has(s.sessionId);

                  // No more "annotate vs review" distinction — A and B annotate
                  // at the same time. The row's own action is always the A slot
                  // (annotate / edit own / read-only view when finalized).
                  const aActionRole: "A" | null = isFinal ? null : "A";
                  const aActionHref = aActionRole
                    ? `/annotate/${s.sessionId}?role=A`
                    : `/annotate/${s.sessionId}?view=1`;
                  const aActionLabel = isFinal ? "View" : "Annotate";

                  const bot = s.bot;
                  const isSel = selected.has(s.sessionId);
                  return (
                    <Fragment key={s.sessionId}>
                    <tr className={`border-b border-line hover:bg-page ${isSel ? "bg-brand-light/40" : ""} ${isOpen ? "border-b-0" : "last:border-0"}`}>
                      <td className="sticky left-0 z-10 bg-inherit px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {isBackToBack ? (
                            <button
                              onClick={() => toggleExpand(s.sessionId)}
                              className="text-subtle hover:text-ink"
                              title={isOpen ? "Collapse B" : "Expand B"}
                            >
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : (
                            <span className="w-4" />
                          )}
                          <input
                            type="checkbox"
                            checked={isSel}
                            disabled={!bot || isFinal}
                            onChange={() => toggleSelect(s.sessionId)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => navigate(`/annotate/${s.sessionId}?view=1`)}
                          className="font-mono text-xs text-brand hover:underline"
                        >
                          {s.sessionId}
                        </button>
                        {isBackToBack && <div className="mt-0.5 text-[10px] font-medium text-brand">A · {shortName(aReviewer) ?? "—"}</div>}
                      </td>
                      <td className="px-3 py-3 text-subtle">{s.serviceSubtype}</td>
                      <td className="px-3 py-3">
                        <Badge tone={s.knowledgeSource === "SOP" ? "neutral" : "brand"}>{s.knowledgeSource}</Badge>
                      </td>

                      {/* SQS dims (only when expanded) */}
                      {sqsExpanded &&
                        sqsDims.map((d) => (
                          <td key={d.key} className="px-3 py-3">
                            <DimCell value={bot?.scores?.[d.key]} reason={bot?.reasons?.[d.key]} />
                          </td>
                        ))}
                      <td className="px-3 py-3">
                        {!bot ? "—" : (
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono">{bot.sqsTotal.toFixed(2)}</span>
                            <Badge tone={bot.sqsPass ? "success" : "danger"}>{bot.sqsPass ? "Pass" : "No Pass"}</Badge>
                          </span>
                        )}
                      </td>

                      {/* UES dims (only when expanded) */}
                      {uesExpanded &&
                        uesDims.map((d) => (
                          <td key={d.key} className="px-3 py-3">
                            <DimCell value={bot?.scores?.[d.key]} reason={bot?.reasons?.[d.key]} />
                          </td>
                        ))}
                      <td className="px-3 py-3">
                        {!bot ? "—" : (
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono">{bot.uesTotal.toFixed(2)}</span>
                            <Badge tone={bot.uesPass ? "success" : "danger"}>{bot.uesPass ? "Pass" : "Fail"}</Badge>
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {!bot ? "—" : (
                          <span className="inline-flex items-center rounded-md bg-brand-light px-2 py-1 font-mono text-sm font-semibold text-brand">
                            {bot.userSatisfaction.toFixed(2)}
                          </span>
                        )}
                      </td>

                      {/* Transfer to human — system-detected, read-only Yes/No */}
                      <td className="px-3 py-3">
                        <Badge tone={s.hasHumanTransfer ? "success" : "neutral"}>
                          {s.hasHumanTransfer ? "Yes" : "No"}
                        </Badge>
                      </td>

                      {/* Assign QA (single case) */}
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setAssignSession(s)}
                          className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-subtle hover:border-brand/40 hover:text-ink"
                        >
                          <User className="h-3.5 w-3.5" />
                          {s.qaOwner ?? "Assign"}
                        </button>
                        {flow?.aAnnotator && (
                          <div className="mt-1 text-[11px] text-muted">
                            实际 Annotator: {flow.aAnnotator}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {s.sopStatus ? (
                          <Badge tone="neutral">{s.sopStatus}</Badge>
                        ) : (
                          (() => {
                            const st = slotStatus(flow, "A");
                            return <Badge tone={st.tone}>{st.label}</Badge>;
                          })()
                        )}
                        <div className="mt-1 text-[11px] text-muted">{extractLastUpdatedAt(s.latestActivityLog)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            icon={Edit3}
                            onClick={() => navigate(aActionHref)}
                          >
                            {aActionLabel}
                          </Button>
                          <button
                            onClick={() => setLogSession(s)}
                            className="rounded-md p-1.5 text-subtle hover:bg-gray-100 hover:text-ink"
                            title="Activity Log"
                          >
                            <FileClock className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded "B version" row — same session, B's slot.
                        Only slightly darker than the row above; identical layout
                        and states as the A row. */}
                    {isBackToBack && isOpen && (
                      <tr className="border-b border-line bg-gray-100 last:border-0">
                        <td className="sticky left-0 z-10 bg-gray-100 px-3 py-3" />
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs text-brand">{s.sessionId}</span>
                          <div className="mt-0.5 text-[10px] font-medium text-brand">B · {shortName(bReviewer) ?? "—"}</div>
                        </td>
                        <td className="px-3 py-3 text-subtle">{s.serviceSubtype}</td>
                        <td className="px-3 py-3">
                          <Badge tone={s.knowledgeSource === "SOP" ? "neutral" : "brand"}>{s.knowledgeSource}</Badge>
                        </td>
                        {sqsExpanded &&
                          sqsDims.map((d) => (
                            <td key={d.key} className="px-3 py-3">
                              <DimCell value={bBot?.scores?.[d.key]} reason={bBot?.reasons?.[d.key]} />
                            </td>
                          ))}
                        <td className="px-3 py-3">
                          {!bBot ? "—" : (
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono">{bBot.sqsTotal.toFixed(2)}</span>
                              <Badge tone={bBot.sqsPass ? "success" : "danger"}>{bBot.sqsPass ? "Pass" : "No Pass"}</Badge>
                            </span>
                          )}
                        </td>
                        {uesExpanded &&
                          uesDims.map((d) => (
                            <td key={d.key} className="px-3 py-3">
                              <DimCell value={bBot?.scores?.[d.key]} reason={bBot?.reasons?.[d.key]} />
                            </td>
                          ))}
                        <td className="px-3 py-3">
                          {!bBot ? "—" : (
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono">{bBot.uesTotal.toFixed(2)}</span>
                              <Badge tone={bBot.uesPass ? "success" : "danger"}>{bBot.uesPass ? "Pass" : "Fail"}</Badge>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {!bBot ? "—" : (
                            <span className="inline-flex items-center rounded-md bg-brand-light px-2 py-1 font-mono text-sm font-semibold text-brand">
                              {bBot.userSatisfaction.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={s.hasHumanTransfer ? "success" : "neutral"}>
                            {s.hasHumanTransfer ? "Yes" : "No"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setAssignBSession(s)}
                            disabled={isFinal || flow?.bResultStatus === "Submitted"}
                            className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-subtle hover:border-brand/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <User className="h-3.5 w-3.5" />
                            {shortName(bReviewer) ?? "Assign"}
                          </button>
                          {flow?.bAnnotator && (
                            <div className="mt-1 text-[11px] text-muted">
                              实际 Annotator: {flow.bAnnotator}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {(() => {
                            const st = slotStatus(flow, "B");
                            return <Badge tone={st.tone}>{st.label}</Badge>;
                          })()}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              icon={Edit3}
                              onClick={() => navigate(isFinal ? `/annotate/${s.sessionId}?view=1` : `/annotate/${s.sessionId}?role=B`)}
                            >
                              {isFinal ? "View" : "Annotate"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {assignSession && (() => {
        const aFlow = getReviewFlow(assignSession.sessionId);
        // In back-to-back, the A slot also can't be the B person.
        const bPerson = aFlow?.backToBackEnabled ? aFlow.bAnnotator ?? aFlow.bAssignee : undefined;
        return (
          <SingleAssignModal
            session={assignSession}
            excludeEmail={bPerson}
            onClose={() => setAssignSession(null)}
            onConfirm={(qaName) => {
              try {
                assignSingleQa(assignSession.sessionId, qaName, currentEmail);
              } catch (e) {
                alert(e instanceof Error ? e.message : "指派失败");
              }
            }}
          />
        );
      })()}

      {assignBSession && (() => {
        const bFlow = getReviewFlow(assignBSession.sessionId);
        const aPerson = bFlow?.aAnnotator ?? bFlow?.aAssignee;
        return (
          <SingleAssignModal
            session={assignBSession}
            title="Assign B Reviewer"
            initialName={bFlow?.bAssignee ?? bFlow?.bAnnotator}
            excludeEmail={aPerson}
            onClose={() => setAssignBSession(null)}
            onConfirm={(qaName) => {
              try {
                assignSingleQa(assignBSession.sessionId, qaName, currentEmail, "B");
              } catch (e) {
                alert(e instanceof Error ? e.message : "指派失败");
              }
            }}
          />
        );
      })()}

      {batchOpen && (
        <BatchEditReasonsModal
          count={selected.size}
          dims={activeDims}
          onClose={() => setBatchOpen(false)}
          onApply={(reasonByDim) => {
            useSessionStore.getState().batchEditReasons(Array.from(selected), reasonByDim, currentEmail);
            setBatchOpen(false);
            setSelected(new Set());
          }}
        />
      )}

      {/* Activity Log drawer — version table */}
      {logSession && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={() => setLogSession(null)}>
          <div className="h-full w-[30rem] overflow-y-auto border-l border-line bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold">Activity Log</h3>
              <button
                onClick={exportActivityLog}
                disabled={versionEntries.length === 0}
                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-brand hover:bg-page disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>
            <p className="mb-4 font-mono text-xs text-subtle">{logSession.sessionId}</p>

            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
                    <th className="px-3 py-2 font-medium">Operation time</th>
                    <th className="px-3 py-2 font-medium">Operator</th>
                    <th className="px-3 py-2 font-medium">Operation</th>
                    <th className="px-3 py-2 font-medium">Version</th>
                  </tr>
                </thead>
                <tbody>
                  {versionEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted">
                        No activity yet.
                      </td>
                    </tr>
                  )}
                  {versionEntries.map((l, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-muted">{l.at}</td>
                      <td className="px-3 py-2 text-xs text-subtle">{l.operator}</td>
                      <td className="px-3 py-2 text-xs text-ink">{l.action}</td>
                      <td className="px-3 py-2">
                        {l.version && l.snapshot ? (
                          <button
                            onClick={() => setSnapshotEntry(l)}
                            className="inline-flex items-center gap-0.5 rounded-md bg-brand-light px-2 py-1 text-xs font-semibold text-brand hover:opacity-80"
                            title="View scoring at this version"
                          >
                            V{l.version} <ChevronRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-muted">
              operator = who performed the action (≠ assigned annotator). Click a version to view the exact scoring recorded at that time.
            </p>
          </div>
        </div>
      )}

      {/* Version snapshot modal */}
      {snapshotEntry?.snapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSnapshotEntry(null)}>
          <div className="w-full max-w-lg rounded-xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-base font-semibold text-ink">Scoring Result · V{snapshotEntry.version}</h3>
              <Badge tone="neutral">Rubric v{snapshotEntry.snapshot.ruleVersion}</Badge>
            </div>
            <p className="mb-4 text-xs text-subtle">
              {snapshotEntry.operator} · {snapshotEntry.at}
            </p>
            <SnapshotScore title="Bot Result" score={snapshotEntry.snapshot.bot} dimName={dimName} />
            {snapshotEntry.snapshot.human && (
              <div className="mt-4">
                <SnapshotScore title="Human Result" score={snapshotEntry.snapshot.human} dimName={dimName} />
              </div>
            )}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSnapshotEntry(null)}
                className="rounded-md border border-line px-4 py-2 text-sm text-subtle hover:bg-page"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function DimCell({ value, reason }: { value?: number; reason?: string }) {
  if (value === undefined) return <span className="text-muted">—</span>;
  const tone = value >= 3 ? "text-success" : value >= 2 ? "text-ink" : value >= 1 ? "text-warning" : "text-danger";
  return (
    <div className="min-w-[3rem]" title={reason}>
      <span className={`font-mono text-sm font-semibold ${tone}`}>{value}</span>
      {reason && <div className="mt-0.5 max-w-[10rem] truncate text-[11px] text-muted">{reason}</div>}
    </div>
  );
}

function BatchEditReasonsModal({
  count,
  dims,
  onClose,
  onApply,
}: {
  count: number;
  dims: { key: string; dimension: string; group: "SQS" | "UES"; reasons: { score: number; text: string }[] }[];
  onClose: () => void;
  onApply: (reasonByDim: Record<string, string>) => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Batch Edit Reasons</h3>
            <p className="text-xs text-subtle">
              Updating {count} selected {count === 1 ? "case" : "cases"}. Only chosen dimensions are updated; leave as Keep to keep unchanged.
            </p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {dims.map((d) => (
            <div key={d.key}>
              <label className="mb-1 flex items-center gap-2 text-xs font-medium text-subtle">
                <Badge tone={d.group === "SQS" ? "brand" : "success"}>{d.group}</Badge>
                {d.dimension} Reason
              </label>
              <select
                value={choice[d.key] ?? ""}
                onChange={(e) => setChoice((c) => ({ ...c, [d.key]: e.target.value }))}
                className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
              >
                <option value="">Keep</option>
                {d.reasons.map((r) => (
                  <option key={r.score} value={r.text}>
                    [{r.score}] {r.text.slice(0, 60)}
                    {r.text.length > 60 ? "…" : ""}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-brand hover:bg-page">
            Cancel
          </button>
          <button
            onClick={() => onApply(choice)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function SnapshotScore({ title, score, dimName }: { title: string; score: ActorScore; dimName: (k: string) => string }) {
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-page px-3 py-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-white px-2 py-0.5 font-mono">SQS {score.sqsTotal.toFixed(2)}</span>
          <span className="rounded bg-white px-2 py-0.5 font-mono">UES {score.uesTotal.toFixed(2)}</span>
          <span className="rounded bg-brand-light px-2 py-0.5 font-mono font-semibold text-brand">US {score.userSatisfaction.toFixed(2)}</span>
        </div>
      </div>
      <div className="divide-y divide-line">
        {Object.entries(score.scores).map(([key, val]) => (
          <div key={key} className="flex items-center justify-between px-3 py-1.5 text-xs">
            <span className="text-subtle">{dimName(key)}</span>
            <span className="font-mono font-medium text-ink">{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
