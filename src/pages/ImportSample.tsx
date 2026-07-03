import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Database, AlertTriangle, ArrowRight, CheckCircle2, RotateCcw, Download, UploadCloud } from "lucide-react";
import Layout from "@/components/Layout";
import { PageHeader, Button } from "@/components/ui";
import Badge, { statusTone } from "@/components/Badge";
import ImportByteHiModal from "@/components/ImportByteHiModal";
import NewAnnotationTaskModal from "@/components/NewAnnotationTaskModal";
import { downloadCsv } from "@/lib/csv";
import { useSessionStore } from "@/store/sessionStore";

const TEMPLATE_HEADERS = [
  "session_id",
  "task_id",
  "language",
  "region",
  "service_subtype",
  "knowledge_source",
  "problem_type",
  "annotator",
  "understanding_accuracy",
  "execution_correctness",
  "solution_adoption",
  "sqs_total",
  "ues_total",
  "status",
  "has_human_transfer",
];

const TEMPLATE_SAMPLE = [
  ["7700000000000000001", "TASK-IMPORTED", "en", "US", "Chatbot", "Skill", "R2 Personalized Info", "Annotator A", "3", "2", "1", "2.0", "2.25", "Imported", "false"],
  ["7700000000000000002", "TASK-IMPORTED", "id", "ID", "Ticketbot", "FAQ", "R1 Information", "", "1", "1", "0", "0.67", "1.5", "Imported", "true"],
];

export default function ImportSample() {
  const navigate = useNavigate();
  const [modal, setModal] = useState<"bytehi" | "csv" | null>(null);

  const sessions = useSessionStore((s) => s.sessions);
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
                <span className="font-medium text-ink">Using imported CSV</span>
                <span className="text-subtle">
                  ({sessions.length} sessions{importSource ? ` · ${importSource}` : ""})
                </span>
              </>
            ) : (
              <>
                <Database className="h-4 w-4 text-brand" />
                <span className="font-medium text-ink">Using built-in demo data</span>
                <span className="text-subtle">({sessions.length} sessions)</span>
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

        {/* Data issue banner */}
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-light px-4 py-3 text-sm text-[#92400E]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            System fields are used for verification only. If a field looks wrong, report it via
            data issue / feedback — do not overwrite system-detected fields on the annotation page.
          </span>
        </div>

        {/* Parse preview */}
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Parsed Preview</h2>
            <p className="text-xs text-subtle">Base fields parsed from the active dataset</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-4 py-3 font-medium">Session ID</th>
                  <th className="px-4 py-3 font-medium">Language</th>
                  <th className="px-4 py-3 font-medium">Region</th>
                  <th className="px-4 py-3 font-medium">Service Subtype</th>
                  <th className="px-4 py-3 font-medium">Knowledge Source</th>
                  <th className="px-4 py-3 font-medium">Problem Type</th>
                  <th className="px-4 py-3 font-medium">Annotator</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionId} className="border-b border-line last:border-0 hover:bg-page">
                    <td className="px-4 py-3 font-mono text-xs text-ink">{s.sessionId}</td>
                    <td className="px-4 py-3 text-subtle">{s.language}</td>
                    <td className="px-4 py-3 text-subtle">{s.regionCode}</td>
                    <td className="px-4 py-3 text-subtle">{s.serviceSubtype}</td>
                    <td className="px-4 py-3">
                      <Badge tone={s.knowledgeSource === "SOP" ? "neutral" : "brand"}>
                        {s.knowledgeSource}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-subtle">{s.problemType ?? "—"}</td>
                    <td className="px-4 py-3 text-subtle">{s.annotator ?? "Unassigned"}</td>
                    <td className="px-4 py-3">
                      {s.sopStatus ? (
                        <Badge tone="neutral">{s.sopStatus}</Badge>
                      ) : (
                        <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-subtle">
          SOP cases without stable input / flow evidence show <span className="font-medium">input missing / not ready</span> —
          this does not block Skill / FAQ annotation.
        </p>
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
