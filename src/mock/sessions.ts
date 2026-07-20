import type {
  CaseRow,
  CaseType,
  ExpectedResult,
  KnowledgeSource,
  ServiceSubtype,
} from "./types";

// ---- Deterministic pseudo-random generator (seedable so data is stable across reloads) ----
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

const LANGS = ["en", "id", "ar", "zh", "th", "vi", "pt", "es"];
const REGIONS = ["US", "ID", "SA", "SG", "TH", "VN", "BR", "MX", "PH", "GB", "UG"];
const SOURCES: KnowledgeSource[] = ["Skill", "FAQ", "SOP"];

const ANNOTATION_CATEGORY_BY_TYPE: Record<CaseType, string> = {
  1: "Chatbot only",
  2: "Chatbot + Ticketbot",
  3: "Ticketbot only",
  4: "Chatbot → Human IM",
  5: "Ticketbot → Human Ticket",
  6: "Human IM only",
  7: "Human Ticket only",
  8: "Chatbot → Ticketbot → Human",
};

// One of 8 Types -> the expected results it produces (result_type + service
// subtypes + entry mode + which scoring form template). Chatbot/Ticketbot use
// the AI form; Human (IM or Ticket) uses the Human form.
function expectedResultsForType(caseType: CaseType, caseId: string): ExpectedResult[] {
  const mk = (
    n: number,
    resultType: ExpectedResult["resultType"],
    subtypes: ServiceSubtype[],
    entryMode: ExpectedResult["entryMode"],
  ): ExpectedResult => ({
    resultId: `${caseId}-R${n}`,
    resultType,
    serviceSubtypes: subtypes,
    entryMode,
    formTemplate: resultType === "Human" ? "Human" : "AI",
    coveredSourceIds: subtypes.map((s) => `${caseId}-${s}`),
  });
  switch (caseType) {
    case 1:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT")];
    case 2:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT"), mk(2, "Ticketbot", ["TICKETBOT"], "TRANSFERRED")];
    case 3:
      return [mk(1, "Ticketbot", ["TICKETBOT"], "DIRECT")];
    case 4:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT"), mk(2, "Human", ["HUMAN_IM"], "TRANSFERRED")];
    case 5:
      return [mk(1, "Ticketbot", ["TICKETBOT"], "DIRECT"), mk(2, "Human", ["HUMAN_TICKET"], "TRANSFERRED")];
    case 6:
      return [mk(1, "Human", ["HUMAN_IM"], "DIRECT")];
    case 7:
      return [mk(1, "Human", ["HUMAN_TICKET"], "DIRECT")];
    case 8:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT"), mk(2, "Human", ["HUMAN_TICKET"], "TRANSFERRED")];
    default:
      return [mk(1, "Chatbot", ["CHATBOT"], "DIRECT")];
  }
}

interface TaskSeed {
  taskId: string;
  count: number;
  seed: number;
  /** Restrict the Types this task generates (so different sets exercise
   * single-result and multi-result / transfer cases). */
  types: CaseType[];
}

const TASK_SEEDS: TaskSeed[] = [
  { taskId: "TASK-20260623-001", count: 32, seed: 1001, types: [1, 2, 3] },
  { taskId: "TASK-20260623-002", count: 28, seed: 1002, types: [1, 3] },
  { taskId: "TASK-20260623-003", count: 24, seed: 1003, types: [1, 2, 4] },
  { taskId: "TASK-20260623-004", count: 22, seed: 1004, types: [3, 5] },
  { taskId: "TASK-20260623-005", count: 36, seed: 1005, types: [1, 2, 3, 4] },
  { taskId: "TASK-20260623-006", count: 20, seed: 1006, types: [1, 6] },
  { taskId: "TASK-20260623-007", count: 5, seed: 1007, types: [6, 7] },
];

// Blank starting point: cases exist as work items but are all UNASSIGNED and
// UNSCORED. Each case carries its recognized Type + expected results.
function generateTask(t: TaskSeed): CaseRow[] {
  const rng = makeRng(t.seed);
  const rows: CaseRow[] = [];

  for (let i = 0; i < t.count; i++) {
    const idx = i + 1;
    const sessionId = `76${t.seed}${String(idx).padStart(4, "0")}${Math.floor(rng() * 1000)
      .toString()
      .padStart(3, "0")}`;
    const caseType = t.types[Math.floor(rng() * t.types.length)] as CaseType;
    const caseId = `${t.taskId}-C${String(idx).padStart(3, "0")}`;
    const expectedResults = expectedResultsForType(caseType, caseId);
    const transferToHuman = expectedResults.some((r) => r.resultType === "Human" && r.entryMode === "TRANSFERRED");

    rows.push({
      caseId,
      sessionId,
      taskId: t.taskId,
      caseType,
      knowledgeSource: SOURCES[Math.floor(rng() * SOURCES.length)],
      annotationCategory: ANNOTATION_CATEGORY_BY_TYPE[caseType],
      category: `cat-${caseType}`,
      mergeId: `MG-${t.seed}-${idx}`,
      sourceRecordIds: expectedResults.flatMap((r) => r.coveredSourceIds),
      language: LANGS[Math.floor(rng() * LANGS.length)],
      regionCode: REGIONS[Math.floor(rng() * REGIONS.length)],
      transferToHuman,
      expectedResults,
      ruleVersion: 1,
    });
  }
  return rows;
}

export const cases: CaseRow[] = TASK_SEEDS.flatMap(generateTask);

export function getCase(caseId: string): CaseRow | undefined {
  return cases.find((c) => c.caseId === caseId);
}

export function getCaseBySession(sessionId: string): CaseRow | undefined {
  return cases.find((c) => c.sessionId === sessionId);
}

/** Types actually present per task (used by Batch Assign to list Types). */
export const taskTypes: Record<string, CaseType[]> = Object.fromEntries(
  TASK_SEEDS.map((t) => [
    t.taskId,
    Array.from(new Set(cases.filter((c) => c.taskId === t.taskId).map((c) => c.caseType))).sort(
      (a, b) => a - b,
    ),
  ]),
);

export { ANNOTATION_CATEGORY_BY_TYPE };
