import type { ActorScore, KnowledgeSource, ServiceSubtype, SessionRow } from "@/mock/types";

/** Parse raw CSV text into rows of string cells. Handles quoted fields and escaped quotes. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // ignore, handled by following \n
    } else {
      field += c;
    }
  }
  // flush last field/row if any content
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const num = (v?: string): number | undefined => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const normSubtype = (v?: string): ServiceSubtype => {
  const s = (v ?? "").toLowerCase();
  return s.includes("ticket") ? "Ticketbot" : "Chatbot";
};

const normSource = (v?: string): KnowledgeSource => {
  const s = (v ?? "").toLowerCase();
  if (s.includes("faq")) return "FAQ";
  if (s.includes("sop")) return "SOP";
  return "Skill";
};

const truthy = (v?: string): boolean => {
  const s = (v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
};

/** Map a header label to a canonical key. */
function canonicalKey(header: string): string {
  return header.trim().toLowerCase().replace(/[\s/]+/g, "_");
}

const HEADER_ALIASES: Record<string, string> = {
  session_id: "sessionId",
  sessionid: "sessionId",
  task_id: "taskId",
  taskid: "taskId",
  language: "language",
  lang: "language",
  region: "regionCode",
  region_code: "regionCode",
  service_subtype: "serviceSubtype",
  subtype: "serviceSubtype",
  knowledge_source: "knowledgeSource",
  source: "knowledgeSource",
  problem_type: "problemType",
  signal_priority: "signalPriority",
  qa_owner: "qaOwner",
  annotator: "annotator",
  understanding_accuracy: "understanding_accuracy",
  execution_correctness: "execution_correctness",
  solution_adoption: "solution_adoption",
  responsiveness: "responsiveness",
  service_efficiency: "service_efficiency",
  language_quality: "language_quality",
  service_outcome_expectation: "service_outcome_expectation",
  expectation_achievement: "service_outcome_expectation",
  sop_status: "sopStatus",
  status: "status",
  latest_activity_log: "latestActivityLog",
  has_human_transfer: "hasHumanTransfer",
  bot_to_human: "hasHumanTransfer",
};

export interface ParseResult {
  sessions: SessionRow[];
  errors: string[];
}

/** Parse CSV text into SessionRow[] with validation messages. */
export function parseSessionsCsv(text: string): ParseResult {
  const rows = parseCsvText(text);
  const errors: string[] = [];
  if (rows.length < 2) {
    return { sessions: [], errors: ["CSV is empty or has no data rows."] };
  }

  const headerRow = rows[0];
  const keys = headerRow.map((h) => HEADER_ALIASES[canonicalKey(h)] ?? canonicalKey(h));

  if (!keys.includes("sessionId")) {
    errors.push("Missing required column: session_id.");
  }

  const sessions: SessionRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rec: Record<string, string> = {};
    keys.forEach((k, i) => {
      rec[k] = (cells[i] ?? "").trim();
    });

    if (!rec.sessionId) {
      errors.push(`Row ${r + 1}: skipped (no session_id).`);
      continue;
    }

    // Build a bot ActorScore from any provided dimension columns.
    const dimKeys = [
      "understanding_accuracy",
      "execution_correctness",
      "solution_adoption",
      "responsiveness",
      "service_efficiency",
      "language_quality",
      "service_outcome_expectation",
    ];
    const scores: Record<string, number> = {};
    let hasAnyScore = false;
    for (const k of dimKeys) {
      const v = num(rec[k]);
      if (v !== undefined) {
        scores[k] = v;
        hasAnyScore = true;
      }
    }
    let bot: ActorScore | undefined;
    if (hasAnyScore) {
      const sqsKeys = dimKeys.slice(0, 6);
      const sqsVals = sqsKeys.map((k) => scores[k] ?? 0);
      const sqsTotal = sqsVals.reduce((a, b) => a + b, 0) / sqsKeys.length;
      const uesTotal = scores["service_outcome_expectation"] ?? 0;
      bot = {
        scores,
        sqsTotal,
        sqsPass: sqsTotal >= 2,
        uesTotal,
        uesPass: uesTotal >= 2,
        userSatisfaction: (sqsTotal + uesTotal) / 2,
      };
    }

    sessions.push({
      sessionId: rec.sessionId,
      taskId: rec.taskId || "TASK-IMPORTED",
      language: rec.language || "—",
      regionCode: rec.regionCode || "—",
      serviceSubtype: normSubtype(rec.serviceSubtype),
      knowledgeSource: normSource(rec.knowledgeSource),
      problemType: rec.problemType || undefined,
      signalPriority: rec.signalPriority || undefined,
      qaOwner: rec.qaOwner || undefined,
      annotator: rec.annotator || undefined,
      bot,
      sopStatus: rec.sopStatus || undefined,
      status: rec.status || "Imported",
      latestActivityLog: rec.latestActivityLog || `Imported from CSV at row ${r + 1}`,
      hasHumanTransfer: rec.hasHumanTransfer !== undefined ? truthy(rec.hasHumanTransfer) : undefined,
    });
  }

  if (sessions.length === 0 && errors.length === 0) {
    errors.push("No valid session rows found.");
  }

  return { sessions, errors };
}
