import { useMemo, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { USER_OPTIONS, isAdmin } from "@/lib/currentUser";
import type { SamplingConfig } from "@/store/sessionStore";

export default function SamplingModal({
  taskName,
  currentEmail,
  /** effective (non-Invalid) case count in the chosen scope */
  effectiveOf,
  /** already-sampled non-Invalid count in scope */
  alreadySampledOf,
  /** cases still poolable & assignable to the chosen C (anti-self-review applied) */
  availableOf,
  /** invalid count in scope (display) */
  invalidOf,
  /** anti-self-review excluded count for chosen C (display) */
  excludedOf,
  /** not-yet-finalized counts blocking Start (unsubmitted / pending diff) */
  blockersOf,
  onClose,
  onConfirm,
}: {
  taskName: string;
  currentEmail: string;
  effectiveOf: (scope: "all_qas" | "by_qa", qaEmail?: string) => number;
  alreadySampledOf: (scope: "all_qas" | "by_qa", qaEmail?: string) => number;
  availableOf: (scope: "all_qas" | "by_qa", qaEmail: string | undefined, cReviewer: string | undefined, override: boolean) => number;
  invalidOf: (scope: "all_qas" | "by_qa", qaEmail?: string) => number;
  excludedOf: (scope: "all_qas" | "by_qa", qaEmail: string | undefined, cReviewer: string | undefined) => number;
  blockersOf: (scope: "all_qas" | "by_qa", qaEmail?: string) => { unsubmitted: number; pendingDiff: number };
  onClose: () => void;
  onConfirm: (config: SamplingConfig) => void;
}) {
  const admin = isAdmin(currentEmail);
  const [scope, setScope] = useState<"all_qas" | "by_qa">("all_qas");
  const [qaEmail, setQaEmail] = useState<string>("");
  const [method, setMethod] = useState<"percentage" | "absolute">("percentage");
  const [value, setValue] = useState<number>(10);
  const [cReviewer, setCReviewer] = useState<string>("");
  const [override, setOverride] = useState(false);

  const scopeQa = scope === "by_qa" ? qaEmail || undefined : undefined;

  const effective = effectiveOf(scope, scopeQa);
  const alreadySampled = alreadySampledOf(scope, scopeQa);
  const available = availableOf(scope, scopeQa, cReviewer || undefined, override);
  const invalid = invalidOf(scope, scopeQa);
  const excluded = excludedOf(scope, scopeQa, cReviewer || undefined);
  const blockers = blockersOf(scope, scopeQa);
  const notFinalized = blockers.unsubmitted + blockers.pendingDiff;

  // Target & this-time preview.
  const { target, thisTime } = useMemo(() => {
    if (method === "percentage") {
      const t = value <= 0 ? 0 : Math.ceil((effective * value) / 100);
      return { target: t, thisTime: Math.max(0, Math.min(t - alreadySampled, available)) };
    }
    return { target: alreadySampled + Math.min(value, available), thisTime: Math.max(0, Math.min(value, available)) };
  }, [method, value, effective, alreadySampled, available]);

  const canStart =
    notFinalized === 0 &&
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
      override: admin || override,
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
          <div className="rounded-lg bg-page px-4 py-3">
            Available to sample:{" "}
            <span className="font-mono font-semibold text-ink">{available}</span> of{" "}
            <span className="font-mono font-semibold text-ink">{effective}</span> effective case(s)
            <div className="mt-1 text-xs text-subtle">
              Invalid excluded: {invalid} · Anti-self-review excluded: {excluded}
            </div>
          </div>

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
                    {u.shortName} · {u.email}
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
                min={method === "percentage" ? 1 : 1}
                max={method === "percentage" ? 100 : available}
                value={value || ""}
                onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
                className="h-10 w-32 rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
              />
              <span className="text-subtle">{method === "percentage" ? "% (1–100)" : "cases"}</span>
            </div>
          </div>

          {/* Preview */}
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-line px-4 py-3 text-center">
            <div>
              <p className="text-xs text-subtle">Target</p>
              <p className="font-mono text-lg font-semibold text-ink">{target}</p>
            </div>
            <div>
              <p className="text-xs text-subtle">Already sampled</p>
              <p className="font-mono text-lg font-semibold text-ink">{alreadySampled}</p>
            </div>
            <div>
              <p className="text-xs text-subtle">This time</p>
              <p className="font-mono text-lg font-semibold text-brand">{thisTime}</p>
            </div>
          </div>

          {/* Assign C */}
          <div>
            <p className="mb-1.5 font-medium text-ink">指派 C 复核人</p>
            <select
              value={cReviewer}
              onChange={(e) => setCReviewer(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
            >
              <option value="">Select C reviewer…</option>
              {USER_OPTIONS.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.shortName} · {u.email}
                </option>
              ))}
            </select>
            {admin && (
              <label className="mt-2 flex items-center gap-2 text-xs text-subtle">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                管理员 Override 防自审（允许 C 曾作为 A/B）
              </label>
            )}
          </div>

          {notFinalized > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning-light px-3 py-2 text-xs text-[#92400E]">
              所选范围内仍有未定稿 case，无法开始抽样：未提交 {blockers.unsubmitted} 条 · 待拉齐 {blockers.pendingDiff} 条。
            </div>
          )}
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
