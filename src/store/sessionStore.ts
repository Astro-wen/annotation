import { create } from "zustand";
import type {
  ActivityEntry,
  CaseRow,
  CaseType,
  ProblemType,
  ResultScore,
  ResultType,
  ReviewRole,
} from "@/mock/types";
import { cases as defaultCases } from "@/mock/sessions";
import { samePerson } from "@/lib/access";
import { isAdmin } from "@/lib/currentUser";

const STORAGE_KEY = "bytehi-cycle-state-v11";

// ---- Flow (per-Case runtime state) -----------------------------------------

/** One submitted round for one Case: all its expected results scored. */
export interface RoundResult {
  /** resultId -> score bundle */
  results: Record<string, ResultScore>;
  ruleVersion: number;
  /** actual person who submitted this round */
  by: string;
  at: string;
}

/** Case-level flow status (PRD 口径). */
export type CaseFlowStatus =
  | "Diff" // 待拉齐（Diff）
  | "Waiting for QC"
  | "QC Completed";

/** Slot task status. */
export type SlotStatus = "Unassigned" | "Assigned" | "Submitted (No QC)";

export interface CaseFlow {
  caseId: string;
  taskId: string;
  mode: "Normal" | "Back-to-Back";
  // slots
  aAssignee?: string;
  bAssignee?: string;
  cReviewer?: string;
  aResult?: RoundResult;
  bResult?: RoundResult;
  cResult?: RoundResult;
  /** first-ever A / B submission (never overwritten; for individual accuracy) */
  aFirstResult?: RoundResult;
  bFirstResult?: RoundResult;
  /** frozen at reconcile / A submit (Normal); the QC baseline */
  finalizedBaseline?: RoundResult;
  /** baseline frozen at sampling time (QC compares against this) */
  sampledBaseline?: RoundResult;
  /** current-effective result (C submission, or admin override) */
  currentResult?: RoundResult;
  reconcileStatus?: "Pending" | "Reconciled";
  reconciledBy?: string;
  sampledForQC?: boolean;
  qcCompleted?: boolean;
  /** where the current-effective result comes from */
  finalSource?: "baseline" | "qc" | "admin";
  baselineFinalizedBy?: string;
  qcReviewer?: string;
}

interface PersistShape {
  cases: CaseRow[];
  flows: CaseFlow[];
  logs: ActivityEntry[];
  imported: boolean;
  importSource: string | null;
}

function now(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function loadInitial(): PersistShape {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed && Array.isArray(parsed.cases) && parsed.cases.length > 0) {
        return {
          cases: parsed.cases,
          flows: parsed.flows ?? [],
          logs: parsed.logs ?? [],
          imported: parsed.imported ?? false,
          importSource: parsed.importSource ?? "session restore",
        };
      }
    }
  } catch {
    // ignore corrupt storage
  }
  return { cases: clone(defaultCases), flows: [], logs: [], imported: false, importSource: null };
}

// ---- Config types ----------------------------------------------------------

export interface QaAllocation {
  name: string;
  quantity: number;
}
export interface QaPair {
  aName: string;
  bName: string;
  quantity: number;
}
export interface DistributeConfig {
  mode: "Normal" | "Back-to-Back";
  /** selected Types to restrict this round; empty = All */
  types: CaseType[];
  /** Normal only */
  aDistribution?: QaAllocation[];
  /** Back-to-Back only */
  pairDistribution?: QaPair[];
  /** admin may bypass A≠B */
  override?: boolean;
}
export interface SamplingConfig {
  scope: "all_qas" | "by_qa";
  qaEmail?: string;
  method: "percentage" | "absolute";
  value: number;
  cReviewer?: string;
  /** admin may bypass anti-self-review exclusion of C */
  override?: boolean;
}

/** All results for one Case submitted at once. */
export type PerResultScores = Record<string, ResultScore>;

// ---- Derived helpers (exported for pages) ----------------------------------

export function isBackToBack(flow?: CaseFlow): boolean {
  return flow?.mode === "Back-to-Back";
}

