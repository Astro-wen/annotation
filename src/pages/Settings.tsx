import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquareText, History, Lock, Unlock, Plus, RotateCcw, AlertTriangle, FlaskConical } from "lucide-react";
import Layout from "@/components/Layout";
import { PageHeader, Button } from "@/components/ui";
import Badge from "@/components/Badge";
import type { RubricDimension, ReasonOption, RubricGroup } from "@/mock/settings";
import { useCurrentUserStore } from "@/lib/currentUser";
import { useRubricStore, type RubricWeights } from "@/store/rubricStore";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export default function Settings() {
  const navigate = useNavigate();
  const rubric = useRubricStore((s) => s.rubric);
  const weights = useRubricStore((s) => s.weights);
  const version = useRubricStore((s) => s.version);
  const history = useRubricStore((s) => s.history);
  const applyEdits = useRubricStore((s) => s.applyEdits);
  const addDimension = useRubricStore((s) => s.addDimension);
  const resetToDefault = useRubricStore((s) => s.resetToDefault);
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);

  // Local editable draft. Committed only after confirmation.
  const [draft, setDraft] = useState<RubricDimension[]>(() => clone(rubric));
  const [draftWeights, setDraftWeights] = useState<RubricWeights>(() => ({ ...weights }));
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [pageUnlocked, setPageUnlocked] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(rubric) || JSON.stringify(draftWeights) !== JSON.stringify(weights),
    [draft, draftWeights, rubric, weights],
  );

  const patchDim = (key: string, patch: Partial<RubricDimension>) =>
    setDraft((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const patchReason = (key: string, score: number, text: string) =>
    setDraft((prev) =>
      prev.map((d) =>
        d.key === key ? { ...d, reasons: d.reasons.map((r) => (r.score === score ? { ...r, text } : r)) } : d,
      ),
    );

  const toggleLock = (key: string) => setUnlocked((u) => ({ ...u, [key]: !u[key] }));

  const resyncFromStore = () => {
    setDraft(clone(useRubricStore.getState().rubric));
    setDraftWeights({ ...useRubricStore.getState().weights });
    setUnlocked({});
  };

  const commit = () => {
    applyEdits({ rubric: draft, weights: draftWeights }, currentEmail, "Edited scoring rubric in Settings");
    setUnlocked({});
    setConfirmOpen(false);
  };

  const doReset = () => {
    resetToDefault(currentEmail);
    resyncFromStore();
    setPageUnlocked(false);
  };

  const sqsDims = draft.filter((d) => d.group === "SQS");
  const uefDims = draft.filter((d) => d.group === "UEF");

  const wSum = draftWeights.sqsWeight + draftWeights.uefWeight || 1;

  return (
    <Layout>
      <PageHeader
        title="New Rule Settings"
        subtitle="Editable scoring rubric · North Star weights · config version history · changes apply to Annotation immediately"
        actions={<Button onClick={() => navigate("/home")}>Back to Home</Button>}
      />

      <div className="space-y-6 p-6">
        {/* Demo-only note */}
        <div className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand-light px-4 py-3 text-sm text-brand">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>Demo-only</b>（不属于 Phase 1 承诺范围）. This page previews the New Rule configuration surface; it is a
            demonstration of the future scoring editor and is not part of the Phase 1 delivery scope.
          </span>
        </div>

        {/* Unlock affordance + protection note */}
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-warning/30 bg-warning-light px-4 py-3 text-sm text-[#B45309]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Editing is locked by default to prevent accidental changes. You can <b>add</b> new dimensions and
              enable/disable existing ones, but built-in dimensions cannot be removed (add-only policy). Confirm before
              applying — the new rubric version takes effect in Annotation right away.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPageUnlocked((v) => {
                if (v) setUnlocked({});
                return !v;
              });
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
              pageUnlocked ? "border-brand bg-white text-brand" : "border-line bg-white text-subtle hover:text-ink"
            }`}
          >
            {pageUnlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {pageUnlocked ? "Editing unlocked" : "Unlock to edit"}
          </button>
        </div>

        {/* North Star weights */}
        <section className="rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-brand" />
              <div>
                <h2 className="text-sm font-semibold">User Experience Score (UXS · North Star) Weights</h2>
                <p className="text-xs text-subtle">
                  User Experience Score = w(SQS)·SQS + w(UEF)·UEF (normalized)
                </p>
              </div>
            </div>
            <Badge tone="neutral">Rubric v{version}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
            <WeightField
              label="SQS Weight"
              value={draftWeights.sqsWeight}
              norm={draftWeights.sqsWeight / wSum}
              disabled={!pageUnlocked}
              onChange={(v) => setDraftWeights((w) => ({ ...w, sqsWeight: v }))}
            />
            <WeightField
              label="UEF Weight"
              value={draftWeights.uefWeight}
              norm={draftWeights.uefWeight / wSum}
              disabled={!pageUnlocked}
              onChange={(v) => setDraftWeights((w) => ({ ...w, uefWeight: v }))}
            />
          </div>
          <div className="border-t border-line px-5 py-3 font-mono text-xs text-subtle">
            User Experience Score = {(draftWeights.sqsWeight / wSum).toFixed(2)}·SQS +{" "}
            {(draftWeights.uefWeight / wSum).toFixed(2)}·UEF
          </div>
        </section>

        {/* SQS dimensions */}
        <RubricSection
          title="SQS · Service Quality (6 dimensions)"
          group="SQS"
          dims={sqsDims}
          pageUnlocked={pageUnlocked}
          unlocked={unlocked}
          onToggleLock={toggleLock}
          onPatchDim={patchDim}
          onPatchReason={patchReason}
        />

        {/* UEF dimensions */}
        <RubricSection
          title="UEF · User Expectation Fulfillment"
          group="UEF"
          dims={uefDims}
          pageUnlocked={pageUnlocked}
          unlocked={unlocked}
          onToggleLock={toggleLock}
          onPatchDim={patchDim}
          onPatchReason={patchReason}
        />

        {/* Add dimension / reset */}
        <div className="flex items-center gap-3">
          <Button icon={Plus} onClick={() => setAddOpen(true)}>
            Add Dimension
          </Button>
          <Button variant="ghost" icon={RotateCcw} onClick={doReset}>
            Reset to Default
          </Button>
        </div>

        {/* Config version / effective time */}
        <section className="rounded-xl border border-line bg-white">
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <History className="h-5 w-5 text-brand" />
            <h2 className="text-sm font-semibold">Config Version / Effective Time</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-subtle">Current Version</p>
              <p className="mt-1 font-mono text-sm font-semibold text-ink">v{version}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-subtle">Effective From</p>
              <p className="mt-1 text-sm text-ink">
                {history.length > 0 ? history[history.length - 1].at : "—"}
              </p>
            </div>
          </div>
          <div className="border-t border-line px-5 py-3">
            <p className="mb-2 text-xs font-medium text-subtle">Version history (newest first)</p>
            <ul className="space-y-1">
              {history
                .slice()
                .reverse()
                .map((h) => (
                  <li key={h.version} className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                    <Badge tone="neutral">v{h.version}</Badge>
                    <span className="text-muted">{h.at}</span>
                    <span>· {h.operator}</span>
                    <span className="text-ink">· {h.note}</span>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-line bg-white px-6 py-3 shadow-lg">
          <span className="text-sm text-[#B45309]">You have unsaved rubric changes.</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(clone(rubric));
                setDraftWeights({ ...weights });
                setUnlocked({});
              }}
            >
              Discard
            </Button>
            <Button variant="primary" onClick={() => setConfirmOpen(true)}>
              Apply Changes
            </Button>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <h3 className="text-base font-semibold text-ink">Publish a new rubric version?</h3>
            </div>
            <p className="text-sm text-subtle">
              This will publish rubric <b>v{version + 1}</b> and apply it to the Annotation page immediately. Existing
              submitted scores keep their own version snapshot and are not changed.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-md border border-line px-4 py-2 text-sm text-subtle hover:bg-page"
              >
                Cancel
              </button>
              <button
                onClick={commit}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Confirm &amp; Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <AddDimensionModal
          onClose={() => setAddOpen(false)}
          onAdd={(input) => {
            addDimension(input, currentEmail);
            resyncFromStore();
            setAddOpen(false);
          }}
        />
      )}
    </Layout>
  );
}

function WeightField({
  label,
  value,
  norm,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  norm: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="font-mono text-xs text-brand">normalized {(norm * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      />
      <div className="mt-1 flex items-center justify-end gap-2">
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-20 rounded-md border border-line px-2 py-1 text-right font-mono text-xs text-subtle outline-none focus:border-brand ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          }`}
        />
      </div>
    </div>
  );
}

