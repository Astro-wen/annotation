import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Ban } from "lucide-react";
import Layout from "@/components/Layout";
import ChatThread from "@/components/ChatThread";
import { ScoreRow } from "@/components/ScorePanel";
import Badge from "@/components/Badge";
import { getConversation, getTicketThread } from "@/mock/conversation";
import { executionOptions } from "@/mock/settings";
import { type ExpectedResult, type ProblemType, type ResultScore, type ReviewRole, resultGroupOf, evidenceKindOf } from "@/mock/types";
import { useRubricStore } from "@/store/rubricStore";
import { useSessionStore, type RoundResult } from "@/store/sessionStore";
import { useCurrentUserStore, isViewer, shortNameOf } from "@/lib/currentUser";
import { samePerson } from "@/lib/access";
import { computeResultScore } from "@/lib/scoring";

const PROBLEM_TYPES: { value: ProblemType; label: string }[] = [
  { value: "R1", label: "R1 Information" },
  { value: "R2", label: "R2 Personalized Info" },
  { value: "R3", label: "R3 Operation" },
];

export default function Annotation() {
  const { sessionId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const role = (params.get("role") as ReviewRole | null) ?? "A";
  const roleLabelCN = role === "C" ? "QC" : role === "B" ? "复评" : "标注";
  const viewOnly = params.get("view") === "1";

  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  const viewer = isViewer(currentEmail);
  const getCaseBySession = useSessionStore((s) => s.getCaseBySession);
  const flows = useSessionStore((s) => s.flows);
  const submitAnnotation = useSessionStore((s) => s.submitAnnotation);

  const rubric = useRubricStore((s) => s.rubric);
  const weights = useRubricStore((s) => s.weights);
  const activeRubricForVersion = useRubricStore((s) => s.activeRubricForVersion);
  const skipReasonsForVersion = useRubricStore((s) => s.skipReasonsForVersion);
  const reasonFor = useRubricStore((s) => s.reasonFor);

  const caseRow = getCaseBySession(sessionId);
  const flow = caseRow ? flows.find((f) => f.caseId === caseRow.caseId) : undefined;

  const ruleVersion = caseRow?.ruleVersion ?? 1;
  const dims = useMemo(() => activeRubricForVersion(ruleVersion), [ruleVersion, rubric]);
  const skipReasonOptions = useMemo(() => skipReasonsForVersion(ruleVersion), [ruleVersion, rubric]);
  const sqsDims = dims.filter((d) => d.group === "SQS");
  const uefDims = dims.filter((d) => d.group === "UEF");

  // Anti-self-review (enforced for everyone, no bypass): who was A can't be B/C;
  // who was B can't be C.
  const selfConflict = useMemo(() => {
    if (!flow) return false;
    const aP = flow.aResult?.by ?? flow.aAssignee;
    const bP = flow.bResult?.by ?? flow.bAssignee;
    if (role === "B") return samePerson(currentEmail, aP);
    if (role === "C") return samePerson(currentEmail, aP) || samePerson(currentEmail, bP);
    return false;
  }, [flow, role, currentEmail]);

  // Per-result score state: resultId -> { scores, reasons, skips, problemType }.
  // Every dimension starts blank — Responsiveness is a manual, optional field
  // (no auto scoring in Phase 1); C's card is also blank (no A/B prefill).
  const [state, setState] = useState<Record<string, { scores: Record<string, number>; reasons: Record<string, string>; skips: Record<string, string>; problemType?: ProblemType }>>(() => {
    const init: Record<string, { scores: Record<string, number>; reasons: Record<string, string>; skips: Record<string, string>; problemType?: ProblemType }> = {};
    for (const er of caseRow?.expectedResults ?? []) {
      init[er.resultId] = { scores: {}, reasons: {}, skips: {} };
    }
    return init;
  });

  // Active result tab (the single switch point for evidence + scoring object).
  const [activeResultId, setActiveResultId] = useState<string>(caseRow?.expectedResults[0]?.resultId ?? "");

  if (!caseRow) {
    return (
      <Layout>
        <div className="p-10 text-sm text-subtle">Case not found. <button className="text-brand underline" onClick={() => navigate("/home")}>Back</button></div>
      </Layout>
    );
  }

  // Read-only when: 只读账号；显式 view；或 A/B 在 Finalized Baseline 形成后
  // （定稿后不可再改 A/B；C 复核与之并行、QC 完成后仍可再改）。
  const readOnly =
    viewer ||
    viewOnly ||
    (role !== "C" && !!flow?.finalizedBaseline);

  // Per-dimension A/B reference for the C reviewer. With parallel QC, A/B may not
  // have scored yet — show "—" then; once they submit, show each side's value.
  const refValue = (round: RoundResult | undefined, resultId: string, dimKey: string): string => {
    const s = round?.results?.[resultId];
    if (!s) return "—";
    if (s.skips && s.skips[dimKey] !== undefined) return "Skip";
    return s.scores[dimKey] !== undefined ? String(s.scores[dimKey]) : "—";
  };
  const showAbRef = role === "C";
  const abRefLine = (resultId: string, dimKey: string) => {
    if (!showAbRef) return null;
    const a = refValue(flow?.aResult, resultId, dimKey);
    const b = flow?.mode === "Back-to-Back" ? refValue(flow?.bResult, resultId, dimKey) : null;
    return (
      <p className="mb-1 font-mono text-[11px] text-muted">
        标注={a}
        {b !== null && <> · 复评={b}</>}
      </p>
    );
  };

  const setScore = (rid: string, dimKey: string, v: number) =>
    setState((prev) => {
      const nextSkips = { ...prev[rid].skips };
      delete nextSkips[dimKey]; // choosing a number clears any Skip on this dim
      return {
        ...prev,
        [rid]: {
          ...prev[rid],
          scores: { ...prev[rid].scores, [dimKey]: v },
          reasons: { ...prev[rid].reasons, [dimKey]: reasonFor(dimKey, v) ?? prev[rid].reasons[dimKey] ?? "" },
          skips: nextSkips,
        },
      };
    });
  const setReason = (rid: string, dimKey: string, text: string) =>
    setState((prev) => ({ ...prev, [rid]: { ...prev[rid], reasons: { ...prev[rid].reasons, [dimKey]: text } } }));
  const setProblemType = (rid: string, pt: ProblemType) =>
    setState((prev) => ({ ...prev, [rid]: { ...prev[rid], problemType: pt } }));
  // Toggle Skip on a dimension: enabling requires a Skip Reason; disabling clears it.
  const toggleSkip = (rid: string, dimKey: string) =>
    setState((prev) => {
      const skipped = prev[rid].skips[dimKey] !== undefined;
      const nextSkips = { ...prev[rid].skips };
      const nextScores = { ...prev[rid].scores };
      if (skipped) {
        delete nextSkips[dimKey];
      } else {
        nextSkips[dimKey] = skipReasonOptions[0] ?? ""; // default reason; user can change
        delete nextScores[dimKey]; // Skip clears the numeric score
      }
      return { ...prev, [rid]: { ...prev[rid], skips: nextSkips, scores: nextScores } };
    });
  const setSkipReason = (rid: string, dimKey: string, reason: string) =>
    setState((prev) => ({ ...prev, [rid]: { ...prev[rid], skips: { ...prev[rid].skips, [dimKey]: reason } } }));

  // Responsiveness is optional; everything else must be scored or Skipped.
  const requiredDims = sqsDims.concat(uefDims).filter((d) => d.key !== "responsiveness");

  const cardComplete = (er: ExpectedResult): boolean => {
    const st = state[er.resultId];
    if (!st) return false;
    const saSkipped = st.skips["solution_adoption"] !== undefined;
    const needsPT = sqsDims.some((d) => d.key === "solution_adoption");
    if (needsPT && !saSkipped && !st.problemType) return false;
    return requiredDims.every((d) => {
      const skipped = st.skips[d.key] !== undefined;
      if (skipped) return !!st.skips[d.key];
      return st.scores[d.key] !== undefined;
    });
  };

  const allComplete = caseRow.expectedResults.every(cardComplete);

  const buildAndSubmit = () => {
    const perResult: Record<string, ResultScore> = {};
    for (const er of caseRow.expectedResults) {
      const st = state[er.resultId];
      perResult[er.resultId] = computeResultScore(st.scores, dims, weights, st.reasons, st.problemType, st.skips);
    }
    try {
      submitAnnotation(caseRow.caseId, role, perResult, ruleVersion, currentEmail);
      navigate(`/task/${caseRow.taskId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "提交失败");
    }
  };

  // Anti-self-review block page.
  if (selfConflict) {
    return (
      <Layout>
        <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-center">
          <Ban className="h-10 w-10 text-danger" />
          <h2 className="text-lg font-semibold text-ink">你已标过当前 session！</h2>
          <p className="max-w-md text-sm text-subtle">
            防自审：你已经评过这条 case，不能再对同一条 case 复核（任何人都不能绕过）。
          </p>
          <button onClick={() => navigate(`/task/${caseRow.taskId}`)} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">返回详情</button>
        </div>
      </Layout>
    );
  }

  // Active result + its evidence (Session vs Ticket — the same tab drives both).
  const activeResult = caseRow.expectedResults.find((er) => er.resultId === activeResultId) ?? caseRow.expectedResults[0];
  const activeGroup = resultGroupOf(activeResult);
  const activeEvidence = evidenceKindOf(activeGroup);
  const evidenceThread = activeEvidence === "TICKET" ? getTicketThread() : getConversation(caseRow.caseId);
  const st = state[activeResult.resultId];
  const preview = computeResultScore(st.scores, dims, weights);

  return (
    <Layout>
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
        <button onClick={() => navigate(`/task/${caseRow.taskId}`)} className="flex items-center gap-1 text-xs text-subtle hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回
        </button>
        <div className="flex items-center gap-2 text-xs">
          <Badge tone="brand">{roleLabelCN}</Badge>
          <span className="text-subtle">Config v{ruleVersion}</span>
          {readOnly && <Badge tone="neutral">只读</Badge>}
        </div>
      </div>

      {/* Result Tabs — the single switch for both evidence and scoring object. */}
      <div className="flex items-center gap-1 border-b border-line bg-white px-6 pt-2">
        {caseRow.expectedResults.map((er) => {
          const g = resultGroupOf(er);
          const active = er.resultId === activeResult.resultId;
          return (
            <button
              key={er.resultId}
              onClick={() => setActiveResultId(er.resultId)}
              className={`flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active ? "border-brand text-brand" : "border-transparent text-subtle hover:text-ink"
              }`}
            >
              {g}
              <span className={`rounded px-1 text-[10px] font-normal ${active ? "bg-brand-light text-brand" : "bg-page text-muted"}`}>
                {evidenceKindOf(g) === "TICKET" ? "Ticket" : "Session"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-[calc(100vh-8.5rem)]">
        {/* Left 60% evidence — follows the active tab. */}
        <div className="w-3/5 border-r border-line p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            Evidence · {activeEvidence === "TICKET" ? "Ticket" : "Conversation"}
            <Badge tone="neutral">{caseRow.knowledgeSource}</Badge>
            <span className="font-mono text-xs text-muted">
              {activeEvidence === "TICKET" ? (caseRow.ticketId ?? "—") : caseRow.sessionId}
            </span>
          </div>
          <div className="mb-3 rounded-lg border border-line bg-page px-3 py-2 text-xs text-subtle">
            Language {caseRow.language} · Region {caseRow.regionCode} · {caseRow.annotationCategory}
          </div>
          <ChatThread messages={evidenceThread} />
        </div>

        {/* Right 40% scoring — the active result's single card. */}
        <div className="w-2/5 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-page px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">{activeGroup} Result</p>
              <p className="text-xs text-subtle">{caseRow.expectedResults.length} 个结果 · {activeResult.entryMode}</p>
            </div>
            <span className="font-mono text-xs text-brand">
              SQS {preview.sqsAvg.toFixed(2)} · UEF {preview.uefTotal.toFixed(2)} · UXS {preview.uxs.toFixed(2)}
            </span>
          </div>

          <div className="pb-3">
            {/* SQS dimensions */}
            {sqsDims.map((d) => {
              const isExec = d.key === "execution_correctness";
              const isSA = d.key === "solution_adoption";
              const isResp = d.key === "responsiveness";
              const options = isExec ? executionOptions(caseRow.knowledgeSource) : d.options;
              const reasonOptions = d.reasons.filter((r) => options.includes(r.score));
              const skipped = st.skips[d.key] !== undefined;
              return (
                <div key={d.key} className="px-4 pt-3">
                  {isSA && !skipped && (
                    <div className="mb-2">
                      <p className="mb-1 text-xs font-medium text-ink">Problem Type（先判定 R1/R2/R3 再打分）</p>
                      <div className="flex gap-1">
                        {PROBLEM_TYPES.map((pt) => (
                          <button
                            key={pt.value}
                            disabled={readOnly}
                            onClick={() => setProblemType(activeResult.resultId, pt.value)}
                            className={`rounded-md border px-2 py-1 text-xs ${st.problemType === pt.value ? "border-brand bg-brand text-white" : "border-line text-subtle hover:border-brand/50"} disabled:opacity-50`}
                          >
                            {pt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {abRefLine(activeResult.resultId, d.key)}
                  <ScoreRow
                    label={isResp ? `${d.dimension}（选填）` : d.dimension}
                    hint={
                      isExec
                        ? `按 Knowledge Source 联动：${caseRow.knowledgeSource === "Skill" ? "Skill 3/2/1/0" : "FAQ/SOP 3/1/0（无 2 档）"}`
                        : isSA
                          ? `${st.problemType ?? "R?"} · scored by R1 / R2 / R3 resolution`
                          : undefined
                    }
                    options={options}
                    value={st.scores[d.key] ?? null}
                    onChange={(v) => setScore(activeResult.resultId, d.key, v)}
                    disabled={readOnly || (isSA && !st.problemType && !skipped)}
                    reason={st.reasons[d.key] ?? ""}
                    onReasonChange={(v) => setReason(activeResult.resultId, d.key, v)}
                    reasonOptions={reasonOptions}
                    skippable
                    skipped={skipped}
                    skipReason={st.skips[d.key] ?? ""}
                    skipReasons={skipReasonOptions}
                    onToggleSkip={() => toggleSkip(activeResult.resultId, d.key)}
                    onSkipReasonChange={(v) => setSkipReason(activeResult.resultId, d.key, v)}
                  />
                </div>
              );
            })}

            {/* UEF dimension */}
            {uefDims.map((d) => {
              const skipped = st.skips[d.key] !== undefined;
              return (
                <div key={d.key} className="px-4 pt-3">
                  {abRefLine(activeResult.resultId, d.key)}
                  <ScoreRow
                    label={`UEF · ${d.dimension}`}
                    options={d.options}
                    value={st.scores[d.key] ?? null}
                    onChange={(v) => setScore(activeResult.resultId, d.key, v)}
                    disabled={readOnly}
                    reason={st.reasons[d.key] ?? ""}
                    onReasonChange={(v) => setReason(activeResult.resultId, d.key, v)}
                    reasonOptions={d.reasons}
                    skippable
                    skipped={skipped}
                    skipReason={st.skips[d.key] ?? ""}
                    skipReasons={skipReasonOptions}
                    onToggleSkip={() => toggleSkip(activeResult.resultId, d.key)}
                    onSkipReasonChange={(v) => setSkipReason(activeResult.resultId, d.key, v)}
                  />
                </div>
              );
            })}
          </div>

          {!readOnly && (
            <div className="sticky bottom-0 flex items-center justify-between border-t border-line bg-white px-4 py-3">
              <span className="text-xs text-subtle">
                {allComplete ? "全部结果已完成，可提交" : "请完成全部结果卡（含 Problem Type）后提交"}
              </span>
              <button
                disabled={!allComplete}
                onClick={buildAndSubmit}
                className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-page disabled:text-subtle"
              >
                Submit {roleLabelCN}
              </button>
            </div>
          )}
          {readOnly && (
            <div className="px-4 py-4 text-center text-xs text-subtle">
              只读视图（查看 / 结果已冻结）。当前账号：{shortNameOf(currentEmail)}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
