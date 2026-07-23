import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, RotateCcw, Download, UploadCloud } from "lucide-react";
import Layout from "@/components/Layout";
import { PageHeader, Button } from "@/components/ui";
import Badge from "@/components/Badge";
import NewAnnotationTaskModal from "@/components/NewAnnotationTaskModal";
import { downloadCsv } from "@/lib/csv";
import { useSessionStore } from "@/store/sessionStore";
import { resultGroupOf, type ResultGroup } from "@/mock/types";

// Upload / Data download share the same Human Annotation Template.
const TEMPLATE_HEADERS = [
  "merge_id",
  "session_id",
  "ticket_id",
  "task_id",
  "language",
  "region",
  "knowledge_source",
  "service_type",
  "service_stage",
];

const TEMPLATE_SAMPLE = [
  ["MG-1", "7700000000000000001", "", "TASK-IMPORTED", "en", "US", "Skill", "AI", "IM"],
  ["MG-2", "7700000000000000002", "TK-2", "TASK-IMPORTED", "id", "ID", "FAQ", "AI+Human", "IM"],
  ["MG-3", "", "TK-3", "TASK-IMPORTED", "ar", "SA", "SOP", "AI+Human", "Ticket"],
];

const groupTone = (g: ResultGroup): "brand" | "warning" | "neutral" =>
  g === "Human IM" || g === "Human Ticket" ? "warning" : g === "Ticketbot" ? "neutral" : "brand";

export default function ImportSample() {
  const navigate = useNavigate();
  const [csvOpen, setCsvOpen] = useState(false);

  const cases = useSessionStore((s) => s.cases);
  const imported = useSessionStore((s) => s.imported);
  const importSource = useSessionStore((s) => s.importSource);
  const reset = useSessionStore((s) => s.reset);

  const downloadTemplate = () => {
    downloadCsv("human_annotation_template.csv", TEMPLATE_HEADERS, TEMPLATE_SAMPLE);
  };

  // Recognized result count preview (each expected result = one score card).
  const totalResults = cases.reduce((sum, c) => sum + c.expectedResults.length, 0);

  return (
    <Layout>
      <PageHeader
        title="Import Sample"
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
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="font-medium text-ink">{imported ? "Using imported dataset" : "Using built-in demo data"}</span>
            <span className="text-subtle">
              ({cases.length} cases · {totalResults} results{imported && importSource ? ` · ${importSource}` : ""})
            </span>
          </span>
          {imported && (
            <button onClick={reset} className="flex items-center gap-1.5 text-xs text-subtle hover:text-ink">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to demo data
            </button>
          )}
        </div>

        {/* Upload entry */}
        <div className="rounded-xl border border-line bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={UploadCloud} onClick={() => setCsvOpen(true)}>
              Upload CSV
            </Button>
            <button onClick={downloadTemplate} className="ml-auto flex items-center gap-1.5 text-xs text-brand hover:underline">
              <Download className="h-3.5 w-3.5" /> Download Human Annotation Template
            </button>
          </div>
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
                  <th className="px-4 py-3 font-medium">Session</th>
                  <th className="px-4 py-3 font-medium">Ticket</th>
                  <th className="px-4 py-3 font-medium">Knowledge Source</th>
                  <th className="px-4 py-3 font-medium">Recognized Results</th>
                </tr>
              </thead>
              <tbody>
                {cases.slice(0, 40).map((c) => (
                  <tr key={c.caseId} className="border-b border-line last:border-0 hover:bg-page">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{c.caseId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-subtle">{c.sessionId || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-subtle">{c.ticketId ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={c.knowledgeSource === "SOP" ? "neutral" : "brand"}>{c.knowledgeSource}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {c.expectedResults.map((r) => (
                          <Badge key={r.resultId} tone={groupTone(resultGroupOf(r))}>
                            {resultGroupOf(r)}
                          </Badge>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cases.length > 40 && (
            <div className="border-t border-line px-4 py-2 text-center text-xs text-muted">仅预览前 40 条，共 {cases.length} 条 Case。</div>
          )}
        </div>

        {/* Error list area */}
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-light px-4 py-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>No import errors — all rows recognized into valid results.</span>
        </div>
      </div>

      {csvOpen && <NewAnnotationTaskModal onClose={() => setCsvOpen(false)} />}
    </Layout>
  );
}
