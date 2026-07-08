import type { ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import ScoreButtons from "@/components/ScoreButtons";
import type { ReasonOption } from "@/mock/settings";

export function PanelSection({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-4 last:border-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function ScoreRow({
  label,
  hint,
  options,
  value,
  onChange,
  disabled,
  reason,
  onReasonChange,
  reasonOptions: reasonOptionsProp,
}: {
  label: string;
  hint?: string;
  options: number[];
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
  reasonOptions?: ReasonOption[];
}) {
  // Reasoning is not free text: annotators pick a standard reason defined in Settings
  // for this dimension. Options are filtered to the scores valid for this row.
  const reasonOptions = (reasonOptionsProp ?? []).filter((r) => options.includes(r.score));

  return (
    <div className="mb-4 rounded-lg border border-line p-3 last:mb-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          {hint && <p className="text-xs text-subtle">{hint}</p>}
        </div>
        {/* When standard reasons exist, picking a reason already sets the score,
            so the standalone 3/2/1/0 buttons are redundant and hidden. */}
        {reasonOptions.length === 0 && (
          <ScoreButtons options={options} value={value} onChange={onChange} disabled={disabled} />
        )}
      </div>

      {reasonOptions.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Standard reason (from Settings)
          </p>
          {reasonOptions.map((r) => {
            const selected = reason === r.text;
            const matchesScore = value === r.score;
            return (
              <button
                key={r.score}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (selected) {
                    onReasonChange("");
                  } else {
                    onChange(r.score);
                    onReasonChange(r.text);
                  }
                }}
                className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-brand bg-brand-light text-ink"
                    : matchesScore
                    ? "border-brand/40 bg-white text-subtle hover:border-brand"
                    : "border-line bg-white text-subtle hover:border-brand/50"
                }`}
              >
                <span
                  className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1 ${
                    selected ? "bg-brand text-white ring-brand" : "text-muted ring-line"
                  }`}
                >
                  {selected ? <Check className="h-3 w-3" /> : <span className="font-mono text-[10px]">{r.score}</span>}
                </span>
                <span>{r.text}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-subtle">No standard reason configured for this dimension.</p>
      )}
    </div>
  );
}

export function Collapsible({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
      >
        {title}
        <ChevronDown className={`h-4 w-4 text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
