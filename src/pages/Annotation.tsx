import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, AlertOctagon, Info, CheckCircle2, Bot, Circle } from "lucide-react";
import Layout from "@/components/Layout";
import Badge from "@/components/Badge";
import ChatThread from "@/components/ChatThread";
import { PanelSection, ScoreRow, Collapsible } from "@/components/ScorePanel";
import { getConversation } from "@/mock/conversation";
import { type RubricDimension } from "@/mock/settings";
import { useCurrentUserStore } from "@/lib/currentUser";
import { useSessionStore } from "@/store/sessionStore";
import { useRubricStore } from "@/store/rubricStore";
import { computeActorScore } from "@/lib/scoring";
import type { ActorScore } from "@/mock/types";

interface ActorState {
  scores: Record<string, number>;
  reasons: Record<string, string>;
}

const emptyActor: ActorState = { scores: {}, reasons: {} };

// Responsiveness is auto-evaluated by the machine (annotators skip it).
// Thresholds: Chatbot <=10s, Human IM <=120s, Ticket <=24hr -> 3 else 0.
function autoResponsiveness(subtype: string, actor: "bot" | "human"): { score: number; detail: string } {
  if (actor === "human" && subtype !== "Ticketbot") {
    const sec = 70;
    return { score: sec <= 120 ? 3 : 0, detail: `Human IM first response ${sec}s (threshold ≤120s)` };
  }
  if (subtype === "Ticketbot") {
    const hr = 6;
    return { score: hr <= 24 ? 3 : 0, detail: `Ticket first response ${hr}hr (threshold ≤24hr)` };
  }
  const sec = 4;
  return { score: sec <= 10 ? 3 : 0, detail: `Chatbot first token ${sec}s (threshold ≤10s)` };
}

