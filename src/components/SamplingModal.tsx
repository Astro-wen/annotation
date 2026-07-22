import { useMemo, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { USER_OPTIONS } from "@/lib/currentUser";
import type { SamplingConfig } from "@/store/sessionStore";

export default function SamplingModal({
  taskName,
  /** effective (non-Invalid) case count in the chosen scope */
  effectiveOf,
  /** already-sampled non-Invalid count in scope */
  alreadySampledOf,
  /** assignment-ready cases assignable to the chosen C (anti-self-review applied) */
  availableOf,
  /** anti-self-review excluded count for chosen C (display) */
  excludedOf,
  /** Task-level anti-self-review: whether the chosen C is any A/B in this task */
  cIsTaskAB,
  onClose,
  onConfirm,
}: {
  taskName: string;
  currentEmail: string;
  effectiveOf: (scope: "all_qas" | "by_qa", qaEmail?: string) => number;
  alreadySampledOf: (scope: "all_qas" | "by_qa", qaEmail?: string) => number;
  availableOf: (scope: "all_qas" | "by_qa", qaEmail: string | undefined, cReviewer: string | undefined) => number;
  excludedOf: (scope: "all_qas" | "by_qa", qaEmail: string | undefined, cReviewer: string | undefined) => number;
  cIsTaskAB: (cReviewer: string | undefined) => boolean;
  onClose: () => void;
  onConfirm: (config: SamplingConfig) => void;
}) {
  const [scope, setScope] = useState<"all_qas" | "by_qa">("all_qas");
  const [qaEmail, setQaEmail] = useState<string>("");
  const [method, setMethod] = useState<"percentage" | "absolute">("percentage");
  const [value, setValue] = useState<number>(10);
  const [cReviewer, setCReviewer] = useState<string>("");

  const scopeQa = scope === "by_qa" ? qaEmail || undefined : undefined;

  const effective = effectiveOf(scope, scopeQa);
  const alreadySampled = alreadySampledOf(scope, scopeQa);
  const available = availableOf(scope, scopeQa, cReviewer || undefined);
  const excluded = excludedOf(scope, scopeQa, cReviewer || undefined);

  // How many cases this action will sample (percentage counts against effective
  // total; absolute is a direct count), capped by what's currently available.
  const thisTime = useMemo(() => {
    if (method === "percentage") {
      const t = value <= 0 ? 0 : Math.ceil((effective * value) / 100);
      return Math.max(0, Math.min(t - alreadySampled, available));
    }
    return Math.max(0, Math.min(value, available));
  }, [method, value, effective, alreadySampled, available]);

  const canStart =
    (scope === "all_qas" || !!qaEmail) &&
    !!cReviewer &&
    thisTime > 0;

  const start = () => {
    if (!canStart) return;
    onConfirm({
      scope,
      qaEmail: scopeQa,
      method,
      value,
      cReviewer: cReviewer || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand" />
            <h3 className="text-lg font-semibold text-ink">Set Sampling · {taskName}</h3>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
          {/* Scope */}
          <div>
            <p className="mb-1.5 font-medium text-ink">Scope</p>
            <div className="flex gap-2">
              {(["all_qas", "by_qa"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
                    scope === s ? "border-brand bg-brand text-white" : "border-line text-brand hover:bg-page"
                  }`}
                >
                  {s === "all_qas" ? "All QAs" : "By QA"}
                </button>
              ))}
            </div>
            {scope === "by_qa" && (
              <select
                value={qaEmail}
                onChange={(e) => setQaEmail(e.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
              >
                <option value="">Select QA…</option>
                {USER_OPTIONS.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Method */}
          <div>
            <p className="mb-1.5 font-medium text-ink">Method</p>
            <div className="flex gap-2">
              {(["percentage", "absolute"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
                    method === m ? "border-brand bg-brand text-white" : "border-line text-brand hover:bg-page"
                  }`}
                >
                  {m === "percentage" ? "Percentage (%)" : "Absolute number"}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={method === "percentage" ? 100 : available}
                value={value || ""}
                onChange={(e) => {
                  const raw = Math.max(0, Number(e.target.value) || 0);
                  setValue(method === "percentage" ? Math.min(100, raw) : raw);
                }}
                className="h-10 w-32 rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
              />
              <span className="text-subtle">{method === "percentage" ? "% (1–100)" : "cases"}</span>
            </div>
          </div>

          {/* Preview — single clear line: how many cases this action will sample. */}
          <div className="rounded-lg border border-line bg-page px-4 py-3 text-sm">
            本次将抽取 <span className="font-mono text-lg font-semibold text-brand">{thisTime}</span> 个 case
            <span className="text-subtle">（当前可抽 {available} 个{alreadySampled > 0 ? `，已抽 ${alreadySampled} 个` : ""}）</span>
          </div>

          {/* Assign C */}
          <div>
            <p className="mb-1.5 font-medium text-ink">指派复核人</p>
            <select
              value={cReviewer}
              onChange={(e) => setCReviewer(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
            >
              <option value="">选择复核人…</option>
              {USER_OPTIONS.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.label}
                </option>
              ))}
            </select>
            {cReviewer && cIsTaskAB(cReviewer) && excluded > 0 && (
              <p className="mt-2 rounded-md bg-danger-light px-2 py-1 text-xs text-danger">
                该标注员在本 Task 已评过 {excluded} 个 case（防自审），仅会分配其未参与过的 case。
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-brand hover:bg-page">
            Cancel
          </button>
          <button
            onClick={start}
            disabled={!canStart}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-page disabled:text-subtle"
          >
            Start Sampling
          </button>
        </div>
      </div>
    </div>
  );
}
