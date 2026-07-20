import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { caseSets } from "@/mock/caseSets";
import type { CaseSet } from "@/mock/types";
import { useSessionStore } from "@/store/sessionStore";

export default function ImportByteHiModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (task: CaseSet) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cases = useSessionStore((s) => s.cases);

  const countFor = (taskId: string) => cases.filter((c) => c.taskId === taskId).length;

  const tasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return caseSets.filter((t) => !q || t.taskName.toLowerCase().includes(q));
  }, [search]);

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
          <p className="text-sm font-medium text-subtle">Search a task name to import its case set</p>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search task name..."
            className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
          />

          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line bg-page px-4 py-3">
              <span className="text-sm font-semibold text-ink">Task List</span>
              <span className="text-sm text-subtle">{tasks.length} item(s)</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {tasks.length === 0 ? (
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
                      {countFor(t.taskId)} cases · {t.ruleVersion}
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
