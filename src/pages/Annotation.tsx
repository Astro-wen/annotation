import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Ban, ChevronDown, ChevronRight } from "lucide-react";
import Layout from "@/components/Layout";
import ChatThread from "@/components/ChatThread";
import { ScoreRow } from "@/components/ScorePanel";
import Badge from "@/components/Badge";
import { getConversation } from "@/mock/conversation";
import { executionOptions } from "@/mock/settings";
import { type ExpectedResult, type ProblemType, type ResultScore, type ReviewRole, resultGroupOf } from "@/mock/types";
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

// Mock auto-scored Responsiveness (system-recognized, read-only).
function autoResponsiveness(): number {
  return 3;
}

export default function Annotation() {
  const { sessionId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const role = (params.get("role") as ReviewRole | null) ?? "A";
  const roleLabelCN = role === "C" ? "复核" : role === "B" ? "复评" : "标注";
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

  // Per-result score state: resultId -> { scores, reasons, skips, problemType }
  const [state, setState] = useState<Record<string, { scores: Record<string, number>; reasons: Record<string, string>; skips: Record<string, string>; problemType?: ProblemType }>>(() => {
    const init: Record<string, { scores: Record<string, number>; reasons: Record<string, string>; skips: Record<string, string>; problemType?: ProblemType }> = {};
    for (const er of caseRow?.expectedResults ?? []) {
      // Responsiveness auto-scored; everything else empty. A/B blind, C blank.
      init[er.resultId] = { scores: { responsiveness: autoResponsiveness() }, reasons: {}, skips: {} };
    }
    return init;
  });

  // Collapse state per result card (卷子). Default: all expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleCard = (rid: string) => setCollapsed((c) => ({ ...c, [rid]: !c[rid] }));

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

  // C reference (read-only frozen Finalized Baseline; no A/B raw diff).
  const baseline = flow?.sampledBaseline ?? flow?.finalizedBaseline;

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

  // Whether all cards are complete enough to submit.
  const requiredDims = sqsDims.concat(uefDims).filter((d) => !d.auto); // responsiveness auto excluded

  const cardComplete = (er: ExpectedResult): boolean => {
    const st = state[er.resultId];
    if (!st) return false;
    // Solution Adoption needs a problem type first (unless it is Skipped).
    const saSkipped = st.skips["solution_adoption"] !== undefined;
    const needsPT = sqsDims.some((d) => d.key === "solution_adoption");
    if (needsPT && !saSkipped && !st.problemType) return false;
    // Each dimension must be either scored or Skipped (with a reason).
    return requiredDims.every((d) => {
      const skipped = st.skips[d.key] !== undefined;
      if (skipped) return !!st.skips[d.key]; // must have a Skip Reason
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

  const conversation = getConversation(caseRow.caseId);

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

      <div className="flex min-h-[calc(100vh-6.5rem)]">
        {/* Left 60% evidence */}
        <div className="w-3/5 border-r border-line p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            Evidence · Conversation
            <Badge tone="neutral">{caseRow.knowledgeSource}</Badge>
            <span className="font-mono text-xs text-muted">{caseRow.sessionId}</span>
          </div>
          <div className="mb-3 rounded-lg border border-line bg-page px-3 py-2 text-xs text-subtle">
            Language {caseRow.language} · Region {caseRow.regionCode} · Type {caseRow.caseType} · {caseRow.annotationCategory}
            <span className="ml-2 text-[11px]">PII 已脱敏为占位符（[EMAIL]/[PHONE]/[ADDRESS]）</span>
          </div>
          <ChatThread messages={conversation} />
        </div>

        {/* Right 40% scoring */}
        <div className="w-2/5 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 border-b border-line bg-white px-4 py-3">
            <p className="text-sm font-semibold text-ink">
              评分区（{caseRow.expectedResults.length} 张评分卡）
            </p>
            <p className="text-xs text-subtle">
              Chatbot / Ticketbot → AI 评分卷；Human → Human 评分卷。一次提交完成全部卡片。
            </p>
          </div>

          {/* C reference panel: read-only frozen baseline */}
          {role === "C" && baseline && (
            <div className="border-b border-line bg-brand-light/40 px-4 py-3">
              <p className="mb-2 text-xs font-semibold text-brand">冻结的定稿基线（只读参考，不展示原始分歧）</p>
              {caseRow.expectedResults.map((er) => {
                const s = baseline.results[er.resultId];
                return (
                  <div key={er.resultId} className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-subtle">{resultGroupOf(er)}</span>
                    <span className="font-mono text-ink">
                      {s ? `SQS ${s.sqsAvg.toFixed(2)} · UEF ${s.uefTotal.toFixed(2)} · UXS ${s.uxs.toFixed(2)}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {caseRow.expectedResults.map((er) => {
            const st = state[er.resultId];
            const sqsTotalPreview = computeResultScore(st.scores, dims, weights);
            const isCollapsed = collapsed[er.resultId];
            return (
              <div key={er.resultId} className="border-b-4 border-line">
                {/* Card header — click to collapse/expand this 评分卷 (like SQS/UEF). */}
                <button
                  type="button"
                  onClick={() => toggleCard(er.resultId)}
                  className="flex w-full items-center justify-between bg-page px-4 py-2 text-left hover:bg-gray-100"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-subtle" /> : <ChevronDown className="h-4 w-4 text-subtle" />}
                    {resultGroupOf(er)} <span className="text-xs font-normal text-muted">· {er.formTemplate} 评分卷 · {er.entryMode}</span>
                  </span>
                  <span className="font-mono text-xs text-brand">
                    SQS {sqsTotalPreview.sqsAvg.toFixed(2)} · UEF {sqsTotalPreview.uefTotal.toFixed(2)} · UXS {sqsTotalPreview.uxs.toFixed(2)}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="pb-3">
                    {/* SQS dimensions */}
                    {sqsDims.map((d) => {
                      const isExec = d.key === "execution_correctness";
                      const isSA = d.key === "solution_adoption";
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
                                    onClick={() => setProblemType(er.resultId, pt.value)}
                                    className={`rounded-md border px-2 py-1 text-xs ${st.problemType === pt.value ? "border-brand bg-brand text-white" : "border-line text-subtle hover:border-brand/50"} disabled:opacity-50`}
                                  >
                                    {pt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <ScoreRow
                            label={d.dimension}
                            hint={
                              isExec
                                ? `按 Knowledge Source 联动：${caseRow.knowledgeSource === "Skill" ? "Skill 3/2/1/0" : "FAQ/SOP 3/1/0（无 2 档）"}`
                                : isSA
                                  ? `${st.problemType ?? "R?"} · scored by R1 / R2 / R3 resolution`
                                  : undefined
                            }
                            options={options}
                            value={st.scores[d.key] ?? null}
                            onChange={(v) => setScore(er.resultId, d.key, v)}
                            disabled={readOnly || (isSA && !st.problemType && !skipped) || !!d.auto}
                            reason={st.reasons[d.key] ?? ""}
                            onReasonChange={(v) => setReason(er.resultId, d.key, v)}
                            reasonOptions={reasonOptions}
                            skippable={!d.auto}
                            skipped={skipped}
                            skipReason={st.skips[d.key] ?? ""}
                            skipReasons={skipReasonOptions}
                            onToggleSkip={() => toggleSkip(er.resultId, d.key)}
                            onSkipReasonChange={(v) => setSkipReason(er.resultId, d.key, v)}
                          />
                          {d.auto && (
                            <p className="-mt-2 mb-2 text-[11px] text-muted">系统自动识别，只读直接给值：{st.scores[d.key] ?? "—"}</p>
                          )}
                        </div>
                      );
                    })}

                    {/* UEF dimension */}
                    {uefDims.map((d) => {
                      const skipped = st.skips[d.key] !== undefined;
                      return (
                        <div key={d.key} className="px-4 pt-3">
                          <ScoreRow
                            label={`UEF · ${d.dimension}`}
                            options={d.options}
                            value={st.scores[d.key] ?? null}
                            onChange={(v) => setScore(er.resultId, d.key, v)}
                            disabled={readOnly}
                            reason={st.reasons[d.key] ?? ""}
                            onReasonChange={(v) => setReason(er.resultId, d.key, v)}
                            reasonOptions={d.reasons}
                            skippable
                            skipped={skipped}
                            skipReason={st.skips[d.key] ?? ""}
                            skipReasons={skipReasonOptions}
                            onToggleSkip={() => toggleSkip(er.resultId, d.key)}
                            onSkipReasonChange={(v) => setSkipReason(er.resultId, d.key, v)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {!readOnly && (
            <div className="sticky bottom-0 flex items-center justify-between border-t border-line bg-white px-4 py-3">
              <span className="text-xs text-subtle">
                {allComplete ? "全部评分卡已完成，可提交" : "请完成全部评分卡（含 Problem Type）后提交"}
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