function RubricSection({
  title,
  group,
  dims,
  pageUnlocked,
  unlocked,
  onToggleLock,
  onPatchDim,
  onPatchReason,
}: {
  title: string;
  group: RubricGroup;
  dims: RubricDimension[];
  pageUnlocked: boolean;
  unlocked: Record<string, boolean>;
  onToggleLock: (key: string) => void;
  onPatchDim: (key: string, patch: Partial<RubricDimension>) => void;
  onPatchReason: (key: string, score: number, text: string) => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <MessageSquareText className="h-5 w-5 text-brand" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="divide-y divide-line">
        {dims.map((d) => {
          const isUnlocked = pageUnlocked && Boolean(unlocked[d.key]);
          return (
            <div key={d.key} className="px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Badge tone={group === "SQS" ? "brand" : "success"}>{group}</Badge>
                {isUnlocked ? (
                  <input
                    value={d.dimension}
                    onChange={(e) => onPatchDim(d.key, { dimension: e.target.value })}
                    className="rounded-md border border-brand/40 px-2 py-1 text-sm font-medium text-ink outline-none focus:border-brand"
                  />
                ) : (
                  <span className="text-sm font-medium">{d.dimension}</span>
                )}
                {d.auto && <Badge tone="neutral">Auto</Badge>}
                {d.builtin ? <Badge tone="neutral">Built-in</Badge> : <Badge tone="neutral">Custom</Badge>}
                <span className="font-mono text-xs text-muted">options [{d.options.join(", ")}]</span>

                <div className="ml-auto flex items-center gap-3">
                  {/* Enable / disable toggle */}
                  <button
                    type="button"
                    onClick={() => onPatchDim(d.key, { enabled: !d.enabled })}
                    disabled={!pageUnlocked}
                    title={pageUnlocked ? "Enable / disable this dimension" : "Unlock to edit first"}
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      d.enabled ? "bg-brand" : "bg-gray-300"
                    } ${!pageUnlocked ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                        d.enabled ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>
                  <span className="w-12 text-xs text-subtle">{d.enabled ? "Enabled" : "Disabled"}</span>

                  {/* Per-dimension lock */}
                  <button
                    type="button"
                    onClick={() => onToggleLock(d.key)}
                    disabled={!pageUnlocked}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                      isUnlocked ? "border-brand text-brand" : "border-line text-subtle hover:text-ink"
                    } ${!pageUnlocked ? "cursor-not-allowed opacity-50" : ""}`}
                    title={pageUnlocked ? (isUnlocked ? "Lock to protect" : "Unlock to edit") : "Unlock the page first"}
                  >
                    {isUnlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {isUnlocked ? "Unlocked" : "Locked"}
                  </button>
                </div>
              </div>

              <ul className="space-y-1.5">
                {d.reasons.map((r) => (
                  <li
                    key={r.score}
                    className="flex items-start gap-2 rounded-md border border-line bg-page px-3 py-1.5 text-sm text-subtle"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-xs font-semibold text-brand ring-1 ring-brand/30">
                      {r.score}
                    </span>
                    {isUnlocked ? (
                      <textarea
                        value={r.text}
                        onChange={(e) => onPatchReason(d.key, r.score, e.target.value)}
                        rows={2}
                        className="w-full resize-none rounded-md border border-brand/30 bg-white px-2 py-1 text-sm text-ink outline-none focus:border-brand"
                      />
                    ) : (
                      <span>{r.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddDimensionModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (input: { dimension: string; group: RubricGroup; options: number[]; reasons: ReasonOption[] }) => void;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<RubricGroup>("SQS");
  const [optionsText, setOptionsText] = useState("3, 2, 1, 0");
  const [reasonMap, setReasonMap] = useState<Record<number, string>>({});

  const options = optionsText
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));

  const valid = name.trim().length > 0 && options.length >= 2;

  const create = () => {
    onAdd({
      dimension: name.trim(),
      group,
      options,
      reasons: options.map((score) => ({
        score,
        text: reasonMap[score]?.trim() || `Score ${score}: describe when this applies.`,
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-line bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-semibold text-ink">Add Dimension</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-subtle">Dimension name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Proactivity"
              className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-subtle">Group</label>
            <div className="inline-flex rounded-lg border border-line p-1">
              {(["SQS", "UEF"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={`rounded-md px-4 py-1 text-sm ${group === g ? "bg-brand text-white" : "text-subtle"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-subtle">Allowed scores (high → low)</label>
            <input
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 font-mono text-sm outline-none focus:border-brand"
            />
          </div>
          {options.length >= 2 && (
            <div>
              <label className="mb-1 block text-xs text-subtle">Reason templates (optional)</label>
              <div className="space-y-1.5">
                {options.map((score) => (
                  <div key={score} className="flex items-start gap-2">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-xs font-semibold text-brand ring-1 ring-brand/30">
                      {score}
                    </span>
                    <textarea
                      value={reasonMap[score] ?? ""}
                      onChange={(e) => setReasonMap((m) => ({ ...m, [score]: e.target.value }))}
                      rows={2}
                      placeholder={`Score ${score}: describe when this applies.`}
                      className="w-full resize-none rounded-md border border-line px-2 py-1 text-sm text-ink outline-none focus:border-brand"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-line px-4 py-2 text-sm text-subtle hover:bg-page">
            Cancel
          </button>
          <button
            onClick={create}
            disabled={!valid}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Add &amp; Publish
          </button>
        </div>
      </div>
    </div>
  );
}
