import { useMemo, useState, useEffect, Fragment } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Edit3, User, UserCheck, FileClock, ChevronRight, ChevronDown, ListChecks, X, Download } from "lucide-react";
import Layout from "@/components/Layout";
import { PageHeader, Button } from "@/components/ui";
import Badge from "@/components/Badge";
import { SingleAssignModal } from "@/components/AssignModal";
import DownloadCsvMenu from "@/components/DownloadCsvMenu";
import { downloadCsv } from "@/lib/csv";
import { caseSets } from "@/mock/caseSets";
import type { ActivityEntry, ActorScore, SessionRow } from "@/mock/types";
import type { RubricDimension } from "@/mock/settings";
import { useCurrentUserStore, USER_OPTIONS, isPrivileged, isVendor, isAdmin } from "@/lib/currentUser";
import { caseVisibleTo } from "@/lib/access";
import { useSessionStore } from "@/store/sessionStore";
import { useRubricStore } from "@/store/rubricStore";
import { caseAccuracy, diffDims, aggregateAccuracy } from "@/lib/diff";
import { computeActorScore } from "@/lib/scoring";

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
  const [reconcileSession, setReconcileSession] = useState<SessionRow | null>(null);
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
  // QC lifecycle filter: All / Waiting for QC (sampled, not finalized) / QC Completed.
  const [qcFilter, setQcFilter] = useState("All");
  // Annotator filter: narrow the list to cases a given person worked on (any
  // A/B/C slot). Drives the per-annotator QC accuracy readout.
  const [annotatorFilter, setAnnotatorFilter] = useState("All");
  // "只看我的任务": only rows where the current account is assigned to any slot (A/B/C).
  const [mineOnly, setMineOnly] = useState(false);
  // Expanded back-to-back rows (each expands a dark "B version" row below it).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const task = caseSets.find((t) => t.taskId === taskId) ?? caseSets[0];

  const sessions = useSessionStore((s) => s.sessions);
  const imported = useSessionStore((s) => s.imported);
  const assignSingleQa = useSessionStore((s) => s.assignSingleQa);
  const reconcileDiff = useSessionStore((s) => s.reconcileDiff);
  const getReviewFlow = useSessionStore((s) => s.getReviewFlow);
  const logs = useSessionStore((s) => s.logs);
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  // 权限账号：QC 定案后仍可回改 A / B / C。开启后，列表里那些定案后本该只读的入口
  // 对它继续保持可编辑。
  const privileged = isPrivileged(currentEmail);
  // 供应商标注员：受硬隔离约束——只能看到分配给自己的 case、没有全量导出、没有
  // “只看我的任务”开关（本来就只有自己的）。管理员 / QA 不受限。
  const vendor = isVendor(currentEmail);
  const rubric = useRubricStore((s) => s.rubric);
  const rubricWeights = useRubricStore((s) => s.weights);

  const activeDims = useMemo(() => rubric.filter((d) => d.enabled), [rubric]);
  const sqsDims = activeDims.filter((d) => d.group === "SQS");
  const uesDims = activeDims.filter((d) => d.group === "UES");
  const dimName = (key: string) => rubric.find((d) => d.key === key)?.dimension ?? key;
  const shortName = (email?: string) =>
    email ? USER_OPTIONS.find((u) => u.email === email)?.shortName ?? email : undefined;

  // 盲检隔离：判断当前 vendor 在这条 case 里占哪个槽位（A / B / C）。
  // 供应商只能看到自己那一格的结果，看不到搭档的行和分数；管理员 / QA 不受限。
  const selfSlotOf = (
    flow: ReturnType<typeof getReviewFlow>,
  ): "A" | "B" | "C" | null => {
    if (!flow) return null;
    if (flow.aAssignee === currentEmail || flow.aAnnotator === currentEmail) return "A";
    if (flow.bAssignee === currentEmail || flow.bAnnotator === currentEmail) return "B";
    if (flow.cReviewer === currentEmail) return "C";
    return null;
  };

  // Simplified per-slot status: Unassigned / Assigned / Submitted (No QC) /
  // Waiting for QC / QC Completed. A row reads the A slot, the expanded B row
  // reads the B slot. "Waiting for QC" = sampled into QC but C hasn't finalized.
  const slotStatus = (
    flow: ReturnType<typeof getReviewFlow>,
    slot: "A" | "B" | "C",
  ): { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" } => {
    if (!flow) return { label: "Unassigned", tone: "neutral" };
    // C (QC) slot has its own lifecycle.
    if (slot === "C") {
      if (flow.currentState === "Final Result Ready" && flow.cResultStatus === "Submitted")
        return { label: "QC Completed", tone: "success" };
      if (flow.cReviewer) return { label: "QC In Progress", tone: "warning" };
      return { label: "Unassigned", tone: "neutral" };
    }
    const assignee = slot === "A" ? flow.aAssignee ?? flow.aAnnotator : flow.bAssignee ?? flow.bAnnotator;
    const submitted = slot === "A" ? flow.aResultStatus === "Submitted" : flow.bResultStatus === "Submitted";
    // "QC Completed" only applies to a slot that actually submitted and got finalized.
    // A B slot that never evaluated stays Assigned/Unassigned even post-finalize.
    if (flow.currentState === "Final Result Ready" && submitted) return { label: "QC Completed", tone: "success" };
    // A/B double-blind disagreement waiting for reconcile — surfaced on BOTH A and B
    // slots (拉齐时解盲，A、B 各自都能在自己行看到"待拉齐"并进入拉齐)。
    if (flow.reconcileStatus === "Pending" && submitted) return { label: "待拉齐（Diff）", tone: "danger" };
    // Sampled into QC but not yet finalized — surfaced on the A slot only.
    if (slot === "A" && flow.sampledForQC && submitted) return { label: "Waiting for QC", tone: "warning" };
    if (submitted) return { label: "Submitted (No QC)", tone: "success" };
    if (assignee) return { label: "Assigned", tone: "brand" };
    return { label: "Unassigned", tone: "neutral" };
  };

  const rows = useMemo(() => {
    return sessions.filter((s) => {
      if (!imported && s.taskId !== task.taskId) return false;
      // 供应商权限隔离（硬隔离）：在数据源头就过滤掉不属于当前供应商的 case，
      // 供应商永远只能看到分配给自己的 case。管理员 / QA 不受此限。
      if (vendor && !caseVisibleTo(currentEmail, s, getReviewFlow(s.sessionId))) return false;
      if (subtypeFilter !== "All" && s.serviceSubtype !== subtypeFilter) return false;
      if (sourceFilter !== "All" && s.knowledgeSource !== sourceFilter) return false;
      if (problemTypeFilter !== "All" && s.problemType !== problemTypeFilter) return false;
      if (passFilter === "Pass" && s.bot?.sqsPass !== true) return false;
      if (passFilter === "No Pass" && s.bot?.sqsPass !== false) return false;
      if (humanFilter === "Has Human" && s.hasHumanTransfer !== true) return false;
      if (humanFilter === "Bot Only" && s.hasHumanTransfer === true) return false;
      if (mineOnly) {
        const flow = getReviewFlow(s.sessionId);
        const mine =
          s.qaOwner === currentEmail ||
          flow?.aAssignee === currentEmail ||
          flow?.aAnnotator === currentEmail ||
          flow?.bAssignee === currentEmail ||
          flow?.bAnnotator === currentEmail ||
          flow?.cReviewer === currentEmail;
        if (!mine) return false;
      }
      if (qcFilter !== "All") {
        const flow = getReviewFlow(s.sessionId);
        const finalized = flow?.currentState === "Final Result Ready";
        const pendingReconcile = flow?.reconcileStatus === "Pending";
        const waiting = !!flow?.sampledForQC && flow?.aResultStatus === "Submitted" && !finalized;
        if (qcFilter === "待拉齐（Diff）" && !pendingReconcile) return false;
        if (qcFilter === "Waiting for QC" && !waiting) return false;
        if (qcFilter === "QC Completed" && !finalized) return false;
      }
      if (annotatorFilter !== "All") {
        const flow = getReviewFlow(s.sessionId);
        const people = [
          flow?.aAnnotator ?? flow?.aAssignee,
          flow?.bAnnotator ?? flow?.bAssignee,
          flow?.cReviewer,
        ];
        if (!people.includes(annotatorFilter)) return false;
      }
      return true;
    });
  }, [sessions, imported, task.taskId, subtypeFilter, sourceFilter, passFilter, problemTypeFilter, humanFilter, qcFilter, annotatorFilter, mineOnly, currentEmail, getReviewFlow, vendor]);

  // Annotators present in this task (any A/B/C slot), for the annotator filter.
  const annotatorOptions = useMemo(() => {
    const set = new Set<string>();
    sessions
      .filter((s) => imported || s.taskId === task.taskId)
      .forEach((s) => {
        const flow = getReviewFlow(s.sessionId);
        [
          flow?.aAnnotator ?? flow?.aAssignee,
          flow?.bAnnotator ?? flow?.bAssignee,
          flow?.cReviewer,
        ].forEach((p) => p && set.add(p));
      });
    return ["All", ...Array.from(set)];
  }, [sessions, imported, task.taskId, getReviewFlow]);

  // QC accuracy over the currently filtered rows, under the all-correct rule
  // (fully-correct cases / QC'd cases). When an annotator is selected this is
  // THAT person's accuracy: each case is scored against their own submitted
  // round (A or B), not the case's agreed result — so filtering by A still
  // surfaces A's blind partner B in the list, but the number stays about A.
  // Recomputes live as filters change. Never averages per-case dimension %.
  const filteredAccuracy = useMemo(() => {
    const flows = rows
      .map((r) => getReviewFlow(r.sessionId))
      .filter((f): f is NonNullable<typeof f> => !!f);
    return aggregateAccuracy(flows, annotatorFilter === "All" ? undefined : annotatorFilter);
  }, [rows, getReviewFlow, annotatorFilter]);

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

  const Select = ({ label, value, onChange, options, display }: { label: string; value: string; onChange: (v: string) => void; options: string[]; display?: (v: string) => string }) => (
    <label className="flex items-center gap-2 text-xs text-subtle">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-line bg-white px-2 text-sm text-ink outline-none focus:border-brand"
      >
        {options.map((o) => (
          <option key={o} value={o}>{display ? display(o) : o}</option>
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
        actions={vendor ? undefined : <DownloadCsvMenu taskId={task.taskId} />}
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
          {!vendor && (
            <button
              onClick={() => setMineOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${
                mineOnly
                  ? "border-brand bg-brand-light text-brand"
                  : "border-line text-ink hover:bg-page"
              }`}
            >
              <UserCheck className="h-4 w-4" /> 只看我的任务
            </button>
          )}
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
          <Select label="QC" value={qcFilter} onChange={setQcFilter} options={["All", "待拉齐（Diff）", "Waiting for QC", "QC Completed"]} />
          <Select
            label="Annotator"
            value={annotatorFilter}
            onChange={setAnnotatorFilter}
            options={annotatorOptions}
            display={(v) => (v === "All" ? "All" : shortName(v) ?? v)}
          />
          {annotatorFilter !== "All" && (
            <span className="text-xs text-subtle" title="Scored against this person's own submitted round (A or B), all-correct rule">
              {shortName(annotatorFilter) ?? annotatorFilter}&rsquo;s QC Accuracy:{" "}
              <span className="font-semibold text-ink">
                {filteredAccuracy === null ? "—" : `${filteredAccuracy.toFixed(1)}%`}
              </span>
            </span>
          )}
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
                  // C (QC) slot — only exists once the case is sampled into QC.
                  const sampled = flow?.sampledForQC === true;
                  const cReviewer = flow?.cReviewer;
                  const cBot = flow?.cResult?.bot;
                  // 盲检隔离（对 A / B 对称）：供应商只能看到自己那一格。
                  // 无论自己是 A、B 还是 C，主行都渲染成"自己的槽位"，并且不展开
                  // 搭档的行——彻底看不到对方的身份和分数。管理员 / QA（!vendor）看全部。
                  const selfSlot = vendor ? selfSlotOf(flow) : null;
                  const blindSelf = vendor && selfSlot !== null;
                  // 主行展示用的槽位角色、评分源、评审人、tag。
                  const rowSlot: "A" | "B" | "C" = blindSelf ? selfSlot! : "A";
                  const rowBot =
                    rowSlot === "B" ? flow?.bResult?.bot
                    : rowSlot === "C" ? flow?.cResult?.bot
                    : s.bot;
                  const rowReviewer =
                    rowSlot === "B" ? bReviewer : rowSlot === "C" ? cReviewer : aReviewer;
                  // 待拉齐：A/B 都提交且不一致。此时解盲——A、B、管理员都能看到 diff
                  // 并执行拉齐。供应商在自己的主行上就能看到这个状态和入口。
                  const pendingReconcile = flow?.reconcileStatus === "Pending";
                  // Expandable when there's a B slot (back-to-back) or a C/QC slot.
                  // 供应商看不到搭档行，禁止展开；管理员保留。
                  const canExpand = !blindSelf && (isBackToBack || sampled);
                  const isOpen = expanded.has(s.sessionId);

                  // No more "annotate vs review" distinction — A and B annotate
                  // at the same time. The row's own action targets the viewer's
                  // slot: A for everyone by default; for a vendor whose own slot
                  // is B / C (blind isolation), the row action targets that slot.
                  // 权限账号例外：即使定案了，入口也保持可编辑。
                  const rowEditable = !isFinal || privileged;
                  const rowActionHref = rowEditable
                    ? `/annotate/${s.sessionId}?role=${rowSlot}`
                    : `/annotate/${s.sessionId}?view=1`;
                  const rowActionLabel = rowEditable ? "Annotate" : "View";

                  const bot = rowBot;
                  const isSel = selected.has(s.sessionId);
                  return (
                    <Fragment key={s.sessionId}>
                    <tr className={`border-b border-line hover:bg-page ${isSel ? "bg-brand-light/40" : ""} ${isOpen ? "border-b-0" : "last:border-0"}`}>
                      <td className="sticky left-0 z-10 bg-inherit px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {canExpand ? (
                            <button
                              onClick={() => toggleExpand(s.sessionId)}
                              className="text-subtle hover:text-ink"
                              title={isOpen ? "Collapse" : "Expand"}
                            >
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : (
                            <span className="w-4" />
                          )}
                          <input
                            type="checkbox"
                            checked={isSel}
                            disabled={!bot || (isFinal && !privileged)}
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
                        {blindSelf ? (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] font-medium text-brand">{rowSlot} · {shortName(rowReviewer) ?? "—"}</span>
                            {/* 作答阶段（back-to-back 且尚未拉齐/未定案）对 A、B 都是盲检；
                                拉齐或定案后解盲，去掉 tag。 */}
                            {isBackToBack && rowSlot !== "C" && !pendingReconcile && !isFinal && (
                              <Badge tone="neutral">盲检</Badge>
                            )}
                          </div>
                        ) : (
                          isBackToBack && <div className="mt-0.5 text-[10px] font-medium text-brand">A · {shortName(aReviewer) ?? "—"}</div>
                        )}
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
                          disabled={vendor}
                          className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-subtle hover:border-brand/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <User className="h-3.5 w-3.5" />
                          {blindSelf ? (shortName(rowReviewer) ?? "—") : (s.qaOwner ?? "Assign")}
                        </button>
                        {(() => {
                          // 主行 Annotator 按当前展示的槽位显示：vendor 看自己那一格，
                          // 管理员默认看 A。C 槽位显示复核人。
                          const who =
                            rowSlot === "B" ? flow?.bAnnotator
                            : rowSlot === "C" ? flow?.cReviewer
                            : flow?.aAnnotator;
                          return who ? (
                            <div className="mt-1 text-[11px] text-muted">
                              实际 Annotator: {who}
                            </div>
                          ) : null;
                        })()}
                      </td>

                      <td className="px-3 py-3">
                        {s.sopStatus ? (
                          <Badge tone="neutral">{s.sopStatus}</Badge>
                        ) : (
                          (() => {
                            // 状态列反映当前展示的槽位：vendor 看自己，管理员看 A。
                            const st = slotStatus(flow, rowSlot);
                            return <Badge tone={st.tone}>{st.label}</Badge>;
                          })()
                        )}
                        <div className="mt-1 text-[11px] text-muted">{extractLastUpdatedAt(s.latestActivityLog)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {pendingReconcile && rowSlot !== "C" ? (
                            // 待拉齐：A、B、管理员都能在自己主行看到并进入拉齐（解盲）。
                            <button
                              onClick={() => setReconcileSession(s)}
                              className="rounded-md bg-danger px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                              title="A/B 结果不一致，拉齐后进入 QC 池"
                            >
                              拉齐 Diff
                            </button>
                          ) : (
                            <Button
                              variant="ghost"
                              icon={Edit3}
                              onClick={() => navigate(rowActionHref)}
                            >
                              {rowActionLabel}
                            </Button>
                          )}
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
                    {canExpand && isBackToBack && isOpen && (
                      <tr className="border-b border-line bg-gray-100 last:border-0">
                        <td className="sticky left-0 z-10 bg-gray-100 px-3 py-3" />
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs text-brand">{s.sessionId}</span>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] font-medium text-brand">B · {shortName(bReviewer) ?? "—"}</span>
                            <Badge tone="neutral">盲检</Badge>
                          </div>
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
                            disabled={vendor || (!privileged && (isFinal || flow?.bResultStatus === "Submitted"))}
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
                            {flow?.reconcileStatus === "Pending" ? (
                              <button
                                onClick={() => setReconcileSession(s)}
                                className="rounded-md bg-danger px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                                title="A/B 结果不一致，拉齐后进入 QC 池"
                              >
                                拉齐 Diff
                              </button>
                            ) : (
                              <Button
                                variant="ghost"
                                icon={Edit3}
                                onClick={() => navigate(isFinal && !privileged ? `/annotate/${s.sessionId}?view=1` : `/annotate/${s.sessionId}?role=B`)}
                              >
                                {isFinal && !privileged ? "View" : "Annotate"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Expanded "C version" row — same session, C's QC slot.
                        Shown for sampled cases. Do QC opens the annotation page
                        as role=C (blank-slate review with A/B reference); View QC
                        opens it read-only. */}
                    {canExpand && sampled && isOpen && (
                      <tr className="border-b border-line bg-brand-light/30 last:border-0">
                        <td className="sticky left-0 z-10 bg-brand-light/30 px-3 py-3" />
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs text-brand">{s.sessionId}</span>
                          <div className="mt-0.5 text-[10px] font-medium text-brand">C · QC · {shortName(cReviewer) ?? "—"}</div>
                        </td>
                        <td className="px-3 py-3 text-subtle">{s.serviceSubtype}</td>
                        <td className="px-3 py-3">
                          <Badge tone={s.knowledgeSource === "SOP" ? "neutral" : "brand"}>{s.knowledgeSource}</Badge>
                        </td>
                        {sqsExpanded &&
                          sqsDims.map((d) => (
                            <td key={d.key} className="px-3 py-3">
                              <DimCell value={cBot?.scores?.[d.key]} reason={cBot?.reasons?.[d.key]} />
                            </td>
                          ))}
                        <td className="px-3 py-3">
                          {!cBot ? "—" : (
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono">{cBot.sqsTotal.toFixed(2)}</span>
                              <Badge tone={cBot.sqsPass ? "success" : "danger"}>{cBot.sqsPass ? "Pass" : "No Pass"}</Badge>
                            </span>
                          )}
                        </td>
                        {uesExpanded &&
                          uesDims.map((d) => (
                            <td key={d.key} className="px-3 py-3">
                              <DimCell value={cBot?.scores?.[d.key]} reason={cBot?.reasons?.[d.key]} />
                            </td>
                          ))}
                        <td className="px-3 py-3">
                          {!cBot ? "—" : (
                            <span className="flex items-center gap-1.5">
                              <span className="font-mono">{cBot.uesTotal.toFixed(2)}</span>
                              <Badge tone={cBot.uesPass ? "success" : "danger"}>{cBot.uesPass ? "Pass" : "Fail"}</Badge>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {!cBot ? "—" : (
                            <span className="inline-flex items-center rounded-md bg-brand-light px-2 py-1 font-mono text-sm font-semibold text-brand">
                              {cBot.userSatisfaction.toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={s.hasHumanTransfer ? "success" : "neutral"}>
                            {s.hasHumanTransfer ? "Yes" : "No"}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-[11px] text-muted">QC reviewer</td>
                        <td className="px-3 py-3">
                          {(() => {
                            const st = slotStatus(flow, "A");
                            // On the C row show the QC-facing state only.
                            const label = st.label === "QC Completed" ? "QC Completed" : "Waiting for QC";
                            const tone = st.label === "QC Completed" ? "success" : "warning";
                            return <Badge tone={tone}>{label}</Badge>;
                          })()}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-3">
                            {(() => {
                              // Prominent QC accuracy — only once C has done QC.
                              const acc = caseAccuracy(flow);
                              if (acc === null) return null;
                              const tone =
                                acc >= 80 ? "text-success" : acc >= 50 ? "text-warning" : "text-danger";
                              return (
                                <div className="text-right leading-none">
                                  <div className="text-[9px] uppercase tracking-wide text-subtle">QC Acc</div>
                                  <div className={`font-mono text-lg font-bold ${tone}`}>{acc.toFixed(1)}%</div>
                                </div>
                              );
                            })()}
                            {(() => {
                              // Anti-self-review at the entry: a user who graded
                              // this case as A or B cannot QC it themselves.
                              // 权限账号例外：它可以在定案后回改，不受防自审限制。
                              const selfReview =
                                !privileged &&
                                !isFinal &&
                                (flow?.aAnnotator === currentEmail || flow?.bAnnotator === currentEmail);
                              if (selfReview) {
                                return (
                                  <span
                                    className="text-xs text-muted"
                                    title="你标注过这条 case（A / B），不能再由你来做 QC，请换人复核"
                                  >
                                    不能评自己标注的
                                  </span>
                                );
                              }
                              // 指派校验：抽样时已把这批 case 指派给某个 C 复核人。
                              // 能做 QC 的人 = 所有管理员 / QA（含权限账号）+ 被指派的 C 本人。
                              // 其他人只能查看，避免谁点谁做。
                              const assignedC = flow?.cReviewer;
                              const canDoQc =
                                privileged ||
                                isAdmin(currentEmail) ||
                                assignedC === currentEmail;
                              if (!canDoQc) {
                                return (
                                  <span
                                    className="text-xs text-muted"
                                    title={`该 case 的 QC 已指派给 ${shortName(assignedC) ?? assignedC}`}
                                  >
                                    View QC · 指派给 {shortName(assignedC) ?? assignedC}
                                  </span>
                                );
                              }
                              // 权限账号即使定案（isFinal）也能重新做 QC 覆盖结果，普通账号只能查看。
                              const cEditable = !isFinal || privileged;
                              return (
                                <Button
                                  variant="ghost"
                                  icon={Edit3}
                                  onClick={() =>
                                    navigate(
                                      cEditable
                                        ? `/annotate/${s.sessionId}?role=C`
                                        : `/annotate/${s.sessionId}?role=C&view=1`,
                                    )
                                  }
                                >
                                  {cEditable ? "Do QC" : "View QC"}
                                </Button>
                              );
                            })()}
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

      {reconcileSession && (() => {
        const flow = getReviewFlow(reconcileSession.sessionId);
        if (!flow?.aResult?.bot || !flow?.bResult?.bot) return null;
        return (
          <ReconcileModal
            session={reconcileSession}
            aScore={flow.aResult.bot}
            bScore={flow.bResult.bot}
            aName={shortName(flow.aAnnotator ?? flow.aAssignee) ?? "A"}
            bName={shortName(flow.bAnnotator ?? flow.bAssignee) ?? "B"}
            dimName={dimName}
            dims={activeDims}
            onClose={() => setReconcileSession(null)}
            onConfirm={(scores, reasons) => {
              try {
                const bot = computeActorScore(scores, rubric, rubricWeights, reasons);
                reconcileDiff(reconcileSession.sessionId, { ruleVersion: flow.aResult!.ruleVersion, bot }, currentEmail);
                setReconcileSession(null);
              } catch (e) {
                alert(e instanceof Error ? e.message : "拉齐失败");
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

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Operation time</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Operator</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Operation</th>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">Version</th>
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
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">{l.at}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-subtle">{l.operator}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-ink">{l.action}</td>
                      <td className="whitespace-nowrap px-3 py-2">
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

/**
 * Quick A/B reconciliation (in-Detail, no page nav). Diff dimensions are
 * highlighted; QA picks A's or B's value per diff dim (or types another).
 * Non-diff dimensions auto-carry (A == B there). Confirm finalizes the case
 * into the QC sampling pool.
 */
function ReconcileModal({
  session,
  aScore,
  bScore,
  aName,
  bName,
  dimName,
  dims,
  onClose,
  onConfirm,
}: {
  session: SessionRow;
  aScore: ActorScore;
  bScore: ActorScore;
  aName: string;
  bName: string;
  dimName: (k: string) => string;
  dims: RubricDimension[];
  onClose: () => void;
  onConfirm: (scores: Record<string, number>, reasons?: Record<string, string>) => void;
}) {
  const diffKeys = diffDims(aScore, bScore);
  // Per diff dim: pick A's value, B's value, or "other" (a re-chosen score).
  type Pick = { who: "A" | "B" } | { who: "other"; score: number };
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  // "other" is only resolved once a score has actually been chosen.
  const allResolved = [...diffKeys].every((k) => {
    const p = picked[k];
    if (!p) return false;
    if (p.who === "other") return !Number.isNaN(p.score);
    return true;
  });

  const reasonFor = (key: string, score: number): string | undefined =>
    dims.find((d) => d.key === key)?.reasons.find((r) => r.score === score)?.text;

  const build = () => {
    const scores: Record<string, number> = { ...aScore.scores };
    const reasons: Record<string, string> = { ...(aScore.reasons ?? {}) };
    for (const k of diffKeys) {
      const pick = picked[k];
      if (!pick) continue;
      if (pick.who === "other") {
        if (Number.isNaN(pick.score)) continue;
        scores[k] = pick.score;
        const r = reasonFor(k, pick.score);
        if (r !== undefined) reasons[k] = r;
      } else {
        const from = pick.who === "B" ? bScore : aScore;
        scores[k] = from.scores[k];
        if (from.reasons?.[k] !== undefined) reasons[k] = from.reasons[k];
      }
    }
    return { scores, reasons };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">拉齐 A / B Diff</h3>
            <p className="font-mono text-xs text-subtle">{session.sessionId}</p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <p className="rounded-md bg-page px-3 py-2 text-xs text-subtle">
            共 <span className="font-semibold text-danger">{diffKeys.size}</span> 个维度分歧。逐个选定最终结果；一致的维度自动沿用。确认后进入 QC 抽样池。
          </p>
          {dims.map((d) => {
            const isDiff = diffKeys.has(d.key);
            const aVal = aScore.scores[d.key];
            const bVal = bScore.scores[d.key];
            if (!isDiff) {
              return (
                <div key={d.key} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span className="text-sm text-subtle">{dimName(d.key)}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone="neutral">一致</Badge>
                    <span className="font-mono text-sm font-semibold text-ink">{aVal}</span>
                  </span>
                </div>
              );
            }
            const sel = picked[d.key];
            const otherActive = sel?.who === "other";
            return (
              <div key={d.key} className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
                <div className="mb-2 flex items-center gap-2">
                  <Badge tone="danger">Diff</Badge>
                  <span className="text-sm font-medium text-ink">{dimName(d.key)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { who: "A" as const, name: aName, val: aVal, reason: aScore.reasons?.[d.key] },
                    { who: "B" as const, name: bName, val: bVal, reason: bScore.reasons?.[d.key] },
                  ]).map((opt) => {
                    const on = sel?.who === opt.who;
                    return (
                      <button
                        key={opt.who}
                        type="button"
                        onClick={() => setPicked((p) => ({ ...p, [d.key]: { who: opt.who } }))}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          on ? "border-brand bg-brand-light" : "border-line hover:border-brand/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${on ? "text-brand" : "text-subtle"}`}>{opt.who} · {opt.name}</span>
                          <span className="font-mono text-sm font-semibold text-ink">{opt.val}</span>
                        </div>
                        {opt.reason && <div className="mt-0.5 truncate text-[11px] text-muted" title={opt.reason}>{opt.reason}</div>}
                      </button>
                    );
                  })}
                  {/* Third option: neither A nor B is right — re-pick a score. */}
                  <button
                    type="button"
                    onClick={() =>
                      setPicked((p) => {
                        const cur = p[d.key];
                        // Toggle into "other" mode; keep score if already chosen.
                        if (cur?.who === "other") return p;
                        return { ...p, [d.key]: { who: "other", score: NaN } as Pick };
                      })
                    }
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      otherActive ? "border-brand bg-brand-light" : "border-line hover:border-brand/40"
                    }`}
                  >
                    <span className={`block text-xs font-medium ${otherActive ? "text-brand" : "text-subtle"}`}>其他</span>
                    <span className="mt-0.5 block text-[11px] text-muted">我们都不对，重新选一个</span>
                  </button>
                </div>

                {/* When "other" is chosen, expand this dim's score options to re-pick. */}
                {otherActive && (
                  <div className="mt-2 rounded-lg border border-brand/30 bg-white p-2">
                    <p className="mb-1.5 text-[11px] text-subtle">重新选一个分数：</p>
                    <div className="flex flex-wrap gap-1.5">
                      {d.options.map((sc) => {
                        const chosen = sel?.who === "other" && (sel as { score: number }).score === sc;
                        return (
                          <button
                            key={sc}
                            type="button"
                            title={reasonFor(d.key, sc)}
                            onClick={() => setPicked((p) => ({ ...p, [d.key]: { who: "other", score: sc } }))}
                            className={`h-8 w-8 rounded-md border font-mono text-sm font-semibold transition-colors ${
                              chosen ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand/50"
                            }`}
                          >
                            {sc}
                          </button>
                        );
                      })}
                    </div>
                    {sel?.who === "other" && !Number.isNaN((sel as { score: number }).score) && reasonFor(d.key, (sel as { score: number }).score) && (
                      <p className="mt-1.5 text-[11px] text-muted">{reasonFor(d.key, (sel as { score: number }).score)}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-brand hover:bg-page">
            Cancel
          </button>
          <button
            onClick={() => {
              const { scores, reasons } = build();
              onConfirm(scores, reasons);
            }}
            disabled={!allResolved}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            确认拉齐并进入 QC 池
          </button>
        </div>
      </div>
    </div>
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
