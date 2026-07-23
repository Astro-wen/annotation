import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Ban } from "lucide-react";
import Layout from "@/components/Layout";
import { ScoreRow } from "@/components/ScorePanel";
import Badge from "@/components/Badge";
import { executionOptions } from "@/mock/settings";
import { type ExpectedResult, type ProblemType, type ResultScore, type ReviewRole, resultGroupOf, evidenceKindOf } from "@/mock/types";
import { useRubricStore } from "@/store/rubricStore";
import { useSessionStore } from "@/store/sessionStore";
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
  const cases = useSessionStore((s) => s.cases);
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
  const [currentCaseId, setCurrentCaseId] = useState(caseRow?.caseId);
  const [state, setState] = useState<Record<string, { scores: Record<string, number>; reasons: Record<string, string>; skips: Record<string, string>; problemType?: ProblemType }>>(() => {
    const init: Record<string, { scores: Record<string, number>; reasons: Record<string, string>; skips: Record<string, string>; problemType?: ProblemType }> = {};
    for (const er of caseRow?.expectedResults ?? []) {
      init[er.resultId] = { scores: {}, reasons: {}, skips: {} };
    }
    return init;
  });

  // Active result tab (the single switch point for evidence + scoring object).
  const [activeResultId, setActiveResultId] = useState<string>(caseRow?.expectedResults[0]?.resultId ?? "");

  // Reset state when navigating to a new case
  if (caseRow && caseRow.caseId !== currentCaseId) {
    setCurrentCaseId(caseRow.caseId);
    const init: Record<string, { scores: Record<string, number>; reasons: Record<string, string>; skips: Record<string, string>; problemType?: ProblemType }> = {};
    for (const er of caseRow.expectedResults) {
      init[er.resultId] = { scores: {}, reasons: {}, skips: {} };
    }
    setState(init);
    setActiveResultId(caseRow.expectedResults[0]?.resultId ?? "");
  }

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

  // QC reference lives in the top-right summary block. It always exists for C,
  // and stays as dashes until a Finalized Baseline is available.
  const showAbRef = role === "C";

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
  
  // Filter nextCase to only include cases this user is responsible for in the current role.
  const myCases = !caseRow ? [] : cases.filter((c) => {
    if (c.taskId !== caseRow.taskId) return false;
    const f = flows.find((x) => x.caseId === c.caseId);
    if (!f) return false;
    if (role === "A") return samePerson(currentEmail, f.aAssignee) || samePerson(currentEmail, f.aResult?.by);
    if (role === "B") return samePerson(currentEmail, f.bAssignee) || samePerson(currentEmail, f.bResult?.by);
    if (role === "C") return samePerson(currentEmail, f.cReviewer);
    return false;
  });

  const currentIndex = myCases.findIndex((c) => c.caseId === caseRow?.caseId);
  const prevCase = currentIndex > 0 ? myCases[currentIndex - 1] : undefined;
  const nextCase = currentIndex >= 0 && currentIndex < myCases.length - 1 ? myCases[currentIndex + 1] : undefined;

  const st = state[activeResult.resultId] ?? { scores: {}, reasons: {}, skips: {} };
  const preview = computeResultScore(st.scores, dims, weights);
  const qcReference = flow?.finalizedBaseline?.results?.[activeResult.resultId];
  const mockTitle = activeEvidence === "TICKET" ? "A ticket page mock" : "A session page mock";
  const qcReferenceCards = [
    { label: "SQS", value: qcReference ? qcReference.sqsAvg.toFixed(2) : "—" },
    { label: "User Satisfaction", value: qcReference ? qcReference.uefTotal.toFixed(2) : "—" },
    { label: "User Experience Score", value: qcReference ? qcReference.uxs.toFixed(2) : "—" },
  ];

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
          <div className="flex h-full flex-col rounded-xl border border-line bg-page">
            <div className="border-b border-line px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
                <span>{mockTitle}</span>
                <Badge tone="neutral">{caseRow.knowledgeSource}</Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-subtle">
                <span>Language {caseRow.language}</span>
                <span>Region {caseRow.regionCode}</span>
                <span>{caseRow.annotationCategory}</span>
                <span className="font-mono text-[11px] text-muted">
                  {activeEvidence === "TICKET" ? (caseRow.ticketId ?? "—") : caseRow.sessionId}
                </span>
              </div>
            </div>
            <div className="flex flex-1 items-start justify-start p-4">
              <div className="rounded-lg border border-dashed border-line/80 bg-white/70 px-4 py-3 text-sm font-medium text-subtle">
                {mockTitle}
              </div>
            </div>
          </div>
        </div>

        {/* Right 40% scoring — the active result's single card. */}
        <div className="w-2/5 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-page px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">{activeGroup} Result</p>
              <p className="text-xs text-subtle">{caseRow.expectedResults.length} 个结果 · {activeResult.entryMode}</p>
            </div>
            {showAbRef ? (
              <div className="w-[320px]">
                <p className="mb-2 text-right text-[10px] font-semibold uppercase tracking-wide text-subtle">QC Reference</p>
                <div className="grid grid-cols-3 gap-2">
                  {qcReferenceCards.map((item) => (
                    <div key={item.label} className="rounded-lg border border-line bg-white px-2 py-2 text-center">
                      <p className="text-[10px] font-medium leading-tight text-subtle">{item.label}</p>
                      <p className="mt-1 font-mono text-xs font-semibold text-brand">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <span className="font-mono text-xs text-brand">
                SQS {preview.sqsAvg.toFixed(2)} · User Satisfaction {preview.uefTotal.toFixed(2)} · User Experience Score {preview.uxs.toFixed(2)}
              </span>
            )}
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

            {/* User Satisfaction dimension */}
            {uefDims.map((d) => {
              const skipped = st.skips[d.key] !== undefined;
              return (
                <div key={d.key} className="px-4 pt-3">
                  <ScoreRow
                    label={`User Satisfaction · ${d.dimension}`}
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
              <div className="flex items-center gap-2">
                <button
                  disabled={!prevCase}
                  onClick={() => {
                    if (!prevCase) return;
                    navigate(`/annotate/${prevCase.sessionId}?role=${role}${viewOnly ? "&view=1" : ""}`);
                  }}
                  className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  disabled={!allComplete}
                  onClick={buildAndSubmit}
                  className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-page disabled:text-subtle"
                >
                  Submit {roleLabelCN}
                </button>
                <button
                  onClick={() => {
                    if (nextCase) {
                      navigate(`/annotate/${nextCase.sessionId}?role=${role}${viewOnly ? "&view=1" : ""}`);
                    } else {
                      alert("已完成该 task 的所有评注任务！");
                      navigate(`/home`);
                    }
                  }}
                  className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          {readOnly && (
            <div className="sticky bottom-0 flex items-center justify-between border-t border-line bg-white px-4 py-3 text-xs text-subtle">
              <span>只读视图（查看 / 结果已冻结）。当前账号：{shortNameOf(currentEmail)}</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={!prevCase}
                  onClick={() => {
                    if (!prevCase) return;
                    navigate(`/annotate/${prevCase.sessionId}?role=${role}${viewOnly ? "&view=1" : ""}`);
                  }}
                  className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => {
                    if (nextCase) {
                      navigate(`/annotate/${nextCase.sessionId}?role=${role}${viewOnly ? "&view=1" : ""}`);
                    } else {
                      alert("已完成该 task 的所有评注任务！");
                      navigate(`/home`);
                    }
                  }}
                  className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-page disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
