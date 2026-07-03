import type { KnowledgeSource, ServiceSubtype, SessionRow } from "./types";

// ---- Deterministic pseudo-random generator (seedable so data is stable across reloads) ----
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  };
}

const LANGS = ["en", "id", "ar", "zh", "th", "vi", "pt", "es"];
const REGIONS = ["US", "ID", "SA", "SG", "TH", "VN", "BR", "MX", "PH", "GB", "UG"];
const SUBTYPES: ServiceSubtype[] = ["Chatbot", "Ticketbot"];
const SOURCES: KnowledgeSource[] = ["Skill", "FAQ", "SOP"];
const PROBLEMS = ["R1 Information", "R2 Personalized Info", "R3 Operation"];
const PRIORITIES = ["P0 Objective System Signal", "P1 Content Evaluation"];

interface TaskSeed {
  taskId: string;
  count: number;
  seed: number;
  /** When true, every case in this task is a "transferred to human" case. */
  allHuman?: boolean;
}

const TASK_SEEDS: TaskSeed[] = [
  { taskId: "TASK-20260623-001", count: 32, seed: 1001 },
  { taskId: "TASK-20260623-002", count: 28, seed: 1002 },
  { taskId: "TASK-20260623-003", count: 24, seed: 1003 },
  { taskId: "TASK-20260623-004", count: 22, seed: 1004 },
  { taskId: "TASK-20260623-005", count: 36, seed: 1005 },
  { taskId: "TASK-20260623-006", count: 20, seed: 1006 },
  // A dedicated set where all 5 cases are transferred to a human agent.
  { taskId: "TASK-20260623-007", count: 5, seed: 1007, allHuman: true },
];

// Blank starting point: sessions exist as work items but are all UNASSIGNED and
// UNSCORED — no bot/human result, no qaOwner/annotator, no activity log.
function generateTask(t: TaskSeed): SessionRow[] {
  const rng = makeRng(t.seed);
  const rows: SessionRow[] = [];

  for (let i = 0; i < t.count; i++) {
    const idx = i + 1;
    const sessionId = `76${t.seed}${String(idx).padStart(4, "0")}${Math.floor(rng() * 1000)
      .toString()
      .padStart(3, "0")}`;

    rows.push({
      sessionId,
      taskId: t.taskId,
      language: LANGS[Math.floor(rng() * LANGS.length)],
      regionCode: REGIONS[Math.floor(rng() * REGIONS.length)],
      serviceSubtype: SUBTYPES[Math.floor(rng() * SUBTYPES.length)],
      knowledgeSource: SOURCES[Math.floor(rng() * SOURCES.length)],
      problemType: PROBLEMS[Math.floor(rng() * PROBLEMS.length)],
      signalPriority: PRIORITIES[Math.floor(rng() * PRIORITIES.length)],
      // unassigned + unscored
      qaOwner: undefined,
      annotator: undefined,
      bot: undefined,
      human: undefined,
      ruleVersion: 1,
      status: "Unassigned",
      latestActivityLog: undefined,
      hasHumanTransfer: t.allHuman ?? false,
    });
  }
  return rows;
}

export const sessions: SessionRow[] = TASK_SEEDS.flatMap(generateTask);

export function getSession(sessionId: string): SessionRow | undefined {
  return sessions.find((s) => s.sessionId === sessionId);
}

/** Session counts per task (used to keep case-set totals in sync with generated data). */
export const sessionCountByTask: Record<string, number> = Object.fromEntries(
  TASK_SEEDS.map((t) => [t.taskId, t.count]),
);