/** Case-level flow status, or undefined if still in slot stage. */
export function caseFlowStatus(flow?: CaseFlow): CaseFlowStatus | undefined {
  if (!flow) return undefined;
  if (flow.qcCompleted) return "QC Completed";
  if (flow.sampledForQC) return "Waiting for QC";
  if (flow.reconcileStatus === "Pending") return "Diff";
  return undefined;
}

/** Combined status string for a Case (used by list & filters). */
export function caseStatus(caseRow: CaseRow, flow?: CaseFlow): string {
  if (caseRow.invalid) return "Invalid";
  const cf = caseFlowStatus(flow);
  if (cf === "QC Completed") return "QC Completed";
  if (cf === "Waiting for QC") return "Waiting for QC";
  if (cf === "Diff") return "待拉齐（Diff）";
  // slot stage — reflect A slot
  return slotStatus(flow, "A");
}

export function slotStatus(flow: CaseFlow | undefined, slot: "A" | "B" | "C"): SlotStatus {
  if (!flow) return "Unassigned";
  const assignee = slot === "A" ? flow.aAssignee : slot === "B" ? flow.bAssignee : flow.cReviewer;
  const result = slot === "A" ? flow.aResult : slot === "B" ? flow.bResult : flow.cResult;
  if (!assignee) return "Unassigned";
  if (!result) return "Assigned";
  return "Submitted (No QC)";
}

/** Whether a Case has formed its Finalized Baseline (poolable). */
function hasFinalizedBaseline(flow?: CaseFlow): boolean {
  return !!flow?.finalizedBaseline;
}

// ---- Store ------------------------------------------------------------------

interface SessionStore {
  cases: CaseRow[];
  flows: CaseFlow[];
  logs: ActivityEntry[];
  imported: boolean;
  importSource: string | null;

  loadCases: (rows: CaseRow[], source: string) => void;
  reset: () => void;

  getCase: (caseId: string) => CaseRow | undefined;
  getCaseBySession: (sessionId: string) => CaseRow | undefined;
  getFlow: (caseId: string) => CaseFlow | undefined;
  getLogs: (caseId: string) => ActivityEntry[];

  distributeCases: (taskId: string, config: DistributeConfig, operator: string) => number;
  assignSingleCase: (caseId: string, slot: "A" | "B", qaName: string, operator: string) => void;
  submitAnnotation: (caseId: string, role: ReviewRole, scores: PerResultScores, ruleVersion: number, operator: string) => void;
  reconcileDiff: (caseId: string, agreed: PerResultScores, ruleVersion: number, operator: string) => void;
  startSampling: (taskId: string, config: SamplingConfig, operator: string) => number;
  batchEdit: (caseIds: string[], reasonByDim: Record<string, string>, operator: string) => void;
  markInvalid: (caseId: string, operator: string) => void;
  restoreInvalid: (caseId: string, operator: string) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => {
  const initial = loadInitial();

  const persist = (patch: Partial<PersistShape>) => {
    set((state) => {
      const next = { ...state, ...patch };
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            cases: next.cases,
            flows: next.flows,
            logs: next.logs,
            imported: next.imported,
            importSource: next.importSource,
          } satisfies PersistShape),
        );
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const log = (entry: Omit<ActivityEntry, "at">): ActivityEntry => ({ ...entry, at: now() });

  const nextVersion = (caseId: string): number =>
    get().logs.filter((l) => l.caseId === caseId && l.version !== undefined).length + 1;

  const patchFlow = (caseId: string, patch: Partial<CaseFlow>): CaseFlow[] => {
    const flows = get().flows;
    const exists = flows.some((f) => f.caseId === caseId);
    if (exists) return flows.map((f) => (f.caseId === caseId ? { ...f, ...patch } : f));
    const row = get().getCase(caseId);
    const base: CaseFlow = { caseId, taskId: row?.taskId ?? "", mode: "Normal" };
    return [...flows, { ...base, ...patch }];
  };

  // Per-result diff: which resultIds have any dimension score difference.
  const resultsDiffer = (a: PerResultScores, b: PerResultScores): boolean => {
    const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const id of ids) {
      const sa = a[id]?.scores ?? {};
      const sb = b[id]?.scores ?? {};
      const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
      for (const k of keys) if (sa[k] !== sb[k]) return true;
    }
    return false;
  };

