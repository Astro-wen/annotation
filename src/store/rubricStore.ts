import { create } from "zustand";
import {
  defaultRubric,
  defaultWeights,
  defaultSkipReasons,
  type RubricDimension,
  type ReasonOption,
} from "@/mock/settings";

const STORAGE_KEY = "bytehi-rubric-state-v6";

export interface RubricWeights {
  sqsWeight: number;
  uefWeight: number;
}

export interface RubricVersionSnapshot {
  version: number;
  at: string;
  operator: string;
  note: string;
  rubric: RubricDimension[];
  weights: RubricWeights;
  skipReasons: string[];
}

interface PersistShape {
  rubric: RubricDimension[];
  weights: RubricWeights;
  skipReasons: string[];
  version: number;
  history: RubricVersionSnapshot[];
}

function now(): string {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function loadInitial(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed && Array.isArray(parsed.rubric) && parsed.rubric.length > 0) {
        return { ...parsed, skipReasons: parsed.skipReasons ?? clone(defaultSkipReasons) };
      }
    }
  } catch {
    // ignore corrupt storage
  }
  const rubric = clone(defaultRubric);
  const weights = { ...defaultWeights };
  const skipReasons = clone(defaultSkipReasons);
  return {
    rubric,
    weights,
    skipReasons,
    version: 1,
    history: [
      {
        version: 1,
        at: now(),
        operator: "editor.aaron@bytedance.com",
        note: "Initial standard rubric (6-dim SQS 65% + UEF 35%, dimension-level Skip)",
        rubric: clone(rubric),
        weights: { ...weights },
        skipReasons: clone(skipReasons),
      },
    ],
  };
}

export interface NewDimensionInput {
  dimension: string;
  group: "SQS" | "UEF";
  options: number[];
  reasons: ReasonOption[];
}

interface RubricStore extends PersistShape {
  /** dimensions currently enabled (drives Annotation for the latest version) */
  activeRubric: () => RubricDimension[];
  /**
   * Enabled dimensions for a specific config version. A case set that was
   * imported under version N keeps showing version N's dimensions even after
   * a newer rubric is published (rule isolation per PRD).
   */
  activeRubricForVersion: (version: number) => RubricDimension[];
  /** Configured Skip Reasons for a given config version. */
  skipReasonsForVersion: (version: number) => string[];
  reasonFor: (dimensionKey: string, score: number) => string | undefined;

  /** Commit a full edit set atomically, bumping the version and snapshotting. */
  applyEdits: (
    next: { rubric: RubricDimension[]; weights: RubricWeights; skipReasons: string[] },
    operator: string,
    note: string,
  ) => void;
  addDimension: (input: NewDimensionInput, operator: string) => void;
  resetToDefault: (operator: string) => void;
}

export const useRubricStore = create<RubricStore>((set, get) => {
  const initial = loadInitial();

  const persist = (patch: Partial<PersistShape>) => {
    set((state) => {
      const next = { ...state, ...patch };
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            rubric: next.rubric,
            weights: next.weights,
            skipReasons: next.skipReasons,
            version: next.version,
            history: next.history,
          } satisfies PersistShape),
        );
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const bump = (
    rubric: RubricDimension[],
    weights: RubricWeights,
    skipReasons: string[],
    operator: string,
    note: string,
  ) => {
    const version = get().version + 1;
    const snapshot: RubricVersionSnapshot = {
      version,
      at: now(),
      operator,
      note,
      rubric: clone(rubric),
      weights: { ...weights },
      skipReasons: clone(skipReasons),
    };
    persist({
      rubric,
      weights,
      skipReasons,
      version,
      history: [...get().history, snapshot],
    });
  };

  return {
    ...initial,

    activeRubric: () => get().rubric.filter((d) => d.enabled),

    activeRubricForVersion: (version) => {
      const snap = get().history.find((h) => h.version === version);
      const rubric = snap ? snap.rubric : get().rubric;
      return rubric.filter((d) => d.enabled);
    },

    skipReasonsForVersion: (version) => {
      const snap = get().history.find((h) => h.version === version);
      return snap ? snap.skipReasons : get().skipReasons;
    },

    reasonFor: (dimensionKey, score) => {
      const d = get().rubric.find((x) => x.key === dimensionKey);
      return d?.reasons.find((r) => r.score === score)?.text;
    },

    applyEdits: (next, operator, note) => {
      bump(clone(next.rubric), { ...next.weights }, clone(next.skipReasons), operator, note);
    },

    addDimension: (input, operator) => {
      const key = `${input.dimension.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${Date.now().toString(36)}`;
      const dim: RubricDimension = {
        key,
        dimension: input.dimension,
        group: input.group,
        options: input.options,
        reasons: input.reasons,
        enabled: true,
        builtin: false,
      };
      bump([...get().rubric, dim], { ...get().weights }, clone(get().skipReasons), operator, `Added dimension "${input.dimension}"`);
    },

    resetToDefault: (operator) => {
      bump(clone(defaultRubric), { ...defaultWeights }, clone(defaultSkipReasons), operator, "Reset rubric to default standard");
    },
  };
});
