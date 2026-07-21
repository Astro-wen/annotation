import { useState } from "react";
import { Users, X, Plus, AlertCircle } from "lucide-react";
import { USER_OPTIONS } from "@/lib/currentUser";
import { samePerson } from "@/lib/access";
import type { CaseType } from "@/mock/types";
import type { DistributeConfig, QaAllocation, QaPair } from "@/store/sessionStore";
import { ANNOTATION_CATEGORY_BY_TYPE } from "@/mock/sessions";

/** Per-Type availability within the current case set (unassigned, non-invalid). */
export interface TypeAvailability {
  caseType: CaseType;
  total: number; // valid cases of this type
  remaining: number; // unassigned & non-invalid of this type
  resultCombo: string; // e.g. "Chatbot + Ticketbot"
}

// ---- QA name search input ---------------------------------------------------

function QaNameInput({
  value,
  onChange,
  placeholder = "Enter QA name / email",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [focus, setFocus] = useState(false);
  const q = value.trim().toLowerCase();
  const matches = q
    ? USER_OPTIONS.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.label.toLowerCase().includes(q) ||
          u.shortName.toLowerCase().includes(q),
      )
    : USER_OPTIONS;
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
      />
      {focus && matches.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
          {matches.map((u) => (
            <button
              key={u.email}
              type="button"
              onMouseDown={() => onChange(u.email)}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-page"
            >
              <span className="text-sm font-medium text-ink">{u.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssignModal({
  taskName,
  types,
  lockedMode,
  onClose,
  onConfirm,
}: {
  taskName: string;
  /** per-Type availability list (only Types present in the set) */
  types: TypeAvailability[];
  /** locked task mode; undefined = first assignment (选择并锁定) */
  lockedMode?: "Normal" | "Back-to-Back";
  onClose: () => void;
  onConfirm: (config: DistributeConfig) => void;
}) {
  const [mode, setMode] = useState<"Normal" | "Back-to-Back">(lockedMode ?? "Normal");
  const [selectedTypes, setSelectedTypes] = useState<Set<CaseType>>(new Set());
  const [normalRows, setNormalRows] = useState<QaAllocation[]>([{ name: "", quantity: 0 }]);
  const [pairRows, setPairRows] = useState<QaPair[]>([{ aName: "", bName: "", quantity: 0 }]);
  const [confirmLock, setConfirmLock] = useState(false);

  // Effective Types for this round: selected, or All when none selected.
  const effectiveTypes = selectedTypes.size > 0 ? types.filter((t) => selectedTypes.has(t.caseType)) : types;
  const totalRemaining = effectiveTypes.reduce((sum, t) => sum + t.remaining, 0);

  const requested = mode === "Normal"
    ? normalRows.reduce((s, r) => s + (r.quantity || 0), 0)
    : pairRows.reduce((s, r) => s + (r.quantity || 0), 0);

  const toggleType = (t: CaseType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const buildConfig = (): DistributeConfig => ({
    mode,
    types: Array.from(selectedTypes),
    aDistribution: mode === "Normal" ? normalRows.filter((r) => r.name.trim() && r.quantity > 0) : undefined,
    pairDistribution: mode === "Back-to-Back" ? pairRows.filter((r) => r.quantity > 0) : undefined,
  });

  const validate = (): string | null => {
    if (requested === 0) return "请填写要分配的 QA 与数量。";
    if (requested > totalRemaining)
      return `本轮所选范围只剩 ${totalRemaining} 条可分配，当前填写了 ${requested} 条，请减少数量。`;
    if (mode === "Normal" && normalRows.filter((r) => r.name.trim() && r.quantity > 0).length === 0)
      return "请至少填写一行 QA 与数量。";
    if (mode === "Back-to-Back") {
      const rows = pairRows.filter((r) => r.quantity > 0);
      if (rows.some((r) => !r.aName.trim() || !r.bName.trim())) return "Back-to-Back 每一行都必须同时填写 标注员1 和 标注员2。";
      // 防自审：同一行的两名标注员不能是同一人（任何人都不能绕过）。
      if (rows.some((r) => samePerson(r.aName, r.bName)))
        return "防自审：同一行的 标注员1 与 标注员2 不能是同一个人。";
    }
    return null;
  };

  // Live validation: warn as the user types, and disable Confirm when invalid.
  const liveError = validate();

  const submit = () => {
    if (liveError) return;
    onConfirm(buildConfig());
  };

  const tryConfirm = () => {
    if (liveError) return; // Confirm is disabled while invalid; guard anyway.
    if (!lockedMode) {
      setConfirmLock(true); // first assignment: confirm mode lock
      return;
    }
    submit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand" />
            <h3 className="text-lg font-semibold text-ink">Batch Assign · {taskName}</h3>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Mode selection / lock */}
          <div className="rounded-lg border border-line p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">评分模式</span>
              {lockedMode && (
                <span className="rounded-md bg-brand-light px-2 py-0.5 text-xs font-medium text-brand">
                  已锁定：{lockedMode}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {(["Normal", "Back-to-Back"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!!lockedMode}
                  onClick={() => setMode(m)}
                  className={`rounded-md border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    mode === m ? "border-brand bg-brand text-white" : "border-line text-brand hover:bg-page"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-subtle">
              {mode === "Back-to-Back"
                ? "双人同评一条 case：两名标注员独立评分，一致自动定稿，不一致进待拉齐、拉齐后定稿。"
                : "单人评：标注员评完即定稿。"}
              {!lockedMode && " 首次分配将锁定该模式，之后不可切换。"}
            </p>
          </div>

          {/* Type selection */}
          <div className="rounded-lg border border-line p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Case Type（不勾选 = All）</span>
              <span className="text-xs text-subtle">
                Total remaining: <span className="font-mono font-semibold text-ink">{totalRemaining}</span>
              </span>
            </div>
            <div className="space-y-1.5">
              {types.map((t) => {
                const checked = selectedTypes.has(t.caseType);
                const disabled = t.remaining === 0;
                return (
                  <label
                    key={t.caseType}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                      disabled ? "border-line bg-page opacity-60" : checked ? "border-brand bg-brand-light" : "border-line"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={checked}
                        onChange={() => toggleType(t.caseType)}
                      />
                      <span className="font-medium text-ink">Type {t.caseType}</span>
                      <span className="text-xs text-subtle">
                        {ANNOTATION_CATEGORY_BY_TYPE[t.caseType]} · {t.resultCombo}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-subtle">
                      total {t.total} · remaining {t.remaining}
                    </span>
                  </label>
                );
              })}
              {types.length === 0 && <p className="text-sm text-subtle">该 case set 暂无可分配 Type。</p>}
            </div>
          </div>

          {/* Distribution */}
          {mode === "Normal" ? (
            <div className="rounded-lg border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Annotators</span>
                <span className="text-xs text-subtle">
                  Remaining unassigned: <span className="font-mono font-semibold text-ink">{Math.max(0, totalRemaining - requested)}</span>
                </span>
              </div>
              <div className="mb-2 flex gap-3 text-xs font-medium uppercase tracking-wide text-subtle">
                <span className="flex-1">QA Name</span>
                <span className="w-28">Quantity</span>
              </div>
              {normalRows.map((row, i) => (
                <div key={i} className="mb-2 flex items-start gap-3">
                  <div className="flex-1">
                    <QaNameInput value={row.name} onChange={(v) => setNormalRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, name: v } : r)))} />
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={row.quantity || ""}
                    placeholder="Number"
                    onChange={(e) =>
                      setNormalRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, quantity: Math.max(0, Number(e.target.value) || 0) } : r)))
                    }
                    className="h-10 w-28 rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setNormalRows((rs) => [...rs, { name: "", quantity: 0 }])}
                className="mt-1 inline-flex items-center gap-1 text-sm text-brand hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add more
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">标注员1 ｜ 标注员2 ｜ Quantity</span>
                <span className="text-xs text-subtle">
                  Remaining unassigned: <span className="font-mono font-semibold text-ink">{Math.max(0, totalRemaining - requested)}</span>
                </span>
              </div>
              <div className="mb-2 flex gap-3 text-xs font-medium uppercase tracking-wide text-subtle">
                <span className="flex-1">标注员1</span>
                <span className="flex-1">标注员2</span>
                <span className="w-24">Quantity</span>
              </div>
              {pairRows.map((row, i) => (
                <div key={i} className="mb-2 flex items-start gap-3">
                  <div className="flex-1">
                    <QaNameInput value={row.aName} placeholder="标注员1 姓名" onChange={(v) => setPairRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, aName: v } : r)))} />
                  </div>
                  <div className="flex-1">
                    <QaNameInput value={row.bName} placeholder="标注员2 姓名" onChange={(v) => setPairRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, bName: v } : r)))} />
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={row.quantity || ""}
                    placeholder="Number"
                    onChange={(e) =>
                      setPairRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, quantity: Math.max(0, Number(e.target.value) || 0) } : r)))
                    }
                    className="h-10 w-24 rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPairRows((rs) => [...rs, { aName: "", bName: "", quantity: 0 }])}
                className="mt-1 inline-flex items-center gap-1 text-sm text-brand hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Add more
              </button>
            </div>
          )}

          {/* Live validation warning (shown once the user starts entering quantities). */}
          {requested > 0 && liveError && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-light px-3 py-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{liveError}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-brand hover:bg-page">
            Cancel
          </button>
          <button
            onClick={tryConfirm}
            disabled={!!liveError}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-page disabled:text-subtle"
          >
            Confirm Distribute
          </button>
        </div>
      </div>

      {/* Mode-lock confirmation (first assignment only) */}
      {confirmLock && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-ink">确认锁定标注模式？</h4>
            <p className="mt-2 text-sm text-subtle">
              首次分配将把该 task 锁定为「<span className="font-medium text-ink">{mode}</span>」模式，之后 Batch Assign 与 Detail Assign QA 均沿用该模式，不可切换。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmLock(false)} className="rounded-md border border-line px-4 py-2 text-sm text-subtle hover:bg-page">
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmLock(false);
                  submit();
                }}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                确认锁定并分配
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
