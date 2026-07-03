import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Layout from "@/components/Layout";
import Badge from "@/components/Badge";
import ChatThread from "@/components/ChatThread";
import { getConversation } from "@/mock/conversation";
import { useCurrentUserStore, USER_OPTIONS } from "@/lib/currentUser";
import { useSessionStore } from "@/store/sessionStore";
import { useRubricStore } from "@/store/rubricStore";
import { diffDims } from "@/lib/diff";

type AccuracyData = { pct: number; matched: number; total: number; perDim: { key: string; match: boolean }[] } | null;

export default function CReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const getReviewFlow = useSessionStore((s) => s.getReviewFlow);
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  const rubric = useRubricStore((s) => s.rubric);
  const dimName = (key: string) => rubric.find((d) => d.key === key)?.dimension ?? key;
  const flow = getReviewFlow(sessionId ?? "");
  const messages = getConversation(sessionId ?? "");
  const isFinal = flow?.currentState === "Final Result Ready";
  // Double-blind = a second reviewer (B) actually submitted; otherwise Normal.
  const isDouble = flow?.bResultStatus === "Submitted";

  // Dimensions where double-blind A and B disagree (for highlight).
  const abDiff = useMemo(
    () => (isDouble ? diffDims(flow?.aResult?.bot, flow?.bResult?.bot) : new Set<string>()),
    [flow, isDouble],
  );
  const overwritten = useMemo(() => new Set(flow?.overwrittenDims ?? []), [flow]);

  // Who reviewed each slot. A/B are the actual annotators (fall back to assignee);
  // C is the person who opened this page and is preparing to review (currentEmail),
  // or the recorded C reviewer once the result is final.
  const shortLabel = (email?: string) => {
    if (!email) return null;
    return USER_OPTIONS.find((u) => u.email === email)?.shortName ?? email;
  };
  const aReviewer = shortLabel(flow?.aAnnotator ?? flow?.aAssignee);
  const bReviewer = shortLabel(flow?.bAnnotator ?? flow?.bAssignee);
  const cReviewer = shortLabel(flow?.cReviewer ?? currentEmail);

  const resultRows = useMemo(() => {
    const g = (r: typeof flow extends undefined ? never : NonNullable<typeof flow>["aResult"], key: string) =>
      r?.bot?.scores?.[key];
    const dim = (label: string, key: string) =>
      [label, g(flow?.aResult, key), g(flow?.bResult, key), g(flow?.cResult, key), key] as const;
    return [
      dim("Understanding Accuracy", "understanding_accuracy"),
      dim("Execution Correctness", "execution_correctness"),
      dim("Solution Adoption", "solution_adoption"),
      dim("Responsiveness", "responsiveness"),
      dim("Service Efficiency", "service_efficiency"),
      dim("Language Quality", "language_quality"),
      dim("Service Outcome Expectation", "service_outcome_expectation"),
      ["SQS Total", flow?.aResult?.bot?.sqsTotal?.toFixed(2), flow?.bResult?.bot?.sqsTotal?.toFixed(2), flow?.cResult?.bot?.sqsTotal?.toFixed(2), ""] as const,
      ["UES Total", flow?.aResult?.bot?.uesTotal?.toFixed(2), flow?.bResult?.bot?.uesTotal?.toFixed(2), flow?.cResult?.bot?.uesTotal?.toFixed(2), ""] as const,
      ["User Satisfaction", flow?.aResult?.bot?.userSatisfaction?.toFixed(2), flow?.bResult?.bot?.userSatisfaction?.toFixed(2), flow?.cResult?.bot?.userSatisfaction?.toFixed(2), ""] as const,
    ];
  }, [flow]);

  // QC accuracy = per-dimension agreement between C (final) and the annotator
  // being audited (A, and B for back-to-back). Each scored dimension is worth
  // an equal share: it counts as 100% if C matches, 0% if not. The overall
  // number is the (equal-weighted) average of per-dimension matches.
  const accuracy = useMemo(() => {
    const c = flow?.cResult?.bot?.scores;
    if (!c) return null;
    const compute = (other?: Record<string, number>) => {
      if (!other) return null;
      const keys = Object.keys(c).filter((k) => other[k] !== undefined);
      if (keys.length === 0) return null;
      const perDim = keys.map((k) => ({ key: k, match: c[k] === other[k] }));
      const matched = perDim.filter((d) => d.match).length;
      return { pct: (matched / keys.length) * 100, matched, total: keys.length, perDim };
    };
    return {
      vsA: compute(flow?.aResult?.bot?.scores),
      vsB: isDouble ? compute(flow?.bResult?.bot?.scores) : null,
    };
  }, [flow, isDouble]);

  return (
    <Layout>
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
        <button onClick={() => navigate("/audit")} className="flex items-center gap-1.5 text-sm font-medium text-subtle hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to Audit
        </button>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">{sessionId}</span>
          <Badge tone={isDouble ? "brand" : "neutral"}>
            {isDouble ? "Double-blind" : "Normal"}
          </Badge>
          {isDouble && (
            <Badge tone={abDiff.size > 0 ? "danger" : "success"}>
              {abDiff.size > 0 ? `A/B Diff · ${abDiff.size}` : "A/B Same"}
            </Badge>
          )}
          <Badge tone={flow?.finalResultStatus === "Ready" ? "success" : "warning"}>
            {isFinal ? "Final Result Ready" : "C Sample QC"}
          </Badge>
        </div>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          <div className="border-b border-line bg-white px-4 py-3 text-sm font-semibold">
            Original Session / Evidence
          </div>
          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto bg-white p-4">
            <ChatThread messages={messages} />
          </div>
        </div>

        <div className="border-b border-line bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">
            A / B / C Review Summary
          </div>
          <div className="space-y-2 p-4 text-sm">
            <div className="grid grid-cols-4 gap-2 border-b border-line pb-2 text-xs font-medium uppercase text-subtle">
              <span>Dimension</span>
              <span className="flex flex-col">
                <span>A</span>
                <span className="text-[11px] normal-case font-normal text-muted">
                  {aReviewer ?? "—"}
                </span>
              </span>
              <span className="flex flex-col">
                <span>B</span>
                <span className="text-[11px] normal-case font-normal text-muted">
                  {bReviewer ?? "—"}
                </span>
              </span>
              <span className="flex flex-col">
                <span>C</span>
                <span className="text-[11px] normal-case font-normal text-brand">
                  {cReviewer ?? "—"}
                </span>
              </span>
            </div>
            {resultRows.map(([k, a, b, c, key]) => {
              const isDiff = key ? abDiff.has(key) : false;
              const isOverwritten = key ? overwritten.has(key) : false;
              return (
                <div
                  key={k}
                  className={`grid grid-cols-4 gap-2 border-b border-line py-1.5 last:border-0 ${
                    isDiff ? "rounded bg-danger-light/60" : ""
                  }`}
                >
                  <span className="text-subtle">
                    {k}
                    {isDiff && <span className="ml-1 font-semibold text-danger">Δ</span>}
                  </span>
                  <span className={`font-medium ${isDiff ? "text-danger" : "text-ink"}`}>{a ?? "—"}</span>
                  <span className={`font-medium ${isDiff ? "text-danger" : "text-ink"}`}>{b ?? "—"}</span>
                  <span className={`font-medium ${isOverwritten ? "text-brand" : "text-ink"}`}>{c ?? "—"}</span>
                </div>
              );
            })}
            {isDouble && (
              <p className="pt-2 text-[11px] text-subtle">
                <span className="font-semibold text-danger">Δ</span> = A / B disagree (double-blind).
                A/B 无需达成一致，C 只需查看差异并 overwrite。
              </p>
            )}
          </div>
        </div>

        <div className="bg-white">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold">
            C QC Action
          </div>
          <div className="space-y-3 p-4">
            {!isFinal ? (
              <>
                <p className="text-sm text-subtle">
                  当前抽样 QC 由 <span className="font-medium text-ink">{currentEmail}</span> 执行。C 可以直接重新标注并 overwrite A / B 的结果。
                </p>
                <button
                  onClick={() => navigate(`/annotate/${sessionId}?role=C&from=audit`)}
                  className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Open C Annotation
                </button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2 rounded-lg border border-success/20 bg-success-light p-4">
                  <p className="text-sm font-medium text-success">Final Result Ready</p>
                  <p className="text-xs text-subtle">
                    C reviewer: <span className="font-medium text-ink">{flow?.cReviewer ?? currentEmail}</span>
                  </p>
                  <p className="text-xs text-subtle">
                    C 的结果已经 overwrite A / B，并作为最终结果保留在系统中。
                  </p>
                </div>

                {accuracy && (
                  <div className="space-y-3 rounded-lg border border-line bg-white p-4">
                    <p className="text-sm font-semibold text-ink">QC Accuracy · C vs {isDouble ? "A / B" : "A"}</p>
                    <p className="text-[11px] text-subtle">
                      逐维对比：C 与被审标注每维一致记 100%，不一致记 0%，等权求平均得到该 case 的准确率。
                    </p>
                    <AccuracyBlock label={`C vs A${aReviewer ? ` (${aReviewer})` : ""}`} data={accuracy.vsA} dimName={(k) => dimName(k)} />
                    {isDouble && (
                      <AccuracyBlock label={`C vs B${bReviewer ? ` (${bReviewer})` : ""}`} data={accuracy.vsB} dimName={(k) => dimName(k)} />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function AccuracyBlock({
  label,
  data,
  dimName,
}: {
  label: string;
  data: AccuracyData;
  dimName: (k: string) => string;
}) {
  if (!data) {
    return (
      <div className="rounded-lg border border-line bg-page px-3 py-2 text-xs text-subtle">
        {label}: 无可对比数据
      </div>
    );
  }
  const tone = data.pct >= 80 ? "text-success" : data.pct >= 50 ? "text-warning" : "text-danger";
  return (
    <div className="rounded-lg border border-line bg-page p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className={`font-mono text-base font-bold ${tone}`}>{data.pct.toFixed(1)}%</span>
      </div>
      <p className="mb-2 text-[11px] text-subtle">
        {data.matched} / {data.total} 维一致
      </p>
      <div className="flex flex-wrap gap-1">
        {data.perDim.map((d) => (
          <span
            key={d.key}
            title={dimName(d.key)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              d.match ? "bg-success-light text-success" : "bg-danger-light text-danger"
            }`}
          >
            {dimName(d.key)}
          </span>
        ))}
      </div>
    </div>
  );
}
