import type { CaseSet } from "./types";

// Static descriptive metadata per task. Blank starting point: all cases are
// unassigned/unscored, so Home metrics show "—", QC accuracy shows "—".
interface CaseSetMeta {
  taskId: string;
  taskName: string;
  sampleName: string;
  source: "Import" | "ByteHi";
  ruleVersion: string;
}

const META: CaseSetMeta[] = [
  {
    taskId: "TASK-20260623-001",
    taskName: "New Framework Optimization 0610-0614",
    sampleName: "Sample A",
    source: "Import",
    ruleVersion: "v1",
  },
  {
    taskId: "TASK-20260623-002",
    taskName: "FAQ Quality Regression Check",
    sampleName: "Sample B",
    source: "ByteHi",
    ruleVersion: "v1",
  },
  {
    taskId: "TASK-20260623-003",
    taskName: "Skill Routing Audit",
    sampleName: "Sample C",
    source: "Import",
    ruleVersion: "v1",
  },
  {
    taskId: "TASK-20260623-004",
    taskName: "Ticket Escalation Spot Check",
    sampleName: "Sample D",
    source: "Import",
    ruleVersion: "v1",
  },
  {
    taskId: "TASK-20260623-005",
    taskName: "Chatbot DSAT Case Review-1",
    sampleName: "Sample E",
    source: "ByteHi",
    ruleVersion: "v1",
  },
  {
    taskId: "TASK-20260623-006",
    taskName: "Joyce Test Run",
    sampleName: "Sample F",
    source: "Import",
    ruleVersion: "v1",
  },
  {
    taskId: "TASK-20260623-007",
    taskName: "All Human-Transfer Set",
    sampleName: "Sample G",
    source: "Import",
    ruleVersion: "v1",
  },
];

export const caseSets: CaseSet[] = META.map((m) => ({
  taskId: m.taskId,
  taskName: m.taskName,
  sampleName: m.sampleName,
  source: m.source,
  taskMode: undefined,
  ruleVersion: m.ruleVersion,
}));

export function getCaseSet(taskId: string): CaseSet | undefined {
  return caseSets.find((c) => c.taskId === taskId);
}
