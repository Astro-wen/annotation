import { useMemo, useRef, useState } from "react";
import { X, Users } from "lucide-react";
import type { SessionRow } from "@/mock/types";
import type { AssignConfig, QaAllocation, QaPair } from "@/store/sessionStore";
import { USER_OPTIONS } from "@/lib/currentUser";

interface Row {
  name: string;
  quantity: string;
}

/** Back-to-back pairing row: A email | B email | shared quantity. */
interface PairRow {
  aName: string;
  bName: string;
  quantity: string;
}

function emptyPairRows(n: number): PairRow[] {
  return Array.from({ length: n }, () => ({ aName: "", bName: "", quantity: "" }));
}

function emptyRows(n: number): Row[] {
  return Array.from({ length: n }, () => ({ name: "", quantity: "" }));
}

/** QA name input with keyword matching against the test accounts. */
function QaNameInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    return USER_OPTIONS.filter((u) => {
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.label.toLowerCase().includes(q) ||
        u.shortName.toLowerCase().includes(q)
      );
    });
  }, [value]);

  return (
    <div className="relative">
      <input
        value={value}
        placeholder="Enter QA name"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-11 z-10 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
          {suggestions.map((u) => (
            <button
              key={u.email}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimer.current) clearTimeout(blurTimer.current);
                onChange(u.email);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-page"
            >
              <span className="font-medium text-ink">{u.label}</span>
              <span className="text-xs text-subtle">{u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DistributionTable({
  title,
  rows,
  setRows,
  remaining,
}: {
  title: string;
  rows: Row[];
  setRows: (rows: Row[]) => void;
  remaining: number;
}) {
  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className={`text-xs ${remaining < 0 ? "text-danger" : "text-subtle"}`}>
          Remaining unassigned: <span className="font-semibold">{remaining} cases</span>
        </span>
      </div>

      <div className="grid grid-cols-[1fr_120px] gap-x-3 gap-y-2">
        <span className="text-xs font-medium text-subtle">QA Name</span>
        <span className="text-xs font-medium text-subtle">Quantity</span>
        {rows.map((row, i) => (
          <FragmentRow key={i}>
            <QaNameInput value={row.name} onChange={(v) => update(i, { name: v })} />
            <input
              type="number"
              min={0}
              value={row.quantity}
              placeholder="Number"
              onChange={(e) => update(i, { quantity: e.target.value })}
              className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
            />
          </FragmentRow>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, { name: "", quantity: "" }])}
        className="w-full rounded-lg border border-line py-2 text-sm font-medium text-brand hover:bg-page"
      >
        Add more
      </button>
    </div>
  );
}

/**
 * Back-to-back pairing table: each row is A | B | Quantity. The row's quantity
 * cases go to BOTH that row's A (top slot) and B (bottom dropdown) on each case.
 */
function PairTable({
  rows,
  setRows,
  remaining,
}: {
  rows: PairRow[];
  setRows: (rows: PairRow[]) => void;
  remaining: number;
}) {
  const update = (i: number, patch: Partial<PairRow>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Back-to-Back Pairs（A ｜ B ｜ 数量）</span>
        <span className={`text-xs ${remaining < 0 ? "text-danger" : "text-subtle"}`}>
          Remaining unassigned: <span className="font-semibold">{remaining} cases</span>
        </span>
      </div>

      <div className="grid grid-cols-[1fr_1fr_96px] gap-x-3 gap-y-2">
        <span className="text-xs font-medium text-subtle">A Annotator</span>
        <span className="text-xs font-medium text-subtle">B Annotator</span>
        <span className="text-xs font-medium text-subtle">Quantity</span>
        {rows.map((row, i) => (
          <FragmentRow key={i}>
            <QaNameInput value={row.aName} onChange={(v) => update(i, { aName: v })} />
            <QaNameInput value={row.bName} onChange={(v) => update(i, { bName: v })} />
            <input
              type="number"
              min={0}
              value={row.quantity}
              placeholder="Qty"
              onChange={(e) => update(i, { quantity: e.target.value })}
              className="h-10 w-full rounded-lg border border-line bg-page px-3 text-sm text-ink outline-none focus:border-brand focus:bg-white"
            />
          </FragmentRow>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows([...rows, { aName: "", bName: "", quantity: "" }])}
        className="w-full rounded-lg border border-line py-2 text-sm font-medium text-brand hover:bg-page"
      >
        Add more
      </button>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function toAllocations(rows: Row[]): QaAllocation[] {
  return rows
    .filter((r) => r.name.trim() && Number(r.quantity) > 0)
    .map((r) => ({ name: r.name.trim(), quantity: Number(r.quantity) }));
}

function sumQty(rows: Row[]): number {
  return rows.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0);
}

/**
 * Single-case QA assignment (Detail page). Unlike the case-set distribution,
 * one case is assigned to exactly one QA — no quantity input.
 */
export function SingleAssignModal({
  session,
  title = "Assign QA Owner",
  initialName,
  excludeEmail,
  onClose,
  onConfirm,
}: {
  session: SessionRow;
  /** Modal heading (e.g. "Assign B Reviewer"). */
  title?: string;
  /** Pre-filled QA name. */
  initialName?: string;
  /** A person that cannot be picked (anti-self-review for B). */
  excludeEmail?: string;
  onClose: () => void;
  onConfirm: (qaName: string) => void;
}) {
  const [name, setName] = useState(initialName ?? session.qaOwner ?? "");

  const existingQas = useMemo(() => {
    const set = new Set<string>();
    USER_OPTIONS.forEach((u) => set.add(u.email));
    if (session.qaOwner) set.add(session.qaOwner);
    if (session.annotator) set.add(session.annotator);
    if (excludeEmail) set.delete(excludeEmail);
    return Array.from(set);
  }, [session.qaOwner, session.annotator, excludeEmail]);

  const isExcluded = !!excludeEmail && name.trim() === excludeEmail;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-line bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand" />
            <h3 className="text-base font-semibold">{title}</h3>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="font-mono text-xs text-subtle">{session.sessionId}</p>
          {excludeEmail && (
            <p className="rounded-md bg-page px-3 py-2 text-xs text-subtle">
              不能指派成 A（<span className="font-medium text-ink">{USER_OPTIONS.find((u) => u.email === excludeEmail)?.shortName ?? excludeEmail}</span>），其他人都可以。
            </p>
          )}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-subtle">Existing QAs</p>
            <div className="flex flex-wrap gap-2">
              {existingQas.map((qa) => {
                const opt = USER_OPTIONS.find((u) => u.email === qa);
                const label = opt?.shortName ?? qa;
                const on = name === qa;
                return (
                  <button
                    key={qa}
                    type="button"
                    onClick={() => setName(qa)}
                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                      on ? "border-brand bg-brand-light text-brand" : "border-line text-subtle hover:border-brand/40 hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-subtle">QA Name</p>
            <p className="mb-2 text-xs text-subtle">Select from existing QAs above, or type a new name to create one.</p>
            <QaNameInput value={name} onChange={setName} />
            {isExcluded && (
              <p className="mt-1 text-xs text-danger">不能选 A 本人，请换一个人。</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-brand hover:bg-page">
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(name.trim());
              onClose();
            }}
            disabled={!name.trim() || isExcluded}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AssignModal({
  session,
  remainingCases = 1,
  lockedMode,
  onClose,
  onConfirm,
}: {
  session: SessionRow | null;
  remainingCases?: number;
  /** If the task already has a mode, lock the Back-to-Back toggle to it. */
  lockedMode?: boolean;
  onClose: () => void;
  onConfirm: (config: AssignConfig, isReassign: boolean) => void;
}) {
  const hasOwner = !!session?.qaOwner;
  const isReassign = hasOwner;
  const actionLabel = hasOwner ? "Reassign" : "Distribute";

  const [backToBack, setBackToBack] = useState<boolean>(lockedMode ?? false);

  const [aRows, setARows] = useState<Row[]>(() =>
    session?.annotator ? [{ name: session.annotator, quantity: "1" }, ...emptyRows(2)] : emptyRows(3),
  );
  const [pairRows, setPairRows] = useState<PairRow[]>(() => emptyPairRows(3));

  // Quantity used = A's quantity. For back-to-back, A and B are locked to the
  // same count per row, so "remaining" only needs to follow A (== the pair qty).
  const usedQty = backToBack
    ? pairRows.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0)
    : sumQty(aRows);
  const remaining = remainingCases - usedQty;
  const aAllocations = toAllocations(aRows);

  const pairAllocations: QaPair[] = pairRows
    .filter((r) => r.aName.trim() && r.bName.trim() && Number(r.quantity) > 0)
    .map((r) => ({ aName: r.aName.trim(), bName: r.bName.trim(), quantity: Number(r.quantity) }));

  // Back-to-back A and B must be different people on the same row (a person
  // can't double-blind review their own annotation). Compare normalized.
  const sameABError = backToBack
    ? pairRows.some((r) => {
        const a = r.aName.trim().toLowerCase();
        const b = r.bName.trim().toLowerCase();
        return a && b && a === b;
      })
    : false;
  const noRemaining = remainingCases <= 0;

  const over = usedQty > remainingCases;
  const overError = noRemaining
    ? "没有可分配的 case（都已分配）。"
    : over
      ? `分配 ${usedQty} 个，超过了可分配的 ${remainingCases} 个 case`
      : sameABError
        ? "同一行的 A、B 不能是同一个人（不能自己评自己）。"
        : null;

  const canConfirm = over || sameABError || noRemaining
    ? false
    : backToBack
      ? pairAllocations.length > 0
      : aAllocations.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className={`flex max-h-[90vh] w-full flex-col rounded-xl border border-line bg-white shadow-xl ${backToBack ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand" />
            <h3 className="text-base font-semibold">Distribute cases to QAs</h3>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between rounded-lg bg-page px-3 py-2 text-sm">
            <span className="text-subtle">Assignment Type</span>
            <span className="font-medium text-brand">{actionLabel}</span>
          </div>

          {/* Back-to-Back toggle (the "lock"): OFF = single annotator per case;
              ON = an A and a B reviewer are both assigned to the same case. */}
          <label
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
              backToBack ? "border-brand bg-brand-light" : "border-line bg-white"
            } ${lockedMode !== undefined ? "opacity-90" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={backToBack}
              disabled={lockedMode !== undefined}
              onChange={(e) => setBackToBack(e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium text-ink">Back-to-Back（双人同评一条 case）</span>
              <span className="mt-0.5 block text-xs text-subtle">
                {lockedMode !== undefined
                  ? `该 task 已锁定为「${lockedMode ? "Back-to-Back" : "Normal"}」模式，不可更改。`
                  : "勾选后每行的 A、B 会同评同一批 case（数量共用一栏）；不勾则一人一条 case。"}
              </span>
            </span>
          </label>

          {backToBack ? (
            <div className="rounded-lg border border-line bg-white p-4">
              <PairTable rows={pairRows} setRows={setPairRows} remaining={remaining} />
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-white p-4">
              <DistributionTable
                title="Annotators"
                rows={aRows}
                setRows={setARows}
                remaining={remaining}
              />
            </div>
          )}

          <p className="text-xs text-subtle">
            {backToBack
              ? "每行「A ｜ B ｜ 数量」：该行的数量条 case 会同时分给这行的 A（case 上层）和 B（case 下拉），两人做 back-to-back。A、B 无需达成一致，最终由 C overwrite。"
              : "分配 Annotators。评完后进入 QC 可抽样。"}
          </p>
        </div>

        {overError && (
          <div className="mx-5 mb-1 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {overError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-subtle hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm(
                {
                  aEmail: backToBack ? pairAllocations[0]?.aName ?? "" : aAllocations[0]?.name ?? "",
                  bEmail: backToBack ? pairAllocations[0]?.bName : undefined,
                  backToBackEnabled: backToBack,
                  aDistribution: backToBack ? undefined : aAllocations,
                  pairDistribution: backToBack ? pairAllocations : undefined,
                },
                isReassign,
              );
              onClose();
            }}
            disabled={!canConfirm}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