export default function Annotation() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const getSession = useSessionStore((s) => s.getSession);
  const submitAnnotation = useSessionStore((s) => s.submitAnnotation);
  const getReviewFlow = useSessionStore((s) => s.getReviewFlow);
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);

  const rubric = useRubricStore((s) => s.rubric);
  const weights = useRubricStore((s) => s.weights);
  const version = useRubricStore((s) => s.version);

  const session = getSession(sessionId ?? "");
  const flow = getReviewFlow(sessionId ?? "");
  const messages = useMemo(() => getConversation(sessionId ?? ""), [sessionId]);
  const reviewRole = (searchParams.get("role")?.toUpperCase() as "A" | "B" | "C" | null) ?? null;
  // Read-only view (opened without a role, e.g. clicking the session id).
  const viewMode = searchParams.get("view") === "1" || reviewRole === null;

  // Prefill scores:
  //  - View mode: show the authoritative result already on the row (read-only).
  //  - A / B / C all annotate on a blank slate — no prefill from A/B, so C is
  //    not anchored by the results being reviewed.
  const seedActor = useMemo<ActorState>(() => {
    let src: ActorScore | undefined;
    if (viewMode) {
      src = flow?.cResult?.bot ?? flow?.bResult?.bot ?? flow?.aResult?.bot ?? session?.bot;
    }
    if (!src) return emptyActor;
    return { scores: { ...src.scores }, reasons: { ...(src.reasons ?? {}) } };
  }, [viewMode, reviewRole, flow, session]);

  // Lock (read-only) rules:
  //  - View mode is always read-only.
  //  - A can keep editing their own result until a 2nd reviewer (B) submits or
  //    the case is finalized by C; after that A's result is frozen.
  //  - B is locked once they themselves have submitted.
  //  - C is never locked here (C is the reviewer who overwrites).
  const isFinal = flow?.currentState === "Final Result Ready";
  const bSubmitted = flow?.bResultStatus === "Submitted";
  const lockedForA =
    reviewRole === "A" &&
    (bSubmitted || isFinal) &&
    (flow?.aAnnotator === currentEmail || flow?.aAnnotator === undefined);
  const lockedForB =
    reviewRole === "B" &&
    flow?.bResultStatus === "Submitted" &&
    (flow?.bAnnotator === currentEmail || flow?.bAnnotator === undefined);
  const locked = viewMode || lockedForA || lockedForB;

  // Anti-self-review:
  //  - C should not review a session they annotated (A or B) themselves.
  //  - B (back-to-back review) should not review their own A annotation.
  const selfReviewBlocked =
    (reviewRole === "C" && (flow?.aAnnotator === currentEmail || flow?.bAnnotator === currentEmail)) ||
    (reviewRole === "B" && flow?.aAnnotator === currentEmail);

  const [infoOpen, setInfoOpen] = useState(true);
  const [bot, setBot] = useState<ActorState>(seedActor);
  // Re-seed the panel when the case / role / view mode changes (e.g. C opens a
  // case whose prior A/B result should prefill). Keyed on identity — NOT on the
  // whole flow object — so it never wipes the reviewer's in-progress edits.
  useEffect(() => {
    setBot(seedActor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reviewRole, viewMode]);
  const [human, setHuman] = useState<ActorState>(emptyActor);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"sqs" | "ues">("sqs");
  const [activeHumanTab, setActiveHumanTab] = useState<"sqs" | "ues">("sqs");

  const active = useMemo(() => rubric.filter((d) => d.enabled), [rubric]);
  const sqsDims = active.filter((d) => d.group === "SQS");
  const uesDims = active.filter((d) => d.group === "UES");

  if (!session) {
    return (
      <Layout>
        <div className="p-10 text-center text-subtle">Session not found.</div>
      </Layout>
    );
  }

  if (selfReviewBlocked) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg p-10 text-center">
          <AlertOctagon className="mx-auto mb-3 h-8 w-8 text-danger" />
          <h2 className="text-base font-semibold text-ink">Self-review not allowed</h2>
          <p className="mt-2 text-sm text-subtle">
            {reviewRole === "B"
              ? "You annotated this session as A, so you cannot review it as B. Another reviewer must do the second-round review."
              : "You annotated this session as A/B, so you cannot review it as C. Please assign another reviewer."}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-page"
          >
            Back
          </button>
        </div>
      </Layout>
    );
  }

  const isSOP = session.knowledgeSource === "SOP";
  const showHuman = session.hasHumanTransfer ?? false;

  // Build a resolved-scores map (fills auto dims + gating) for one actor.
  const resolve = (st: ActorState, actor: "bot" | "human") => {
    const uaKey = "understanding_accuracy";
    const gated = st.scores[uaKey] === 0; // SQS gating: UA=0 -> EC & SA forced 0
    const resolved: Record<string, number> = {};
    for (const d of active) {
      if (d.auto) {
        resolved[d.key] = d.key === "responsiveness" ? autoResponsiveness(session.serviceSubtype, actor).score : 0;
      } else if (gated && (d.key === "execution_correctness" || d.key === "solution_adoption")) {
        resolved[d.key] = 0;
      } else {
        resolved[d.key] = st.scores[d.key];
      }
    }
    return { resolved, gated };
  };

  // Required completion check.
  const isComplete = (st: ActorState) => {
    const { gated } = resolve(st, "bot");
    for (const d of sqsDims) {
      if (d.auto) continue;
      if (gated && (d.key === "execution_correctness" || d.key === "solution_adoption")) continue;
      if (isSOP && d.key === "execution_correctness") continue;
      if (isSOP && d.key === "solution_adoption") continue;
      if (st.scores[d.key] === undefined) return false;
    }
    for (const d of uesDims) {
      if (st.scores[d.key] === undefined) return false;
    }
    return true;
  };

  const toActorScore = (st: ActorState, actor: "bot" | "human"): ActorScore => {
    const { resolved } = resolve(st, actor);
    return computeActorScore(resolved, active, weights, st.reasons);
  };

  const botScore = toActorScore(bot, "bot");
  const humanScore = toActorScore(human, "human");

  const setBotPatch = (patch: Partial<ActorState>) => setBot((p) => ({ ...p, ...patch }));
  const setHumanPatch = (patch: Partial<ActorState>) => setHuman((p) => ({ ...p, ...patch }));

  const botComplete = isComplete(bot);
  const humanComplete = isComplete(human);
  const requiredFilled = botComplete && (!showHuman || humanComplete);
  const canSubmit = requiredFilled && confirmed && !locked;

  const doSubmit = () => {
    // Never submit in read-only view; never fall back to an implicit A role.
    if (viewMode || reviewRole === null) return;
    try {
      submitAnnotation(
        session.sessionId,
        {
          ruleVersion: version,
          bot: botScore,
          human: showHuman ? humanScore : undefined,
        },
        currentEmail,
        reviewRole,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "提交失败");
      return;
    }
    if (reviewRole === "C") {
      navigate("/audit");
      return;
    }
    navigate(-1);
  };

  return (
    <Layout>
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm font-medium text-subtle hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">Rubric v{version}</span>
          {reviewRole && <Badge tone={reviewRole === "C" ? "success" : "brand"}>Role {reviewRole}</Badge>}
          {locked && (
            <span className="flex items-center gap-1.5 text-xs text-warning">
              <AlertOctagon className="h-3.5 w-3.5" />
              {viewMode
                ? "View only"
                : "Submitted · read-only (only C can overwrite)"}
            </span>
          )}
          {showHuman && (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <Bot className="h-3.5 w-3.5" /> Bot to Human detected (system) · Human Result enabled
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Left: evidence ~60% */}
        <div className="border-b border-line lg:w-[58%] lg:border-b-0 lg:border-r">
          <div className="border-b border-line bg-white px-5 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Evidence · Conversation</h2>
              <Badge tone="brand">{session.serviceSubtype}</Badge>
              <Badge tone={isSOP ? "neutral" : "brand"}>{session.knowledgeSource}</Badge>
            </div>
            <p className="mt-1 font-mono text-xs text-muted">{session.sessionId}</p>
          </div>
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-5">
            <ChatThread messages={messages} />
          </div>
        </div>

        {/* Right: scoring panel ~40% */}
        <div className="bg-white lg:w-[42%]">
          {/* Score Preview (sticky) */}
          <div className="sticky top-14 z-10 flex items-center gap-2 border-b border-line bg-white px-4 py-3">
            <ScorePreview label="SQS" value={botScore.sqsTotal} pass={botScore.sqsPass} />
            <ScorePreview label="UES" value={botScore.uesTotal} pass={botScore.uesPass} />
            <ScorePreview label="User Satisfaction" value={botScore.userSatisfaction} northStar />
          </div>

          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
            <Collapsible title="Session Information" open={infoOpen} onToggle={() => setInfoOpen((o) => !o)}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {[
                  ["Session ID", session.sessionId],
                  ["Task ID", session.taskId],
                  ["Service Subtype", session.serviceSubtype],
                  ["Knowledge Source", session.knowledgeSource],
                  ["Language", session.language],
                  ["Region", session.regionCode],
                  ["Problem Type", session.problemType ?? "—"],
                  ["Signal Priority", session.signalPriority ?? "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </Collapsible>

            {/* QC reference: C annotates on a blank slate, but can see A (and B,
                if double-blind) results here as read-only reference. */}
            {reviewRole === "C" && (flow?.aResult || flow?.bResult) && (
              <ReferencePanel
                a={flow?.aResult?.bot}
                aWho={flow?.aAnnotator}
                b={flow?.bResultStatus === "Submitted" ? flow?.bResult?.bot : undefined}
                bWho={flow?.bAnnotator}
                sqsDims={sqsDims}
                uesDims={uesDims}
              />
            )}

            {/* Bot Result */}
            <ActorPanel
              title={reviewRole ? `${reviewRole} Review Result` : "Bot Result"}
              badge={reviewRole ? `${reviewRole} Review` : "SQS · UES"}
              actor="bot"
              state={bot}
              onPatch={setBotPatch}
              readOnly={locked}
              sqsDims={sqsDims}
              uesDims={uesDims}
              activeTab={activeTab}
              onTab={setActiveTab}
              subtype={session.serviceSubtype}
              isSOP={isSOP}
              problemType={session.problemType}
              signalPriority={session.signalPriority}
            />

            {/* Human Result */}
            {showHuman && (
              <ActorPanel
                title="Human Result"
                badge="Bot to Human"
                badgeTone="success"
                actor="human"
                state={human}
                onPatch={setHumanPatch}
                sqsDims={sqsDims}
                uesDims={uesDims}
                activeTab={activeHumanTab}
                onTab={setActiveHumanTab}
                subtype={session.serviceSubtype}
                isSOP={isSOP}
                problemType={session.problemType}
                signalPriority={session.signalPriority}
              />
            )}

            {/* Submit */}
            <div className="space-y-3 px-4 py-4">
              <label className="flex items-start gap-2 text-xs text-subtle">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm all required SQS / UES fields and reasoning are complete (二次确认).
              </label>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={!canSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" /> Submit Annotation
              </button>
              {!requiredFilled && (
                <p className="text-center text-xs text-warning">Fill all required SQS / UES scores first.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ink">Submit this annotation?</h3>
            <p className="mt-1 text-sm text-subtle">
              Saved under rubric v{version}. A version snapshot will be recorded in the Activity Log.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-line bg-page p-3 text-center text-xs">
              <div>
                <p className="text-muted">SQS</p>
                <p className="font-mono text-sm font-semibold text-ink">{botScore.sqsTotal.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted">UES</p>
                <p className="font-mono text-sm font-semibold text-ink">{botScore.uesTotal.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted">User Satisfaction</p>
                <p className="font-mono text-sm font-semibold text-brand">{botScore.userSatisfaction.toFixed(2)}</p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-line px-4 py-2 text-sm text-subtle hover:bg-page"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  doSubmit();
                }}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function ReferencePanel({
  a,
  aWho,
  b,
  bWho,
  sqsDims,
  uesDims,
}: {
  a?: ActorScore;
  aWho?: string;
  b?: ActorScore;
  bWho?: string;
  sqsDims: RubricDimension[];
  uesDims: RubricDimension[];
}) {
  const [open, setOpen] = useState(true);
  const dims = [...sqsDims, ...uesDims];
  const cell = (v?: number) =>
    v === undefined ? <span className="text-muted">—</span> : <span className="font-mono">{v}</span>;
  return (
    <PanelSection title="Reference: A / B Result" right={<Badge tone="neutral">QC read-only</Badge>}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-2 text-xs font-medium text-brand hover:underline"
      >
        {open ? "Hide" : "Show"} previous scores
      </button>
      {open && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line bg-page text-left text-subtle">
                <th className="px-3 py-2 font-medium">Dimension</th>
                <th className="px-3 py-2 font-medium">A{aWho ? ` · ${aWho}` : ""}</th>
                {b && <th className="px-3 py-2 font-medium">B{bWho ? ` · ${bWho}` : ""}</th>}
              </tr>
            </thead>
            <tbody>
              {dims.map((d) => (
                <tr key={d.key} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-ink">{d.dimension}</td>
                  <td className="px-3 py-2">{cell(a?.scores?.[d.key])}</td>
                  {b && <td className="px-3 py-2">{cell(b.scores?.[d.key])}</td>}
                </tr>
              ))}
              <tr className="bg-page font-medium">
                <td className="px-3 py-2 text-ink">User Satisfaction</td>
                <td className="px-3 py-2">{cell(a?.userSatisfaction)}</td>
                {b && <td className="px-3 py-2">{cell(b.userSatisfaction)}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </PanelSection>
  );
}

function ActorPanel({
  title,
  badge,
  badgeTone = "brand",
  actor,
  state,
  onPatch,
  readOnly = false,
  sqsDims,
  uesDims,
  activeTab,
  onTab,
  subtype,
  isSOP,
  problemType,
  signalPriority,
}: {
  title: string;
  badge: string;
  badgeTone?: "brand" | "success";
  actor: "bot" | "human";
  state: ActorState;
  onPatch: (patch: Partial<ActorState>) => void;
  readOnly?: boolean;
  sqsDims: RubricDimension[];
  uesDims: RubricDimension[];
  activeTab: "sqs" | "ues";
  onTab: (t: "sqs" | "ues") => void;
  subtype: string;
  isSOP: boolean;
  problemType?: string;
  signalPriority?: string;
}) {
  const gated = state.scores["understanding_accuracy"] === 0;

  const setScore = (key: string, v: number, reason: string) =>
    onPatch({
      scores: { ...state.scores, [key]: v },
      reasons: { ...state.reasons, [key]: reason },
    });
  const setReason = (key: string, v: string) => onPatch({ reasons: { ...state.reasons, [key]: v } });

  const hint = (d: RubricDimension) => {
    if (d.key === "solution_adoption") return `${problemType ?? "Problem"} · ${signalPriority ?? ""} · scored by R1 / R2 / R3 resolution`;
    return d.reasons.length > 0 ? `${d.options.join(" / ")} · pick a standard reason below` : undefined;
  };

  const sqsDone = sqsDims.every((d) => {
    if (d.auto) return true;
    if (gated && (d.key === "execution_correctness" || d.key === "solution_adoption")) return true;
    if (isSOP && (d.key === "execution_correctness" || d.key === "solution_adoption")) return true;
    return state.scores[d.key] !== undefined;
  });
  const uesDone = uesDims.every((d) => state.scores[d.key] !== undefined);

  return (
    <PanelSection title={title} right={<Badge tone={badgeTone}>{badge}</Badge>}>
      <div className="mb-4 border-b border-line">
        <div className="flex items-end gap-8">
          <DimensionTab label="SQS" active={activeTab === "sqs"} completed={sqsDone} onClick={() => onTab("sqs")} />
          <DimensionTab label="UES" active={activeTab === "ues"} completed={uesDone} onClick={() => onTab("ues")} />
        </div>
      </div>

      {activeTab === "sqs" ? (
        <div>
          {gated && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-danger/20 bg-danger-light px-3 py-2 text-xs text-danger">
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
              SQS Gating: Understanding Accuracy = 0 → Execution Correctness &amp; Solution Adoption auto-set to 0 and locked.
            </div>
          )}
          {sqsDims.map((d) => {
            if (d.auto) {
              const resp = d.key === "responsiveness" ? autoResponsiveness(subtype, actor) : { score: 0, detail: "" };
              return (
                <div key={d.key} className="mb-4 rounded-lg border border-line bg-page p-3 opacity-90 last:mb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        {d.dimension}
                        <Badge tone="neutral">Auto · machine</Badge>
                      </p>
                      <p className="text-xs text-subtle">{resp.detail} — annotators skip this dimension</p>
                    </div>
                    <span className="font-mono text-base font-semibold text-ink">{resp.score}</span>
                  </div>
                </div>
              );
            }
            const isEC = d.key === "execution_correctness";
            const isSA = d.key === "solution_adoption";
            if (isSOP && (isEC || isSA)) {
              return (
                <div key={d.key} className="mb-3 rounded-md border border-line bg-page px-3 py-2 text-xs text-subtle">
                  <Info className="mr-1 inline h-3.5 w-3.5" />
                  {d.dimension}: SOP input missing / not ready — full SOP scoring not required in this MVP.
                </div>
              );
            }
            const locked = gated && (isEC || isSA);
            return (
              <ScoreRow
                key={d.key}
                label={d.dimension}
                hint={hint(d)}
                options={d.options}
                value={locked ? 0 : state.scores[d.key] ?? null}
                onChange={(v) => setScore(d.key, v, d.reasons.find((r) => r.score === v)?.text ?? state.reasons[d.key] ?? "")}
                disabled={locked || readOnly}
                reason={state.reasons[d.key] ?? ""}
                onReasonChange={(v) => setReason(d.key, v)}
                reasonOptions={d.reasons}
              />
            );
          })}
        </div>
      ) : (
        <div>
          {uesDims.map((d) => (
            <ScoreRow
              key={d.key}
              label={d.dimension}
              hint={hint(d)}
              options={d.options}
              value={state.scores[d.key] ?? null}
              onChange={(v) => setScore(d.key, v, d.reasons.find((r) => r.score === v)?.text ?? state.reasons[d.key] ?? "")}
              disabled={readOnly}
              reason={state.reasons[d.key] ?? ""}
              onReasonChange={(v) => setReason(d.key, v)}
              reasonOptions={d.reasons}
            />
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function ScorePreview({
  label,
  value,
  pass,
  northStar,
}: {
  label: string;
  value: number | null;
  pass?: boolean;
  northStar?: boolean;
}) {
  return (
    <div className={`flex flex-1 items-center justify-between rounded-lg border px-3 py-2 ${northStar ? "border-brand/40 bg-brand-light" : "border-line bg-page"}`}>
      <span className="text-xs text-subtle">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`font-mono text-base font-semibold ${northStar ? "text-brand" : "text-ink"}`}>
          {value === null ? "—" : value.toFixed(2)}
        </span>
        {!northStar && value !== null && (
          <Badge tone={pass ? "success" : "danger"}>{pass ? "Pass" : "Fail"}</Badge>
        )}
      </span>
    </div>
  );
}

function DimensionTab({
  label,
  active,
  completed,
  onClick,
}: {
  label: string;
  active: boolean;
  completed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-1 pb-3 text-left transition-colors ${
        active ? "border-brand text-ink" : "border-transparent text-subtle hover:text-ink"
      }`}
    >
      <span className="text-[15px] font-semibold">{label}</span>
      <span
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          completed ? "bg-success-light text-success" : "bg-page text-subtle"
        }`}
      >
        {completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
        {completed ? "Done" : "Todo"}
      </span>
    </button>
  );
}
