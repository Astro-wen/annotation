export interface SummaryMetrics {
  annotatedCases: number;
  totalCases: number;
  sqsAvg: string;
  uesAvg: string;
  sqsPassRate: string;
  qcAccuracy: string;
  uesPassRate: string;
  userSatisfactionAvg: string;
  avgReviewTime: string;
}

export interface CaseSet {
  taskId: string;
  taskName: string;
  sampleName: string;
  source: "Import" | "ByteHi";
  taskType: "Chatbot" | "Ticket";
  totalCases: number;
  annotatedCases: number;
  progress: string;
  sqsAvg: string;
  sqsPassRate: string;
  uesAvg: string;
  userSatisfactionAvg: string;
  qcAccuracy: string;
  ruleVersion: string;
}

export type KnowledgeSource = "Skill" | "FAQ" | "SOP";
export type ServiceSubtype = "Chatbot" | "Ticketbot";

/** One graded actor's result under the new 6+1 model. */
export interface ActorScore {
  /** dimensionKey -> score, drives per-dimension display and is rubric-version aware */
  scores: Record<string, number>;
  /** dimensionKey -> chosen reason text */
  reasons?: Record<string, string>;
  sqsTotal: number;
  sqsPass: boolean;
  uesTotal: number;
  uesPass: boolean;
  /** North Star for this actor = sqsWeight*SQS + uesWeight*UES (0..3) */
  userSatisfaction: number;
}

export interface SessionRow {
  sessionId: string;
  taskId: string;
  language: string;
  regionCode: string;
  serviceSubtype: ServiceSubtype;
  knowledgeSource: KnowledgeSource;
  problemType?: string;
  signalPriority?: string;
  qaOwner?: string;
  annotator?: string;

  /** Bot result (primary) */
  bot?: ActorScore;
  /** Human result (only when hasHumanTransfer) */
  human?: ActorScore;

  /** rubric version this row was graded under */
  ruleVersion?: number;

  sopStatus?: string;
  status: string;
  latestActivityLog?: string;
  hasHumanTransfer?: boolean;
}

export interface ConversationMessage {
  id: number;
  role: "User" | "Assistant" | "System";
  type: "manual_input" | "llm_gen" | "evidence";
  text: string;
  matchedFaq?: string;
}

export type ReviewState =
  | "A Annotation"
  | "Ready for C Sampling"
  | "In C QC"
  | "Final Result Ready";

export type ReviewRole = "A" | "B" | "C";

export interface ReviewAnnotationResult {
  ruleVersion: number;
  bot: ActorScore;
  human?: ActorScore;
  /** Problem Type (R1 / R2 / R3) identified by the annotator during annotation. */
  problemType?: string;
}

export interface ReviewFlow {
  sessionId: string;
  annotationMode: "Single Annotation" | "Back-to-Back";
  currentState: ReviewState;
  aAssignee?: string;
  bAssignee?: string;
  aAnnotator?: string;
  bAnnotator?: string;
  cReviewer?: string;
  backToBackEnabled?: boolean;
  /** Second-round (B) review style. "blind" = independent double-blind (default);
   * "open" = B sees A's result and adjusts directly (标检模式 明检). */
  bMode?: "blind" | "open";
  aResult?: ReviewAnnotationResult;
  bResult?: ReviewAnnotationResult;
  cResult?: ReviewAnnotationResult;
  aResultStatus?: string;
  bResultStatus?: string;
  cResultStatus?: string;
  /** Double-blind reconciliation status when A/B disagree:
   * "Pending" = waiting for QA to reconcile; "Reconciled" = resolved & pooled.
   * Undefined = no reconciliation needed (agreed, or not back-to-back). */
  reconcileStatus?: "Pending" | "Reconciled";
  /** Who reconciled the A/B diff (audit trail). */
  reconciledBy?: string;
  sampledForQC?: boolean;
  sampleBatchLabel?: string;
  finalResultStatus?: string;
  /** dimension keys that C changed relative to the prior A/B result (audit trail) */
  overwrittenDims?: string[];
}

/** A frozen scoring snapshot attached to an activity log version entry. */
export interface ScoreSnapshot {
  ruleVersion: number;
  bot: ActorScore;
  human?: ActorScore;
}

export interface ActivityEntry {
  sessionId: string;
  at: string;
  operator: string;
  action: string;
  /** version number shown as V1 / V2 ... for scoring submissions */
  version?: number;
  detail?: string;
  /** immutable scoring result at this version; clicking the version shows it */
  snapshot?: ScoreSnapshot;
}
