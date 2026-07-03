import { useState } from "react";
import { Download, FileText, FileBarChart } from "lucide-react";
import { Button } from "./ui";
import { downloadCsv } from "@/lib/csv";
import { summary } from "@/mock/summary";
import { useSessionStore } from "@/store/sessionStore";
import { useRubricStore } from "@/store/rubricStore";

export default function DownloadCsvMenu({
  taskId,
  label = "Download CSV",
}: {
  taskId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const sessions = useSessionStore((s) => s.sessions);
  const imported = useSessionStore((s) => s.imported);
  const rubric = useRubricStore((s) => s.rubric);

  const downloadSummary = () => {
    downloadCsv(
      "annotation_summary.csv",
      [
        "Annotated Cases",
        "Total Cases",
        "SQS Avg",
        "UES Avg",
        "User Satisfaction Avg",
        "SQS Pass Rate",
        "QC Accuracy",
        "UES Pass Rate",
      ],
      [
        [
          String(summary.annotatedCases),
          String(summary.totalCases),
          summary.sqsAvg,
          summary.uesAvg,
          summary.userSatisfactionAvg,
          summary.sqsPassRate,
          summary.qcAccuracy,
          summary.uesPassRate,
        ],
      ],
    );
    setOpen(false);
  };

  const downloadData = () => {
    const dims = rubric; // all dimensions (enabled or not) as columns for completeness
    const header = [
      "session_id",
      "language",
      "region",
      "service_subtype",
      "knowledge_source",
      ...dims.map((d) => d.key),
      "sqs_total",
      "sqs_pass",
      "ues_total",
      "ues_pass",
      "user_satisfaction",
      "human_sqs_total",
      "human_ues_total",
      "human_user_satisfaction",
      "status",
    ];
    const rows = sessions
      .filter((s) => imported || !taskId || s.taskId === taskId)
      .map((s) => [
        s.sessionId,
        s.language,
        s.regionCode,
        s.serviceSubtype,
        s.knowledgeSource,
        ...dims.map((d) => (s.bot?.scores?.[d.key] !== undefined ? String(s.bot!.scores[d.key]) : "")),
        s.bot?.sqsTotal?.toFixed(2) ?? "",
        s.bot ? (s.bot.sqsPass ? "Pass" : "No Pass") : "",
        s.bot?.uesTotal?.toFixed(2) ?? "",
        s.bot ? (s.bot.uesPass ? "Pass" : "Fail") : "",
        s.bot?.userSatisfaction?.toFixed(2) ?? "",
        s.human?.sqsTotal?.toFixed(2) ?? "",
        s.human?.uesTotal?.toFixed(2) ?? "",
        s.human?.userSatisfaction?.toFixed(2) ?? "",
        s.status,
      ]);
    downloadCsv("annotation_data.csv", header, rows);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button icon={Download} onClick={() => setOpen((o) => !o)}>
        {label}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-line bg-white p-1 shadow-lg">
            <button
              onClick={downloadSummary}
              className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-50"
            >
              <FileBarChart className="mt-0.5 h-4 w-4 text-brand" />
              <span>
                <span className="block text-sm font-medium">annotation_summary.csv</span>
                <span className="block text-xs text-subtle">
                  Aggregate metrics: SQS / UES Avg, User Satisfaction, Pass Rate, QC Accuracy
                </span>
              </span>
            </button>
            <button
              onClick={downloadData}
              className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left hover:bg-gray-50"
            >
              <FileText className="mt-0.5 h-4 w-4 text-brand" />
              <span>
                <span className="block text-sm font-medium">annotation_data.csv</span>
                <span className="block text-xs text-subtle">
                  Row-level: one session per row with SQS / UES / User Satisfaction result
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
