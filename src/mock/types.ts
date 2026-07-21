// ByteHi Manual Annotation Tool — New Rule data model (Phase 1, PRD-aligned).
//
// Scoring model:
//   SQS = Service Quality Score = average of 6 SQS dimensions.
//   UEF = User Expectation Fulfillment = 1 independent user-view dimension.
//   UXS = User Experience Score (North Star) = SQS * 0.65 + UEF * 0.35.
//
// Result model:
//   A Case is recognized into one of 8 Types on import, which produces
//   `expectedResults`. Each result is one of three result types
//   (Chatbot / Ticketbot / Human). The UI only uses two form templates:
//   AI form (Chatbot + Ticketbot) and Human form (Human).

export type ResultType = "Chatbot" | "Ticketbot" | "Human";

/**
 * Result group for aggregation / display (PRD: 四组结果, Human IM 与 Human Ticket
 * 不合并). Derived from resultType + service subtype.
 */
export type ResultGroup = "Chatbot" | "Ticketbot" | "Human IM" | "Human Ticket";

export const RESULT_GROUPS: ResultGroup[] = ["Chatbot", "Ticketbot", "Human IM", "Human Ticket"];

export type ServiceSubtype =
  | "CHATBOT"
  | "TICKETBOT"
  | "HUMAN_IM"
  | "HUMAN_TICKET";

export type EntryMode = "DIRECT" | "TRANSFERRED";

export type KnowledgeSource = "Skill" | "FAQ" | "SOP";

/** Problem type identified by the annotator for Solution Adoption (R1/R2/R3). */
export type ProblemType = "R1" | "R2" | "R3";

/** Scoring form template. Chatbot/Ticketbot use "AI"; Human uses "Human". */
export type FormTemplate = "AI" | "Human";

export type CaseType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Computed score bundle for one result (one score card). */
export interface ResultScore {
  /** dimensionKey -> numeric score; rubric-version aware. Skipped dims are absent here. */
  scores: Record<string, number>;
  /** dimensionKey -> chosen reason text (for numeric scores) */
  reasons?: Record<string, string>;
  /** dimensionKey -> Skip Reason. A dim listed here is Skipped (no numeric score). */
  skips?: Record<string, string>;
  /** annotator-identified problem type for Solution Adoption */
  problemType?: ProblemType;
  /** average of the numeric SQS dimensions (skipped dims excluded) */
  sqsAvg: number;
  /** the UEF dimension value (0 when Skipped) */
  uefTotal: number;
  /** North Star = sqsAvg*0.65 + uefTotal*0.35 (normalized by weights) */
  uxs: number;
}

/** One expected scoring result within a Case (Chatbot / Ticketbot / Human). */
export interface ExpectedResult {
  resultId: string;
  resultType: ResultType;
  serviceSubtypes: ServiceSubtype[];
  entryMode: EntryMode;
  formTemplate: FormTemplate;
  /** source record ids this result is scored against */
  coveredSourceIds: string[];
}

/**
 * Map an expected result to its result group (four groups; Human IM and Human
 * Ticket are kept separate per PRD). Chatbot/Ticketbot come from resultType;
 * a Human result is split by its service subtype.
 */
export function resultGroupOf(er: ExpectedResult): ResultGroup {
  if (er.resultType === "Chatbot") return "Chatbot";
  if (er.resultType === "Ticketbot") return "Ticketbot";
  return er.serviceSubtypes.includes("HUMAN_TICKET") ? "Human Ticket" : "Human IM";
}

/** One Case row (replaces the old SessionRow). A Case may carry 1–2 results. */
export interface CaseRow {
  caseId: string;
  sessionId: string;
  taskId: string;
  caseType: CaseType;
  knowledgeSource: KnowledgeSource;
  /** import fields used for Type recognition */
  annotationCategory: string;
  category: string;
  mergeId: string;
  sourceRecordIds: string[];
  language: string;
  regionCode: string;
  /** system-recognized, read-only */
  transferToHuman: boolean;
  expectedResults: ExpectedResult[];
  /** rubric version this case set was imported under */
  ruleVersion: number;
  invalid?: boolean;
  /** case-level flow status snapshot before it was marked invalid */
  prevStatusBeforeInvalid?: string;
}

export interface CaseSet {
  taskId: string;
  taskName: string;
  sampleName: string;
  source: "Import" | "ByteHi";
  /** locked at first Batch Assign; undefined = 未分配 */
  taskMode?: "Normal" | "Back-to-Back";
  /** config version label this case set was imported under (e.g. "v1") */
  ruleVersion: string;
}

export interface ConversationMessage {
  id: number;
  role: "User" | "Assistant" | "System";
  type: "manual_input" | "llm_gen" | "evidence";
  /** already PII-masked text (placeholders like [EMAIL]) */
  text: string;
  matchedFaq?: string;
  /** true when the text contains masked PII placeholders */
  masked?: boolean;
}

export type ReviewRole = "A" | "B" | "C";

/** A submitted annotation result for one Case (all its expected results). */
export interface AnnotationResult {
  ruleVersion: number;
  /** resultId -> score bundle */
  results: Record<string, ResultScore>;
}

/** Immutable scoring snapshot attached to an activity log version entry. */
export interface ScoreSnapshot {
  ruleVersion: number;
  results: Record<string, ResultScore>;
}

export interface ActivityEntry {
  caseId: string;
  at: string;
  /** who executed the operation (may differ from the actual annotator) */
  operator: string;
  role?: ReviewRole;
  action: string;
  /** result_type tag for scoring/reconcile/QC/result-change records */
  resultType?: ResultType;
  /** version number shown as V1 / V2 ... for scoring submissions */
  version?: number;
  detail?: string;
  snapshot?: ScoreSnapshot;
}
