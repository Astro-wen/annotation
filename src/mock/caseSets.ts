import type { CaseSet } from "./types";
import { sessions } from "./sessions";

// Static descriptive metadata per task. Blank starting point: all sessions are
// unassigned/unscored, so averages show "—", annotated = 0, QC accuracy = 0.
interface CaseSetMeta {
  taskId: string;
  taskName: string;
  sampleName: string;
  source: "Import" | "ByteHi";
  taskType: "Chatbot" | "Ticket";
  ruleVersion: string;
}

const META: CaseSetMeta[] = [
  {
    taskId: "TASK-20260623-001",
    taskName: "New Framework Optimization 0610-0614",
    sampleName: "Sample A",
    source: "Import",
    taskType: "Chatbot",
    ruleVersion: "v2026.06.23",
  },
  {
    taskId: "TASK-20260623-002",
    taskName: "FAQ Quality Regression Check",
    sampleName: "Sample B",
    source: "ByteHi",
    taskType: "Chatbot",
    ruleVersion: "v2026.06.23",
  },
  {
    taskId: "TASK-20260623-003",
    taskName: "Skill Routing Audit",
    sampleName: "Sample C",
    source: "Import",
    taskType: "Ticket",
    ruleVersion: "v2026.06.23",
  },
  {
    taskId: "TASK-20260623-004",
    taskName: "Ticket Escalation Spot Check",
    sampleName: "Sample D",
    source: "Import",
    taskType: "Ticket",
    ruleVersion: "v2026.06.23",
  },
  {
    taskId: "TASK-20260623-005",
    taskName: "Chatbot DSAT Case Review-1",
    sampleName: "Sample E",
    source: "ByteHi",
    taskType: "Chatbot",
    ruleVersion: "v2026.06.23",
  },
  {
    taskId: "TASK-20260623-006",
    taskName: "Joyce Test Run",
    sampleName: "Sample F",
    source: "Import",
    taskType: "Chatbot",
    ruleVersion: "v2026.06.23",
  },
  {
    taskId: "TASK-20260623-007",
    taskName: "All Human-Transfer Set",
    sampleName: "Sample G",
    source: "Import",
    taskType: "Ticket",
    ruleVersion: "v2026.06.23",
  },
];

export const caseSets: CaseSet[] = META.map((m) => {
  const total = sessions.filter((s) => s.taskId === m.taskId).length;

  return {
    taskId: m.taskId,
    taskName: m.taskName,
    sampleName: m.sampleName,
    source: m.source,
    taskType: m.taskType,
    totalCases: total,
    annotatedCases: 0,
    progress: "0.0%",
    sqsAvg: "—",
    sqsPassRate: "—",
    uesAvg: "—",
    userSatisfactionAvg: "—",
    qcAccuracy: "0.0%",
    ruleVersion: m.ruleVersion,
  };
});
