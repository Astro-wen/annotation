import type {
  CaseRow,
  CaseType,
  ExpectedResult,
  KnowledgeSource,
  ServiceSubtype,
} from "@/mock/types";
import { ANNOTATION_CATEGORY_BY_TYPE } from "@/mock/sessions";

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

const normSource = (v?: string): KnowledgeSource => {
  const s = (v ?? "").toLowerCase();
  if (s.includes("faq")) return "FAQ";
  if (s.includes("sop")) return "SOP";
  return "Skill";
};

const normCaseType = (v?: string): CaseType => {
  const n = Number((v ?? "").trim());
  if (Number.isInteger(n) && n >= 1 && n <= 8) return n as CaseType;
  return 1;
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
  knowledge_source: "knowledgeSource",
  source: "knowledgeSource",
  annotation_category: "annotationCategory",
  category: "category",
  merge_id: "mergeId",
  mergeid: "mergeId",
  source_record_ids: "sourceRecordIds",
  case_type: "caseType",
  casetype: "caseType",
  service_subtypes: "serviceSubtypes",
};

// Type -> expected results, mirroring expectedResultsForType in sessions.ts.
// Chatbot/Ticketbot use the AI form; Human uses the Human form. The first
// result is DIRECT, later results are TRANSFERRED.
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

export interface ParseResult {
  cases: CaseRow[];
  errors: string[];
}

/** Parse CSV text into CaseRow[] with validation messages. */
export function parseCasesCsv(text: string): ParseResult {
  const rows = parseCsvText(text);
  const errors: string[] = [];
  if (rows.length < 2) {
    return { cases: [], errors: ["CSV is empty or has no data rows."] };
  }

  const headerRow = rows[0];
  const keys = headerRow.map((h) => HEADER_ALIASES[canonicalKey(h)] ?? canonicalKey(h));

  if (!keys.includes("sessionId")) {
    errors.push("Missing required column: session_id.");
  }

  const cases: CaseRow[] = [];
  // Dedup key: taskId + caseType + first source record id.
  const seen = new Set<string>();
  const seqByTask: Record<string, number> = {};

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

    const taskId = rec.taskId || "TASK-IMPORTED";
    const caseType = normCaseType(rec.caseType);
    const sourceRecordIds = (rec.sourceRecordIds || "")
      .split(/[|;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const primaryRecordId = sourceRecordIds[0] || rec.sessionId;

    const dedupKey = `${taskId}::${caseType}::${primaryRecordId}`;
    if (seen.has(dedupKey)) {
      errors.push(`Row ${r + 1}: skipped (duplicate case_type + source record ${primaryRecordId}).`);
      continue;
    }
    seen.add(dedupKey);

    const seq = (seqByTask[taskId] = (seqByTask[taskId] ?? 0) + 1);
    const caseId = `${taskId}-C${String(seq).padStart(3, "0")}`;
    const expectedResults = expectedResultsForType(caseType, caseId);
    const transferToHuman = expectedResults.some(
      (r2) => r2.resultType === "Human" && r2.entryMode === "TRANSFERRED",
    );

    cases.push({
      caseId,
      sessionId: rec.sessionId,
      taskId,
      caseType,
      knowledgeSource: normSource(rec.knowledgeSource),
      annotationCategory: rec.annotationCategory || ANNOTATION_CATEGORY_BY_TYPE[caseType],
      category: rec.category || `cat-${caseType}`,
      mergeId: rec.mergeId || `MG-${taskId}-${seq}`,
      sourceRecordIds: sourceRecordIds.length > 0 ? sourceRecordIds : expectedResults.flatMap((e) => e.coveredSourceIds),
      language: rec.language || "—",
      regionCode: rec.regionCode || "—",
      transferToHuman,
      expectedResults,
      ruleVersion: 1,
    });
  }

  if (cases.length === 0 && errors.length === 0) {
    errors.push("No valid case rows found.");
  }

  return { cases, errors };
}
