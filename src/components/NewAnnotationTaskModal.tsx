import { useRef, useState } from "react";
import { X, UploadCloud } from "lucide-react";
import { parseCasesCsv } from "@/lib/parseCsv";
import { useSessionStore } from "@/store/sessionStore";

export default function NewAnnotationTaskModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (count: number) => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadCases = useSessionStore((s) => s.loadCases);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const result = parseCasesCsv(text);
    setErrors(result.errors);
    if (result.cases.length > 0) {
      loadCases(result.cases, `CSV · ${file.name}`);
      onImported?.(result.cases.length);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between px-6 py-5">
          <h3 className="text-lg font-semibold text-ink">Upload CSV</h3>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 pb-6">
          <div>
            <p className="mb-3 text-sm font-semibold text-ink">Upload CSV File</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              <UploadCloud className="h-4 w-4" /> Choose CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-sm text-subtle">
              The file will be parsed immediately after selection. The system recognizes each
              Case Type (1–8) and generates its expected results.
            </p>
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning-light px-4 py-3 text-xs text-[#92400E]">
              <p className="mb-1 font-medium">错误清单 (Error list):</p>
              <ul className="list-inside list-disc space-y-0.5">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-6 pb-5">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-brand hover:bg-page"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