  const mkRound = (scores: PerResultScores, ruleVersion: number, by: string): RoundResult => ({
    results: clone(scores),
    ruleVersion,
    by,
    at: now(),
  });

  return {
    cases: initial.cases,
    flows: initial.flows,
    logs: initial.logs,
    imported: initial.imported,
    importSource: initial.importSource,

    loadCases: (rows, source) =>
      persist({ cases: rows, flows: [], logs: [], imported: true, importSource: source }),

    reset: () => {
      sessionStorage.removeItem(STORAGE_KEY);
      set({ cases: clone(defaultCases), flows: [], logs: [], imported: false, importSource: null });
    },

    getCase: (caseId) => get().cases.find((c) => c.caseId === caseId),
    getCaseBySession: (sessionId) => get().cases.find((c) => c.sessionId === sessionId),
    getFlow: (caseId) => get().flows.find((f) => f.caseId === caseId),
    getLogs: (caseId) => get().logs.filter((l) => l.caseId === caseId),

    distributeCases: (taskId, config, operator) => {
      const admin = isAdmin(operator);
      const backToBack = config.mode === "Back-to-Back";

      // Mode is locked after the first distribution.
      const existing = get().flows.filter((f) => f.taskId === taskId);
      if (existing.length > 0) {
        const lockedMode = existing[0].mode;
        if (lockedMode !== config.mode) {
          throw new Error(`该 task 已锁定「${lockedMode}」模式，不能改用「${config.mode}」。`);
        }
      }

      // Candidate cases: unassigned, non-Invalid, within selected Types.
      const typeSet = new Set(config.types);
      const candidates = get()
        .cases.filter((c) => {
          if (c.taskId !== taskId || c.invalid) return false;
          if (typeSet.size > 0 && !typeSet.has(c.caseType)) return false;
          const f = get().getFlow(c.caseId);
          return !f?.aAssignee; // unassigned A slot
        })
        .slice()
        .sort((a, b) => a.caseId.localeCompare(b.caseId));

      // Build fill order.
      const aByIdx: (string | undefined)[] = [];
      const bByIdx: (string | undefined)[] = [];
      if (backToBack) {
        const pairs = config.pairDistribution ?? [];
        if (!admin && !config.override && pairs.some((p) => samePerson(p.aName, p.bName))) {
          throw new Error("同一行的 A、B 不能是同一个人（防自审）。管理员可 Override。");
        }
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
        (config.aDistribution ?? []).forEach((d) => {
          for (let i = 0; i < d.quantity; i++) aByIdx.push(d.name);
        });
      }

      const total = aByIdx.length;
      if (total === 0) throw new Error("请填写要分配的 QA 与数量。");
      if (total > candidates.length) {
        throw new Error(`本轮最多可分配 ${candidates.length} 条，当前填写了 ${total} 条。`);
      }

      let count = 0;
      let flows = get().flows;
      const assignedLog: { caseId: string; a: string; b?: string }[] = [];
      candidates.forEach((c, idx) => {
        const a = aByIdx[idx];
        if (!a) return;
        const b = backToBack ? bByIdx[idx] : undefined;
        count++;
        assignedLog.push({ caseId: c.caseId, a, b });
        const patch: Partial<CaseFlow> = {
          taskId,
          mode: config.mode,
          aAssignee: a,
          bAssignee: b,
        };
        const exists = flows.some((f) => f.caseId === c.caseId);
        flows = exists
          ? flows.map((f) => (f.caseId === c.caseId ? { ...f, ...patch } : f))
          : [...flows, { caseId: c.caseId, taskId, mode: config.mode, ...patch }];
      });

      const detail = backToBack
        ? `pairs=[${(config.pairDistribution ?? []).map((p) => `${p.aName}+${p.bName}×${p.quantity}`).join(", ")}] · ${count} case(s)`
        : `A=[${(config.aDistribution ?? []).map((d) => `${d.name}×${d.quantity}`).join(", ")}] · ${count} case(s)`;

      persist({
        flows,
        logs: [
          ...get().logs,
          log({ caseId: taskId, operator, action: `Batch Assign (${config.mode})`, detail }),
          ...assignedLog.map((a) =>
            log({
              caseId: a.caseId,
              operator,
              action: a.b ? `Batch Assign A=${a.a}, B=${a.b}` : `Batch Assign A=${a.a}`,
              detail: config.mode,
            }),
          ),
        ],
      });
      return count;
    },

    assignSingleCase: (caseId, slot, qaName, operator) => {
      const flow = get().getFlow(caseId);
      const admin = isAdmin(operator);
      if (slot === "B") {
        if (flow?.mode !== "Back-to-Back") throw new Error("该 case 不是 Back-to-Back，没有 B 可指派。");
        const aPerson = flow.aResult?.by ?? flow.aAssignee;
        if (!admin && samePerson(qaName, aPerson)) throw new Error("B 不能是 A 那个人（防自审）。管理员可 Override。");
        if (flow.sampledForQC && !admin) throw new Error("已进入 QC，标注编辑不能改派。");
      } else {
        const bPerson = flow?.bResult?.by ?? flow?.bAssignee;
        if (flow?.mode === "Back-to-Back" && !admin && samePerson(qaName, bPerson)) {
          throw new Error("A 不能是 B 那个人（防自审）。管理员可 Override。");
        }
        if (flow?.sampledForQC && !admin) throw new Error("已进入 QC，标注编辑不能改派。");
      }
      persist({
        flows: patchFlow(caseId, slot === "A" ? { aAssignee: qaName } : { bAssignee: qaName }),
        logs: [
          ...get().logs,
          log({ caseId, operator, action: `Assign ${slot} to ${qaName}`, detail: `${slot} = ${qaName}` }),
        ],
      });
    },

    submitAnnotation: (caseId, role, scores, ruleVersion, operator) => {
      const flow = get().getFlow(caseId);
      const version = nextVersion(caseId);
      const round = mkRound(scores, ruleVersion, operator);
      const firstResultType = get().getCase(caseId)?.expectedResults[0]?.resultType;

      if (role === "A") {
        const b2b = flow?.mode === "Back-to-Back";
        const patch: Partial<CaseFlow> = { aResult: round };
        if (!flow?.aFirstResult) patch.aFirstResult = round;
        if (b2b) {
          const bDone = !!flow?.bResult;
          if (bDone) {
            const disagree = resultsDiffer(scores, flow!.bResult!.results);
            if (disagree) {
              patch.reconcileStatus = "Pending";
            } else {
              patch.finalizedBaseline = round;
              patch.baselineFinalizedBy = operator;
              patch.reconcileStatus = "Reconciled";
            }
          }
          // else: wait for B
        } else {
          // Normal: A submit finalizes the baseline immediately.
          patch.finalizedBaseline = round;
          patch.baselineFinalizedBy = operator;
        }
        persist({
          flows: patchFlow(caseId, patch),
          logs: [
            ...get().logs,
            log({ caseId, operator, role: "A", action: "Submit A Annotation", version, resultType: firstResultType, snapshot: { ruleVersion, results: clone(scores) } }),
          ],
        });
        return;
      }

      if (role === "B") {
        if (flow?.mode !== "Back-to-Back") throw new Error("该 case 不是 Back-to-Back，不能以 B 身份提交。");
        const patch: Partial<CaseFlow> = { bResult: round };
        if (!flow?.bFirstResult) patch.bFirstResult = round;
        const aDone = !!flow?.aResult;
        if (aDone) {
          const disagree = resultsDiffer(scores, flow!.aResult!.results);
          if (disagree) {
            patch.reconcileStatus = "Pending";
          } else {
            patch.finalizedBaseline = flow!.aResult!;
            patch.baselineFinalizedBy = operator;
            patch.reconcileStatus = "Reconciled";
          }
        }
        persist({
          flows: patchFlow(caseId, patch),
          logs: [
            ...get().logs,
            log({ caseId, operator, role: "B", action: "Submit B Annotation", version, resultType: firstResultType, snapshot: { ruleVersion, results: clone(scores) } }),
          ],
        });
        return;
      }

      // role === "C": C submission becomes the current-effective result.
      persist({
        flows: patchFlow(caseId, {
          cResult: round,
          cReviewer: operator,
          currentResult: round,
          qcCompleted: true,
          finalSource: "qc",
          qcReviewer: operator,
        }),
        logs: [
          ...get().logs,
          log({ caseId, operator, role: "C", action: "C Decision (Final)", version, resultType: firstResultType, snapshot: { ruleVersion, results: clone(scores) } }),
        ],
      });
    },

    reconcileDiff: (caseId, agreed, ruleVersion, operator) => {
      const flow = get().getFlow(caseId);
      if (!flow) throw new Error("找不到该 case 的 flow。");
      if (flow.reconcileStatus !== "Pending") throw new Error("该 case 不处于待拉齐状态。");
      const round = mkRound(agreed, ruleVersion, operator);
      const version = nextVersion(caseId);
      const firstResultType = get().getCase(caseId)?.expectedResults[0]?.resultType;
      persist({
        flows: patchFlow(caseId, {
          finalizedBaseline: round,
          baselineFinalizedBy: operator,
          reconcileStatus: "Reconciled",
          reconciledBy: operator,
        }),
        logs: [
          ...get().logs,
          log({ caseId, operator, action: "Reconcile A/B Diff", version, resultType: firstResultType, detail: `reconciled by ${operator}`, snapshot: { ruleVersion, results: clone(agreed) } }),
        ],
      });
    },

    startSampling: (taskId, config, operator) => {
      const admin = isAdmin(operator);
      // Scope cases (non-Invalid, in this task; by_qa restricts to that person's A/B cases).
      const scopeCases = get().cases.filter((c) => {
        if (c.taskId !== taskId || c.invalid) return false;
        if (config.scope === "by_qa" && config.qaEmail) {
          const f = get().getFlow(c.caseId);
          const aP = f?.aResult?.by ?? f?.aAssignee;
          const bP = f?.bResult?.by ?? f?.bAssignee;
          return samePerson(aP, config.qaEmail) || samePerson(bP, config.qaEmail);
        }
        return true;
      });

      // Precondition: all non-Invalid scope cases must have a Finalized Baseline.
      const allFinalized = scopeCases.every((c) => hasFinalizedBaseline(get().getFlow(c.caseId)));
      if (!allFinalized) throw new Error("所选范围内仍有未定稿（未提交或待拉齐）的 case，无法开始抽样。");

      // Eligible = finalized, not yet sampled, and (for non-admin C) passes anti-self-review.
      const cEmail = config.cReviewer;
      const eligible = scopeCases.filter((c) => {
        const f = get().getFlow(c.caseId);
        if (!hasFinalizedBaseline(f) || f?.sampledForQC) return false;
        if (cEmail && !admin && !config.override) {
          const aP = f?.aResult?.by ?? f?.aAssignee;
          const bP = f?.bResult?.by ?? f?.bAssignee;
          if (samePerson(cEmail, aP) || samePerson(cEmail, bP)) return false;
        }
        return true;
      });

      const effectiveCount = scopeCases.length;
      const alreadySampled = scopeCases.filter((c) => get().getFlow(c.caseId)?.sampledForQC).length;
      let thisTime: number;
      if (config.method === "percentage") {
        const target = config.value <= 0 ? 0 : Math.ceil((effectiveCount * config.value) / 100);
        thisTime = Math.max(0, Math.min(target - alreadySampled, eligible.length));
      } else {
        thisTime = Math.max(0, Math.min(config.value, eligible.length));
      }

      const selected = eligible
        .slice()
        .sort((a, b) => a.caseId.localeCompare(b.caseId))
        .slice(0, thisTime);
      const selectedIds = new Set(selected.map((c) => c.caseId));
      if (selectedIds.size === 0) return 0;

      let flows = get().flows;
      selected.forEach((c) => {
        const f = get().getFlow(c.caseId);
        flows = flows.map((x) =>
          x.caseId === c.caseId
            ? {
                ...x,
                sampledForQC: true,
                cReviewer: config.cReviewer || x.cReviewer,
                sampledBaseline: f?.finalizedBaseline,
                finalSource: "baseline",
              }
            : x,
        );
      });

      persist({
        flows,
        logs: [
          ...get().logs,
          log({
            caseId: taskId,
            operator,
            action: "Start Sampling",
            detail:
              (config.method === "percentage" ? `${config.value}% · +${selectedIds.size}` : `${config.value} · +${selectedIds.size}`) +
              (config.cReviewer ? ` · C: ${config.cReviewer}` : ""),
          }),
          ...selected.map((c) => log({ caseId: c.caseId, operator, action: "Sampled for QC", detail: config.cReviewer ? `C: ${config.cReviewer}` : "" })),
        ],
      });
      return selectedIds.size;
    },

    batchEdit: (caseIds, reasonByDim, operator) => {
      const dims = Object.entries(reasonByDim).filter(([, v]) => v);
      if (dims.length === 0 || caseIds.length === 0) return;
      const idSet = new Set(caseIds);
      const admin = isAdmin(operator);
      const editedIds: string[] = [];
      const flows = get().flows.map((f) => {
        if (!idSet.has(f.caseId)) return f;
        // Editors may only edit cases not yet in Waiting for QC.
        const status = caseFlowStatus(f);
        if (!admin && (status === "Waiting for QC" || status === "QC Completed")) return f;
        const target = f.currentResult ?? f.finalizedBaseline;
        if (!target) return f;
        const results = clone(target.results);
        for (const r of Object.values(results)) {
          r.reasons = r.reasons ?? {};
          for (const [dim, text] of dims) if (r.scores[dim] !== undefined) r.reasons[dim] = text;
        }
        editedIds.push(f.caseId);
        const edited: RoundResult = { ...target, results, by: operator, at: now() };
        return f.currentResult ? { ...f, currentResult: edited } : { ...f, finalizedBaseline: edited };
      });
      if (editedIds.length === 0) return;
      persist({
        flows,
        logs: [
          ...get().logs,
          ...editedIds.map((caseId) => log({ caseId, operator, action: "Batch Edit", detail: dims.map(([d]) => d).join(", ") })),
        ],
      });
    },

    markInvalid: (caseId, operator) => {
      const row = get().getCase(caseId);
      if (!row || row.invalid) return;
      const flow = get().getFlow(caseId);
      persist({
        cases: get().cases.map((c) =>
          c.caseId === caseId ? { ...c, invalid: true, prevStatusBeforeInvalid: caseStatus(c, flow) } : c,
        ),
        logs: [...get().logs, log({ caseId, operator, action: "Mark Invalid" })],
      });
    },

    restoreInvalid: (caseId, operator) => {
      const row = get().getCase(caseId);
      if (!row || !row.invalid) return;
      persist({
        cases: get().cases.map((c) =>
          c.caseId === caseId ? { ...c, invalid: false, prevStatusBeforeInvalid: undefined } : c,
        ),
        logs: [...get().logs, log({ caseId, operator, action: "Restore Invalid" })],
      });
    },
  };
});

// ---- Aggregation selectors (pure, used by Home / TaskDetail) ----------------

export const RESULT_TYPES: ResultType[] = ["Chatbot", "Ticketbot", "Human"];

/** The current-effective result bundle for a case (C > finalized baseline). */
export function effectiveRound(flow?: CaseFlow): RoundResult | undefined {
  return flow?.currentResult ?? flow?.finalizedBaseline;
}

/** Problem type helper for display. */
export type { ProblemType };
