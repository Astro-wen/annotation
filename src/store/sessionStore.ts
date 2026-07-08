import { create } from "zustand";
import type {
  ActivityEntry,
  ReviewAnnotationResult,
  ReviewFlow,
  ReviewRole,
  SessionRow,
} from "@/mock/types";
import { sessions as defaultSessions } from "@/mock/sessions";
import { reviewFlows as defaultReviewFlows } from "@/mock/reviewFlow";
import { diffDims } from "@/lib/diff";
import { isPrivileged } from "@/lib/currentUser";

const STORAGE_KEY = "bytehi-cycle-state-v8";

interface PersistShape {
  sessions: SessionRow[];
  reviewFlows: ReviewFlow[];
  logs: ActivityEntry[];
  imported: boolean;
  importSource: string | null;
}

function now(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function loadInitial(): PersistShape {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed && Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        return {
          sessions: parsed.sessions,
          reviewFlows: parsed.reviewFlows ?? defaultReviewFlows,
          logs: parsed.logs ?? [],
          imported: parsed.imported ?? false,
          importSource: parsed.importSource ?? "session restore",
        };
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return {
    sessions: defaultSessions,
    reviewFlows: defaultReviewFlows,
    logs: [],
    imported: false,
    importSource: null,
  };
}

export type AnnotationResult = ReviewAnnotationResult;

export interface QaAllocation {
  name: string;
  quantity: number;
}

/** One back-to-back pairing row: the SAME `quantity` cases go to both A and B. */
export interface QaPair {
  aName: string;
  bName: string;
  quantity: number;
}

export interface AssignConfig {
  aEmail: string;
  bEmail?: string;
  backToBackEnabled: boolean;
  /** Second-round style for B: blind double-blind (default) or open review (明检). */
  bMode?: "blind" | "open";
  aDistribution?: QaAllocation[];
  /** Back-to-back pairings (A | B | quantity per row). */
  pairDistribution?: QaPair[];
}

export interface SamplingConfig {
  scope: "all_qas" | "by_qa";
  qaEmail?: string;
  method: "percentage" | "absolute";
  value: number;
  /** 指派给这批抽中 case 的 C 复核人（管理员 / QA）。 */
  cReviewer?: string;
}

interface SessionStore {
  sessions: SessionRow[];
  reviewFlows: ReviewFlow[];
  logs: ActivityEntry[];
  imported: boolean;
  importSource: string | null;

  loadSessions: (rows: SessionRow[], source: string) => void;
  reset: () => void;
  getSession: (sessionId: string) => SessionRow | undefined;
  getReviewFlow: (sessionId: string) => ReviewFlow | undefined;
  getLogs: (sessionId: string) => ActivityEntry[];

  assignWorkflow: (sessionId: string, config: AssignConfig, operator: string, isReassign: boolean) => void;
  distributeTaskCases: (taskId: string, config: AssignConfig, operator: string) => void;
  assignSingleQa: (sessionId: string, qaName: string, operator: string, slot?: "A" | "B") => void;
  batchEditReasons: (sessionIds: string[], reasonByDim: Record<string, string>, operator: string) => void;
  submitAnnotation: (
    sessionId: string,
    result: AnnotationResult,
    operator: string,
    role?: ReviewRole,
  ) => void;
  /** Resolve an A/B double-blind diff: QA picks the final per-dimension result;
   * it becomes both A and B baseline, and the case enters the QC sampling pool. */
  reconcileDiff: (sessionId: string, result: AnnotationResult, operator: string) => void;
  startSampling: (taskId: string, config: SamplingConfig, operator: string) => number;
}

export const useSessionStore = create<SessionStore>((set, get) => {
  const initial = loadInitial();

  const persist = (patch: Partial<PersistShape>) => {
    set((state) => {
      const next = { ...state, ...patch };
      try {
        const shape: PersistShape = {
          sessions: next.sessions,
          reviewFlows: next.reviewFlows,
          logs: next.logs,
          imported: next.imported,
          importSource: next.importSource,
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const log = (entry: Omit<ActivityEntry, "at">): ActivityEntry => ({ ...entry, at: now() });

  // Normalize an email/name for identity comparison (anti-self-review), so a
  // free-typed value with stray spaces / casing still matches the same person.
  const norm = (v?: string) => (v ?? "").trim().toLowerCase();
  const samePerson = (a?: string, b?: string) => !!a && !!b && norm(a) === norm(b);

  // Treat a case as Back-to-Back if the flag is on OR any B-side trace exists.
  // A case that once had a B reviewer (assignee / annotator / submitted result)
  // must never be judged as "Normal" just because backToBackEnabled got flipped
  // or lost — otherwise A submitting alone would pool it into QC while the B
  // half still lingers (a "half normal, half B2B" dirty state).
  const isBackToBack = (flow: ReviewFlow): boolean =>
    flow.backToBackEnabled === true ||
    !!flow.bAssignee ||
    !!flow.bAnnotator ||
    !!flow.bResultStatus ||
    !!flow.bResult;

  // A case is "complete" (ready to enter the QC sampling pool) when:
  //  - Normal: A submitted.
  //  - Back-to-Back: BOTH A and B submitted (double-blind needs both halves).
  const isComplete = (flow: ReviewFlow): boolean => {
    if (flow.aResultStatus !== "Submitted") return false;
    if (isBackToBack(flow)) return flow.bResultStatus === "Submitted";
    return true;
  };

  const nextVersion = (sessionId: string): number =>
    get().logs.filter((l) => l.sessionId === sessionId && l.version !== undefined).length + 1;

  const patchSession = (sessionId: string, patch: Partial<SessionRow>): SessionRow[] =>
    get().sessions.map((s) => (s.sessionId === sessionId ? { ...s, ...patch } : s));

  const patchFlow = (sessionId: string, patch: Partial<ReviewFlow>): ReviewFlow[] => {
    const flows = get().reviewFlows;
    const exists = flows.some((f) => f.sessionId === sessionId);
    if (exists) {
      return flows.map((f) => (f.sessionId === sessionId ? { ...f, ...patch } : f));
    }
    return [
      ...flows,
      { sessionId, annotationMode: "Single Annotation", currentState: "A Annotation", ...patch },
    ];
  };

  return {
    sessions: initial.sessions,
    reviewFlows: initial.reviewFlows,
    logs: initial.logs,
    imported: initial.imported,
    importSource: initial.importSource,

    loadSessions: (rows, source) =>
      persist({
        sessions: rows,
        reviewFlows: [],
        logs: [],
        imported: true,
        importSource: source,
      }),

    reset: () => {
      sessionStorage.removeItem(STORAGE_KEY);
      set({
        sessions: defaultSessions,
        reviewFlows: defaultReviewFlows,
        logs: [],
        imported: false,
        importSource: null,
      });
    },

    getSession: (sessionId) => get().sessions.find((s) => s.sessionId === sessionId),
    getReviewFlow: (sessionId) => get().reviewFlows.find((f) => f.sessionId === sessionId),
    getLogs: (sessionId) => get().logs.filter((l) => l.sessionId === sessionId),

    assignWorkflow: (sessionId, config, operator, isReassign) => {
      const fmtDist = (dist?: { name: string; quantity: number }[]) =>
        dist && dist.length > 0
          ? dist.map((d) => `${d.name}×${d.quantity}`).join(", ")
          : config.aEmail;
      const detail = config.backToBackEnabled
        ? `A=[${fmtDist(config.aDistribution)}], B=${config.bEmail ?? "—"}, back-to-back=on`
        : `A=[${fmtDist(config.aDistribution)}], back-to-back=off`;
      persist({
        sessions: patchSession(sessionId, {
          annotator: config.aEmail,
          qaOwner: operator,
          status: config.backToBackEnabled ? "A Assigned · Waiting A Annotation" : "A Assigned",
          latestActivityLog: `${operator} ${isReassign ? "reassigned" : "assigned"} workflow ${detail} at ${now()}`,
        }),
        reviewFlows: patchFlow(sessionId, {
          annotationMode: config.backToBackEnabled ? "Back-to-Back" : "Single Annotation",
          currentState: "A Annotation",
          aAssignee: config.aEmail,
          bAssignee: config.backToBackEnabled ? config.bEmail : undefined,
          backToBackEnabled: config.backToBackEnabled,
          aAnnotator: undefined,
          bAnnotator: undefined,
          cReviewer: undefined,
          aResult: undefined,
          bResult: undefined,
          cResult: undefined,
          aResultStatus: undefined,
          bResultStatus: undefined,
          cResultStatus: undefined,
          sampledForQC: false,
          sampleBatchLabel: undefined,
          finalResultStatus: "Not Ready",
        }),
        logs: [
          ...get().logs,
          log({
            sessionId,
            operator,
            action: isReassign ? "Reassign Workflow" : "Assign Workflow",
            detail,
          }),
        ],
      });
    },

    distributeTaskCases: (taskId, config, operator) => {
      // Sequentially deal a task's unassigned cases to the QAs in fill order.
      // Within a round, QA1 takes the first N, QA2 the next M, etc.
      // Back-to-back assigns BOTH an A and a B reviewer to the SAME case, so the
      // A and B rows each independently slice the same set of cases.
      const backToBack = config.backToBackEnabled;

      // A task set is uniformly one mode. Once any case in the task has a flow,
      // new distributions must reuse that mode — mixing normal + back-to-back in
      // the same task is rejected.
      const existingFlows = get().reviewFlows.filter((f) =>
        get().sessions.some((s) => s.sessionId === f.sessionId && s.taskId === taskId),
      );
      if (existingFlows.length > 0) {
        const existingBtb = existingFlows.some((f) => f.backToBackEnabled);
        if (existingBtb !== backToBack) {
          throw new Error(
            `该 task 已按「${existingBtb ? "Back-to-Back" : "Normal"}」模式分配，不能与「${backToBack ? "Back-to-Back" : "Normal"}」混用。请沿用同一模式。`,
          );
        }
      }

      const unassigned = get()
        .sessions.filter((s) => s.taskId === taskId && s.status === "Unassigned")
        .slice()
        .sort((a, b) => a.sessionId.localeCompare(b.sessionId));

      // Build the per-case A/B fill order.
      //  - Normal: aDistribution rows (A only).
      //  - Back-to-back: pairDistribution rows (A | B | quantity) — the SAME
      //    `quantity` cases in each row go to both that row's A and B.
      const aByIdx: (string | undefined)[] = [];
      const bByIdx: (string | undefined)[] = [];
      if (backToBack) {
        const pairs = config.pairDistribution ?? [];
        // A and B on the same pairing must be different people (no self-review).
        if (pairs.some((p) => samePerson(p.aName, p.bName))) {
          throw new Error("同一行的 A、B 不能是同一个人（不能自己评自己）。");
        }
        // Every effective pair (quantity > 0) must name both an A and a B, so we
        // never create a "half" B2B case with an empty B slot.
        if (pairs.some((p) => p.quantity > 0 && (!p.aName?.trim() || !p.bName?.trim()))) {
          throw new Error("Back-to-Back 每一行都必须同时填写 A 和 B。");
        }
        pairs.forEach((p) => {
          for (let i = 0; i < p.quantity; i++) {
            aByIdx.push(p.aName);
            bByIdx.push(p.bName);
          }
        });
      } else {
        const aDist = config.aDistribution ?? [];
        aDist.forEach((d) => {
          for (let i = 0; i < d.quantity; i++) aByIdx.push(d.name);
        });
      }

      const total = aByIdx.length;
      if (total > unassigned.length) {
        throw new Error(
          `分配 ${total} 个超过了可分配的 ${unassigned.length} 个 case`,
        );
      }

      let count = 0;
      // Collect per-case assignment records so each session gets its own log
      // entry (visible in the Detail activity log), not just the task-level one.
      const assignedLog: { sessionId: string; aEmail: string; bEmail?: string }[] = [];

      const sessions = get().sessions.map((s) => {
        if (s.taskId !== taskId || s.status !== "Unassigned") return s;
        const idx = unassigned.findIndex((u) => u.sessionId === s.sessionId);
        const aEmail = aByIdx[idx];
        if (!aEmail) return s; // beyond A allocation -> stays unassigned
        count++;
        const bEmail = backToBack ? bByIdx[idx] : undefined;
        assignedLog.push({ sessionId: s.sessionId, aEmail, bEmail });
        return {
          ...s,
          annotator: aEmail,
          // The assigned QA for this case is the A annotator it was dealt to,
          // not the operator who ran the distribution.
          qaOwner: aEmail,
          status: backToBack ? "A Assigned · Waiting A Annotation" : "A Assigned",
          latestActivityLog: `${operator} distributed to ${aEmail}${
            backToBack && bByIdx[idx] ? ` (B: ${bByIdx[idx]})` : ""
          } at ${now()}`,
        };
      });

      const reviewFlows = (() => {
        let flows = get().reviewFlows;
        unassigned.forEach((u, idx) => {
          const aEmail = aByIdx[idx];
          if (!aEmail) return;
          const bEmail = backToBack ? bByIdx[idx] : undefined;
          const patch: Partial<ReviewFlow> = {
            annotationMode: backToBack ? "Back-to-Back" : "Single Annotation",
            currentState: "A Annotation",
            aAssignee: aEmail,
            bAssignee: bEmail,
            backToBackEnabled: backToBack,
            bMode: backToBack ? config.bMode ?? "blind" : undefined,
            aAnnotator: undefined,
            bAnnotator: undefined,
            cReviewer: undefined,
            aResult: undefined,
            bResult: undefined,
            cResult: undefined,
            aResultStatus: undefined,
            bResultStatus: undefined,
            cResultStatus: undefined,
            sampledForQC: false,
            sampleBatchLabel: undefined,
            finalResultStatus: "Not Ready",
          };
          const exists = flows.some((f) => f.sessionId === u.sessionId);
          flows = exists
            ? flows.map((f) => (f.sessionId === u.sessionId ? { ...f, ...patch } : f))
            : [...flows, { sessionId: u.sessionId, annotationMode: "Single Annotation", currentState: "A Annotation", ...patch }];
        });
        return flows;
      })();

      const detail = backToBack
        ? `pairs=[${(config.pairDistribution ?? [])
            .map((p) => `${p.aName}+${p.bName}×${p.quantity}`)
            .join(", ")}], back-to-back=on · ${count} case(s)`
        : `A=[${(config.aDistribution ?? [])
            .map((d) => `${d.name}×${d.quantity}`)
            .join(", ")}] · ${count} case(s)`;

      // Assignees named on the action label (deduped) so the log reads
      // "Batch Assign to <who>" at a glance.
      const assignees = Array.from(
        new Set(
          assignedLog.flatMap((a) => (a.bEmail ? [a.aEmail, a.bEmail] : [a.aEmail])),
        ),
      );
      const assigneeLabel =
        assignees.length === 0
          ? ""
          : assignees.length <= 2
            ? assignees.join(", ")
            : `${assignees[0]} +${assignees.length - 1}`;

      persist({
        sessions,
        reviewFlows,
        logs: [
          ...get().logs,
          log({
            sessionId: taskId,
            operator,
            action: assigneeLabel ? `Batch Assign to ${assigneeLabel}` : "Batch Assign",
            detail,
          }),
          // One entry per assigned case, so the Detail activity log shows it too.
          ...assignedLog.map((a) =>
            log({
              sessionId: a.sessionId,
              operator,
              action: a.bEmail ? `Batch Assign to ${a.aEmail}, ${a.bEmail}` : `Batch Assign to ${a.aEmail}`,
              detail: a.bEmail
                ? `Assigned A=${a.aEmail}, B=${a.bEmail} (Back-to-Back)`
                : `Assigned A=${a.aEmail}`,
            }),
          ),
        ],
      });
    },

    assignSingleQa: (sessionId, qaName, operator, slot = "A") => {
      const current = get().getSession(sessionId);
      const flow = get().getReviewFlow(sessionId);

      if (slot === "B") {
        // Reassign the B slot only (back-to-back cases). B and A must be
        // different people (no self-review). Only while B hasn't submitted.
        if (!flow?.backToBackEnabled) {
          throw new Error("该 case 不是 Back-to-Back，没有 B 可指派。");
        }
        const aPerson = flow.aAnnotator ?? flow.aAssignee;
        if (samePerson(qaName, aPerson)) {
          throw new Error("B 不能是 A 那个人（不能自己评自己）。");
        }
        if (flow.bResultStatus === "Submitted") {
          throw new Error("B 已提交，不能再重新指派。");
        }
        persist({
          sessions: patchSession(sessionId, {
            latestActivityLog: `${operator} assigned B reviewer ${qaName} at ${now()}`,
          }),
          reviewFlows: patchFlow(sessionId, { bAssignee: qaName }),
          logs: [
            ...get().logs,
            log({ sessionId, operator, action: `Assign B to ${qaName}`, detail: `B = ${qaName}` }),
          ],
        });
        return;
      }

      // Only (re)initialize the A flow while the case is still in the A stage
      // (unassigned or A not yet submitted). Once A has submitted / the case is
      // in QC / finalized, reassigning must NOT reset the flow or overwrite the
      // recorded A annotator — only the QA owner label changes.
      // Anti-self-review: in back-to-back, A can't be the same person as B.
      if (flow?.backToBackEnabled) {
        const bPerson = flow.bAnnotator ?? flow.bAssignee;
        if (samePerson(qaName, bPerson)) {
          throw new Error("A 不能是 B 那个人（不能自己评自己）。");
        }
      }
      const inAStage = !flow || flow.aResultStatus !== "Submitted";
      const isUnassigned = current?.status === "Unassigned" || !current?.status;
      persist({
        sessions: patchSession(sessionId, {
          qaOwner: qaName,
          ...(inAStage && isUnassigned ? { status: "A Assigned", annotator: qaName } : {}),
          latestActivityLog: `${operator} assigned QA owner ${qaName} at ${now()}`,
        }),
        reviewFlows: inAStage
          ? patchFlow(sessionId, {
              annotationMode: flow?.backToBackEnabled ? "Back-to-Back" : "Single Annotation",
              currentState: "A Annotation",
              aAssignee: qaName,
            })
          : get().reviewFlows,
        logs: [
          ...get().logs,
          log({ sessionId, operator, action: `Assign to ${qaName}`, detail: `QA owner = ${qaName}` }),
        ],
      });
    },

    batchEditReasons: (sessionIds, reasonByDim, operator) => {
      const dims = Object.entries(reasonByDim).filter(([, v]) => v);
      if (dims.length === 0 || sessionIds.length === 0) return;
      const idSet = new Set(sessionIds);
      // Cases already finalized by C are immutable — batch edits must skip them.
      const finalizedIds = new Set(
        get()
          .reviewFlows.filter((f) => f.currentState === "Final Result Ready")
          .map((f) => f.sessionId),
      );
      const editedIds: string[] = [];
      const sessions = get().sessions.map((s) => {
        if (!idSet.has(s.sessionId) || !s.bot || finalizedIds.has(s.sessionId)) return s;
        const reasons = { ...(s.bot.reasons ?? {}) };
        for (const [dim, text] of dims) reasons[dim] = text;
        editedIds.push(s.sessionId);
        return {
          ...s,
          bot: { ...s.bot, reasons },
          latestActivityLog: `${operator} batch-edited reasons at ${now()}`,
        };
      });
      if (editedIds.length === 0) return;
      const newLogs = editedIds.map((sessionId) =>
        log({
          sessionId,
          operator,
          action: "Batch Edit Reasons",
          detail: dims.map(([d]) => d).join(", "),
        }),
      );
      persist({ sessions, logs: [...get().logs, ...newLogs] });
    },

    submitAnnotation: (sessionId, result, operator, role = "A") => {
      const currentFlow = get().getReviewFlow(sessionId);
      const sessionPatch: Partial<SessionRow> = {
        latestActivityLog: `${operator} submitted ${role} annotation at ${now()}`,
      };
      let flowPatch: Partial<ReviewFlow> = {};
      let action = `Submit ${role} Annotation`;

      // Bot / Human scores land on the row for A and C submissions.
      const scorePatch: Partial<SessionRow> = {
        bot: result.bot,
        human: result.human,
        ruleVersion: result.ruleVersion,
        annotator: operator,
      };

      if (role === "A") {
        // Open review (明检): B grades on top of A and is authoritative. Once B
        // has submitted, A is locked — letting A re-submit would overwrite the
        // agreed B result and re-introduce a fake A/B diff. Reject it here.
        // 权限账号例外：它有权在 QC 定案后回改前面，所以不受这个明检 A 锁定限制。
        if (
          !isPrivileged(operator) &&
          currentFlow?.bMode === "open" &&
          currentFlow?.bResultStatus === "Submitted"
        ) {
          throw new Error("明检以 B 为准：B 已提交，A 不能再修改。");
        }
        // First-round annotation. Preserve the pre-assigned mode (Back-to-Back
        // stays Back-to-Back) — submitting A must never downgrade a B2B case.
        // A B2B case only becomes "Ready for C Sampling" once B is also in; if B
        // is still pending, A submitting just marks A done and waits for B.
        const b2b = isBackToBack(currentFlow ?? ({} as ReviewFlow));
        const bDone = currentFlow?.bResultStatus === "Submitted";
        Object.assign(sessionPatch, scorePatch, {
          status: "Completed Annotation",
        });
        flowPatch = {
          annotationMode: b2b ? "Back-to-Back" : "Single Annotation",
          currentState: b2b && !bDone ? "A Annotation" : "Ready for C Sampling",
          aAnnotator: operator,
          aResult: result,
          aResultStatus: "Submitted",
          bAnnotator: currentFlow?.bAnnotator,
          bResult: currentFlow?.bResult,
          bResultStatus: currentFlow?.bResultStatus,
          bAssignee: currentFlow?.bAssignee,
          backToBackEnabled: b2b ? true : currentFlow?.backToBackEnabled,
          sampledForQC: currentFlow?.sampledForQC ?? false,
          finalResultStatus: "Not Ready",
        };
      } else if (role === "B") {
        // The B slot only exists on a back-to-back case (assigned up front).
        // Reject role=B on a non-B2B case so it can't silently "turn" a Normal
        // task into B2B (single source of truth: mode is set at assignment).
        if (!currentFlow?.backToBackEnabled) {
          throw new Error("该 case 不是 Back-to-Back，不能以 B 身份提交。");
        }
        // Auto-routing on B submit:
        //  - Open review (明检): B graded on top of A and is authoritative, so
        //    B's result overwrites A too — A/B become one agreed result, no diff.
        //  - Blind & agreed: straight into the QC sampling pool.
        //  - Blind & disagree: mark "Pending" reconcile; QA resolves before pooling.
        const isOpen = currentFlow?.bMode === "open";
        const aBot = currentFlow?.aResult?.bot;
        const disagree = !isOpen && !!aBot && diffDims(aBot, result.bot).size > 0;
        Object.assign(
          sessionPatch,
          // 明检以 B 为准：B 覆写 A 后 B 才是权威结果，主行分数也要跟着更新成 B 的。
          isOpen ? scorePatch : {},
          {
            status: disagree ? "Back-to-Back Diff · Pending Reconcile" : "Back-to-Back Completed",
          },
        );
        flowPatch = {
          annotationMode: "Back-to-Back",
          currentState: "Ready for C Sampling",
          bAnnotator: operator,
          bResult: result,
          bResultStatus: "Submitted",
          // 明检以 B 为准：同时把 A 覆盖成 B 的结果，A/B 统一、不留假 diff。
          ...(isOpen ? { aResult: result } : {}),
          reconcileStatus: disagree ? "Pending" : undefined,
          sampledForQC: currentFlow?.sampledForQC ?? false,
          finalResultStatus: "Not Ready",
        };
      } else {
        // C overwrite: C's result becomes the authoritative final result.
        // Baseline = B when a second reviewer submitted (double-blind), else A.
        const isDouble = currentFlow?.bResultStatus === "Submitted";
        const baseline = (isDouble ? currentFlow?.bResult?.bot : currentFlow?.aResult?.bot) ?? currentFlow?.aResult?.bot;
        const overwrittenDims: string[] = [];
        if (baseline) {
          const keys = new Set([...Object.keys(baseline.scores), ...Object.keys(result.bot.scores)]);
          for (const k of keys) {
            if (baseline.scores[k] !== result.bot.scores[k]) overwrittenDims.push(k);
          }
        }
        action = "C Overwrite (Final)";
        Object.assign(sessionPatch, scorePatch, {
          status: "Final Result Ready",
        });
        flowPatch = {
          currentState: "Final Result Ready",
          cReviewer: operator,
          cResult: result,
          cResultStatus: "Submitted",
          sampledForQC: true,
          finalResultStatus: "Ready",
          overwrittenDims,
        };
      }

      const version = nextVersion(sessionId);

      persist({
        sessions: patchSession(sessionId, sessionPatch),
        reviewFlows: patchFlow(sessionId, flowPatch),
        logs: [
          ...get().logs,
          log({
            sessionId,
            operator,
            action,
            version,
            detail: `${role === "C" ? `C overwrite · ${(flowPatch.overwrittenDims ?? []).length} dim(s) changed · ` : ""}User Satisfaction ${result.bot.userSatisfaction.toFixed(2)} · SQS ${result.bot.sqsTotal.toFixed(2)} (${result.bot.sqsPass ? "Pass" : "Fail"}) · UES ${result.bot.uesTotal.toFixed(2)}`,
            snapshot: {
              ruleVersion: result.ruleVersion,
              bot: result.bot,
              human: result.human,
            },
          }),
        ],
      });
    },

    reconcileDiff: (sessionId, result, operator) => {
      const flow = get().getReviewFlow(sessionId);
      if (!flow) throw new Error("找不到该 case 的 review flow。");
      if (flow.reconcileStatus !== "Pending") {
        throw new Error("该 case 不处于待拉齐状态。");
      }
      // The reconciled result becomes the single agreed baseline: write it into
      // BOTH A and B so downstream QC (which reads A/B as baseline) is consistent,
      // and the A/B expanded rows show the same agreed scores.
      const agreed: ReviewAnnotationResult = {
        ruleVersion: result.ruleVersion,
        bot: result.bot,
        human: result.human,
      };
      const version = nextVersion(sessionId);
      persist({
        sessions: patchSession(sessionId, {
          bot: result.bot,
          human: result.human,
          ruleVersion: result.ruleVersion,
          status: "Back-to-Back Completed",
          latestActivityLog: `${operator} reconciled A/B diff at ${now()}`,
        }),
        reviewFlows: patchFlow(sessionId, {
          aResult: agreed,
          bResult: agreed,
          reconcileStatus: "Reconciled",
          reconciledBy: operator,
          currentState: "Ready for C Sampling",
          finalResultStatus: "Not Ready",
        }),
        logs: [
          ...get().logs,
          log({
            sessionId,
            operator,
            action: `Reconcile A/B to ${operator}`,
            version,
            detail: `Reconciled diff · User Satisfaction ${result.bot.userSatisfaction.toFixed(2)} · SQS ${result.bot.sqsTotal.toFixed(2)} (${result.bot.sqsPass ? "Pass" : "Fail"}) · UES ${result.bot.uesTotal.toFixed(2)}`,
            snapshot: { ruleVersion: result.ruleVersion, bot: result.bot, human: result.human },
          }),
        ],
      });
    },

    startSampling: (taskId, config, operator) => {
      const eligible = get().reviewFlows.filter((flow) => {
        const session = get().sessions.find((s) => s.sessionId === flow.sessionId);
        if (!session || session.taskId !== taskId) return false;
        if (!isComplete(flow) || flow.currentState === "Final Result Ready") return false;
        // A/B diff not yet reconciled → answer isn't finalized → not poolable.
        if (flow.reconcileStatus === "Pending") return false;
        // Exclude cases already sampled in a prior batch so new batches draw
        // from the not-yet-sampled pool.
        if (flow.sampledForQC) return false;
        if (config.scope === "by_qa" && config.qaEmail) {
          // Match if the QA participated as EITHER first (A) or second (B) reviewer.
          const aPerson = flow.aAnnotator ?? flow.aAssignee;
          const bPerson = flow.bAnnotator ?? flow.bAssignee;
          return aPerson === config.qaEmail || bPerson === config.qaEmail;
        }
        return true;
      });
      const targetCount =
        config.method === "percentage"
          ? config.value <= 0
            ? 0
            : Math.max(eligible.length > 0 ? 1 : 0, Math.round((eligible.length * config.value) / 100))
          : Math.min(config.value, eligible.length);
      const selectedIds = new Set(
        eligible
          .slice()
          .sort((a, b) => a.sessionId.localeCompare(b.sessionId))
          .slice(0, targetCount)
          .map((flow) => flow.sessionId),
      );

      persist({
        reviewFlows: get().reviewFlows.map((flow) => {
          const session = get().sessions.find((s) => s.sessionId === flow.sessionId);
          if (!session || session.taskId !== taskId) return flow;
          if (!isComplete(flow) || flow.currentState === "Final Result Ready") return flow;
          // Only promote newly selected cases. Never "unsample" cases that were
          // already sampled in a previous batch — sampling batches are additive.
          if (!selectedIds.has(flow.sessionId)) return flow;
          return {
            ...flow,
            currentState: "In C QC",
            sampledForQC: true,
            // 指派 C 复核人：这批抽中的 case 交给 config.cReviewer 做 QC。
            cReviewer: config.cReviewer || flow.cReviewer,
            sampleBatchLabel:
              config.method === "percentage"
                ? `${config.value}% sample`
                : `${config.value} cases sample`,
            finalResultStatus: "Selected",
          };
        }),
        sessions: get().sessions.map((session) => {
          if (session.taskId !== taskId) return session;
          if (selectedIds.has(session.sessionId)) {
            return {
              ...session,
              status: "Selected for C QC",
              latestActivityLog: `${operator} started sampling at ${now()}`,
            };
          }
          return session;
        }),
        logs: [
          ...get().logs,
          log({
            sessionId: taskId,
            operator,
            action: "Start Sampling",
            detail:
              (config.method === "percentage"
                ? `${config.value}% · selected ${targetCount} cases`
                : `${config.value} cases · selected ${targetCount} cases`) +
              (config.cReviewer ? ` · C: ${config.cReviewer}` : ""),
          }),
        ],
      });
      return targetCount;
    },
  };
});
