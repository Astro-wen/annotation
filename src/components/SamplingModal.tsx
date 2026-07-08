import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useSessionStore } from "@/store/sessionStore";
import type { SamplingConfig } from "@/store/sessionStore";
import type { ReviewFlow, SessionRow } from "@/mock/types";
import { USER_OPTIONS } from "@/lib/currentUser";

/** A completed review flow together with its source session. */
export interface QcFlowRow {
  flow: ReviewFlow;
  session: SessionRow | undefined;
}

/**
 * Sampling dialog for a single task. C picks how many completed cases to draw
 * into QC; confirming calls `startSampling`.
 */
export default function SamplingModal({
  taskId,
  taskName,
  totalCompleted,
  pool,
  currentEmail,
  onClose,
  onConfirmed,
}: {
  taskId: string;
  taskName: string;
  /** Total completed (A submitted, B too if back-to-back) cases in the task. */
  totalCompleted: number;
  /** Rows still available to sample (not yet sampled, not finalized). */
  pool: QcFlowRow[];
  currentEmail: string;
  onClose: () => void;
  /** Called with the taskId after sampling succeeds (host opens the QC drawer). */
  onConfirmed: (taskId: string) => void;
}) {
  const startSampling = useSessionStore((s) => s.startSampling);
  const [scope, setScope] = useState<SamplingConfig["scope"]>("all_qas");
  const [method, setMethod] = useState<SamplingConfig["method"]>("percentage");
  const [value, setValue] = useState(10);
  const [qaEmail, setQaEmail] = useState("");
  // 指派 C 复核人：抽中的这批 case 交给哪个管理员 / QA 做 QC 复核。
  const [cReviewer, setCReviewer] = useState("");

  // 候选 C：只能是管理员 / QA。防自审——把本次抽样池里作为 A / B 评注过的人排除掉，
  // 避免自己复核自己评过的 case。
  const cReviewerOptions = useMemo(() => {
    const graders = new Set(
      pool.flatMap((row) =>
        [
          row.flow.aAnnotator ?? row.flow.aAssignee,
          row.flow.bAnnotator ?? row.flow.bAssignee,
        ].filter(Boolean),
      ),
    );
    return USER_OPTIONS.filter((u) => u.role === "admin" && !graders.has(u.email));
  }, [pool]);

  // QAs who still have un-sampled cases in this task (as A or B reviewer).
  const qaOptions = useMemo(
    () =>
      Array.from(
        new Set(
          pool.flatMap((row) =>
            [
              row.flow.aAnnotator ?? row.flow.aAssignee,
              row.flow.bAnnotator ?? row.flow.bAssignee,
            ].filter(Boolean),
          ),
        ),
      ) as string[],
    [pool],
  );

  const baseRows = useMemo(() => {
    if (scope === "by_qa" && qaEmail) {
      return pool.filter((row) => {
        const aPerson = row.flow.aAnnotator ?? row.flow.aAssignee;
        const bPerson = row.flow.bAnnotator ?? row.flow.bAssignee;
        return aPerson === qaEmail || bPerson === qaEmail;
      });
    }
    return pool;
  }, [pool, scope, qaEmail]);

  const sampleValue =
    method === "percentage" ? Math.min(Math.max(value, 0), 100) : Math.max(value, 0);
  const estimatedSamples =
    method === "percentage"
      ? sampleValue <= 0
        ? 0
        : Math.max(baseRows.length > 0 ? 1 : 0, Math.round((baseRows.length * sampleValue) / 100))
      : Math.min(sampleValue, baseRows.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="text-xl font-semibold text-ink">Set sampling size</h3>
            <p className="mt-1 text-sm text-subtle">
              {taskName} · Available to sample:{" "}
              <span className="font-semibold text-ink">{pool.length}</span> of {totalCompleted}{" "}
              completed cases
            </p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setScope("all_qas")}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                scope === "all_qas" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"
              }`}
            >
              All QAs
            </button>
            <button
              onClick={() => setScope("by_qa")}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                scope === "by_qa" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"
              }`}
            >
              By QA
            </button>
          </div>

          {scope === "by_qa" && (
            <select
              value={qaEmail}
              onChange={(e) => setQaEmail(e.target.value)}
              className="h-12 w-full rounded-xl border border-line bg-page px-4 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="">Select QA</option>
              {qaOptions.map((qa) => (
                <option key={qa} value={qa}>
                  {qa}
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMethod("percentage")}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                method === "percentage" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"
              }`}
            >
              Percentage (%)
            </button>
            <button
              onClick={() => setMethod("absolute")}
              className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                method === "absolute" ? "border-brand bg-brand text-white" : "border-line bg-white text-brand"
              }`}
            >
              Absolute number
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-page px-4 py-4">
            <input
              type="number"
              min={1}
              max={method === "percentage" ? 100 : undefined}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
              className="h-11 flex-1 rounded-xl border border-line bg-white px-4 text-lg font-semibold text-ink outline-none focus:border-brand"
            />
            <span className="text-2xl font-semibold text-subtle">
              {method === "percentage" ? "%" : "cases"}
            </span>
          </div>

          <p className="text-center text-base text-subtle">
            Estimated samples: <span className="font-semibold text-brand">{estimatedSamples}</span> cases
          </p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">指派 C 复核人（做 QC 的人）</label>
            <select
              value={cReviewer}
              onChange={(e) => setCReviewer(e.target.value)}
              className="h-12 w-full rounded-xl border border-line bg-page px-4 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="">选择 C 复核人</option>
              {cReviewerOptions.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.label} · {u.email}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-subtle">
              抽中的这批 case 将指派给 TA 做 QC 复核。只列管理员 / QA，且已排除本批里作为 A / B 评注过的人（防自审）。
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 px-6 pb-5">
          <button onClick={onClose} className="text-sm font-medium text-brand hover:underline">
            Cancel
          </button>
          <button
            onClick={() => {
              startSampling(
                taskId,
                {
                  scope,
                  qaEmail: scope === "by_qa" ? qaEmail : undefined,
                  method,
                  value: sampleValue,
                  cReviewer,
                },
                currentEmail,
              );
              onConfirmed(taskId);
            }}
            disabled={estimatedSamples === 0 || (scope === "by_qa" && !qaEmail) || !cReviewer}
            className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start sampling
          </button>
        </div>
      </div>
    </div>
  );
}
