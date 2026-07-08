import { create } from "zustand";
import {
  defaultRubric,
  defaultWeights,
  type RubricDimension,
  type ReasonOption,
} from "@/mock/settings";

const STORAGE_KEY = "bytehi-rubric-state-v3";

export interface RubricWeights {
  sqsWeight: number;
  uesWeight: number;
}

export interface RubricVersionSnapshot {
  version: number;
  at: string;
  operator: string;
  note: string;
  rubric: RubricDimension[];
  weights: RubricWeights;
}

interface PersistShape {
  rubric: RubricDimension[];
  weights: RubricWeights;
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
        return parsed;
      }
    }
  } catch {
    // ignore corrupt storage
  }
  const rubric = clone(defaultRubric);
  const weights = { ...defaultWeights };
  return {
    rubric,
    weights,
    version: 1,
    history: [
      {
        version: 1,
        at: now(),
        operator: "admin@bytedance.com",
        note: "Initial standard rubric (6-dim SQS + 1-dim UES)",
        rubric: clone(rubric),
        weights: { ...weights },
      },
    ],
  };
}

export interface NewDimensionInput {
  dimension: string;
  group: "SQS" | "UES";
  options: number[];
  reasons: ReasonOption[];
}

interface RubricStore extends PersistShape {
  /** dimensions currently enabled (drives Annotation) */
  activeRubric: () => RubricDimension[];
  reasonFor: (dimensionKey: string, score: number) => string | undefined;

  /** Commit a full edit set atomically, bumping the version and snapshotting. */
  applyEdits: (
    next: { rubric: RubricDimension[]; weights: RubricWeights },
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
        const shape: PersistShape = {
          rubric: next.rubric,
          weights: next.weights,
          version: next.version,
          history: next.history,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
      } catch {
        // ignore quota errors
      }
      return next;
    });
  };

  const bump = (
    rubric: RubricDimension[],
    weights: RubricWeights,
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
    };
    persist({
      rubric,
      weights,
      version,
      history: [...get().history, snapshot],
    });
  };

  return {
    ...initial,

    activeRubric: () => get().rubric.filter((d) => d.enabled),

    reasonFor: (dimensionKey, score) => {
      const d = get().rubric.find((x) => x.key === dimensionKey);
      return d?.reasons.find((r) => r.score === score)?.text;
    },

    applyEdits: (next, operator, note) => {
      bump(clone(next.rubric), { ...next.weights }, operator, note);
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
      bump([...get().rubric, dim], { ...get().weights }, operator, `Added dimension "${input.dimension}"`);
    },

    resetToDefault: (operator) => {
      bump(clone(defaultRubric), { ...defaultWeights }, operator, "Reset rubric to default standard");
    },
  };
});
