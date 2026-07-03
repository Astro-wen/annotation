import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { caseSets } from "@/mock/caseSets";
import type { CaseSet } from "@/mock/types";

type TaskType = "Ticket" | "Chatbot";

export default function ImportByteHiModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (task: CaseSet) => void;
}) {
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const tasks = useMemo(() => {
    if (!taskType) return [];
    const q = search.trim().toLowerCase();
    return caseSets.filter(
      (t) =>
        t.taskType === taskType &&
        (!q || t.taskName.toLowerCase().includes(q)),
    );
  }, [taskType, search]);

  const selected = tasks.find((t) => t.taskId === selectedId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between px-6 py-5">
          <h3 className="text-lg font-semibold text-ink">Import from ByteHi</h3>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-2">
          <p className="text-sm font-medium text-subtle">Select task type and search task name</p>

          <div className="flex items-center gap-3">
            <span className="text-sm text-subtle">Task Type</span>
            {(["Ticket", "Chatbot"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTaskType(t);
                  setSelectedId(null);
                }}
                className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors ${
                  taskType === t
                    ? "border-brand bg-brand text-white"
                    : "border-line text-brand hover:bg-page"
                }`}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search task name..."
              className="h-10 flex-1 rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line bg-page px-4 py-3">
              <span className="text-sm font-semibold text-ink">Task List</span>
              <span className="text-sm text-subtle">{tasks.length} item(s)</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {!taskType ? (
                <p className="px-4 py-6 text-sm text-subtle">Please select task type first.</p>
              ) : tasks.length === 0 ? (
                <p className="px-4 py-6 text-sm text-subtle">No task matched.</p>
              ) : (
                tasks.map((t) => (
                  <button
                    key={t.taskId}
                    onClick={() => setSelectedId(t.taskId)}
                    className={`flex w-full items-center justify-between border-b border-line px-4 py-3 text-left last:border-0 hover:bg-page ${
                      selectedId === t.taskId ? "bg-brand-light" : ""
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium text-ink">{t.taskName}</span>
                      <span className="block font-mono text-xs text-muted">{t.taskId}</span>
                    </span>
                    <span className="text-xs text-subtle">
                      {t.totalCases} cases · {t.ruleVersion}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <p className="text-sm text-subtle">
            {selected ? `Selected: ${selected.taskName}` : "Select a task to import."}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-brand hover:bg-page"
          >
            Cancel
          </button>
          <button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-page disabled:text-subtle"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
