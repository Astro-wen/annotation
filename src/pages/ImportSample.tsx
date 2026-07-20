import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, ArrowRight, CheckCircle2, RotateCcw, Download, UploadCloud, Info } from "lucide-react";
import Layout from "@/components/Layout";
import { PageHeader, Button } from "@/components/ui";
import Badge from "@/components/Badge";
import ImportByteHiModal from "@/components/ImportByteHiModal";
import NewAnnotationTaskModal from "@/components/NewAnnotationTaskModal";
import { downloadCsv } from "@/lib/csv";
import { useSessionStore } from "@/store/sessionStore";
import type { ResultType } from "@/mock/types";

const TEMPLATE_HEADERS = [
  "session_id",
  "task_id",
  "language",
  "region",
  "knowledge_source",
  "annotation_category",
  "category",
  "merge_id",
  "source_record_ids",
  "case_type",
  "service_subtypes",
];

const TEMPLATE_SAMPLE = [
  ["7700000000000000001", "TASK-IMPORTED", "en", "US", "Skill", "Chatbot only", "cat-1", "MG-1", "REC-1", "1", "CHATBOT"],
  ["7700000000000000002", "TASK-IMPORTED", "id", "ID", "FAQ", "Chatbot → Human IM", "cat-4", "MG-2", "REC-2", "4", "CHATBOT|HUMAN_IM"],
];

const resultTone = (type: ResultType): "brand" | "warning" | "neutral" =>
  type === "Human" ? "warning" : type === "Ticketbot" ? "neutral" : "brand";

export default function ImportSample() {
  const navigate = useNavigate();
  const [modal, setModal] = useState<"bytehi" | "csv" | null>(null);

  const cases = useSessionStore((s) => s.cases);
  const imported = useSessionStore((s) => s.imported);
  const importSource = useSessionStore((s) => s.importSource);
  const reset = useSessionStore((s) => s.reset);

  const downloadTemplate = () => {
    downloadCsv("import_template.csv", TEMPLATE_HEADERS, TEMPLATE_SAMPLE);
  };

  return (
    <Layout>
      <PageHeader
        title="Import Sample"
        subtitle="Import a sample from ByteHi or upload a CSV — the demo really parses the CSV and drives the whole app"
        actions={
          <Button variant="primary" icon={ArrowRight} onClick={() => navigate("/task/TASK-20260623-001")}>
            Go to Task Detail
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        {/* Active dataset banner */}
        <div className="flex items-center justify-between rounded-lg border border-line bg-page px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            {imported ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="font-medium text-ink">Using imported dataset</span>
                <span className="text-subtle">
                  ({cases.length} cases{importSource ? ` · ${importSource}` : ""})
                </span>
              </>
            ) : (
              <>
                <Database className="h-4 w-4 text-brand" />
                <span className="font-medium text-ink">Using built-in demo data</span>
                <span className="text-subtle">({cases.length} cases)</span>
              </>
            )}
          </span>
          {imported && (
            <button onClick={reset} className="flex items-center gap-1.5 text-xs text-subtle hover:text-ink">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to demo data
            </button>
          )}
        </div>

        {/* Import entries */}
        <div className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" icon={Database} onClick={() => setModal("bytehi")}>
              Import from ByteHi
            </Button>
            <Button variant="primary" icon={UploadCloud} onClick={() => setModal("csv")}>
              Upload CSV
            </Button>
            <button onClick={downloadTemplate} className="ml-auto flex items-center gap-1.5 text-xs text-brand hover:underline">
              <Download className="h-3.5 w-3.5" /> Download CSV template (with sample rows)
            </button>
          </div>
        </div>

        {/* 服务结果识别 note */}
        <div className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand-light px-4 py-3 text-sm text-brand">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">服务结果识别 (Service result recognition):</span> the system
            recognizes each Case into one of Types 1–8 and generates its expected results (Chatbot /
            Ticketbot use the AI form; Human uses the Human form). These fields are read-only.
          </span>
        </div>

        {/* Parse preview */}
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Parsed Preview</h2>
            <p className="text-xs text-subtle">Cases parsed from the active dataset</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-3 font-medium">Case ID</th>
                  <th className="px-4 py-3 font-medium">Session ID</th>
                  <th className="px-4 py-3 font-medium">Case Type</th>
                  <th className="px-4 py-3 font-medium">Annotation Category</th>
                  <th className="px-4 py-3 font-medium">Knowledge Source</th>
                  <th className="px-4 py-3 font-medium">Expected Results</th>
                  <th className="px-4 py-3 font-medium">Transfer to human?</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.caseId} className="border-b border-line last:border-0 hover:bg-page">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{c.caseId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-subtle">{c.sessionId}</td>
                    <td className="px-4 py-3 text-subtle">Type {c.caseType}</td>
                    <td className="px-4 py-3 text-subtle">{c.annotationCategory}</td>
                    <td className="px-4 py-3">
                      <Badge tone={c.knowledgeSource === "SOP" ? "neutral" : "brand"}>
                        {c.knowledgeSource}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {c.expectedResults.map((r) => (
                          <Badge key={r.resultId} tone={resultTone(r.resultType)}>
                            {r.resultType}
                          </Badge>
                        ))}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.transferToHuman ? (
                        <Badge tone="warning">Yes</Badge>
                      ) : (
                        <span className="text-subtle">No</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Error list area */}
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>No import errors — all rows recognized into a valid Case Type.</span>
        </div>
      </div>

      {modal === "bytehi" && (
        <ImportByteHiModal
          onClose={() => setModal(null)}
          onConfirm={(task) => {
            setModal(null);
            navigate(`/task/${task.taskId}`);
          }}
        />
      )}
      {modal === "csv" && (
        <NewAnnotationTaskModal onClose={() => setModal(null)} />
      )}
    </Layout>
  );
}
