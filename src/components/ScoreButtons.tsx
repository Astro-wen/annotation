import { cn } from "@/lib/utils";

interface ScoreButtonsProps {
  /** allowed scores, e.g. [3,2,1,0] or [3,1,0] */
  options: number[];
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function toneFor(score: number, active: boolean): string {
  if (!active) return "bg-white text-subtle border-line hover:border-brand/50";
  if (score >= 3) return "bg-success text-white border-success";
  if (score === 2) return "bg-brand text-white border-brand";
  if (score === 1) return "bg-warning text-white border-warning";
  return "bg-danger text-white border-danger";
}

export default function ScoreButtons({
  options,
  value,
  onChange,
  disabled,
}: ScoreButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      {options.map((score) => {
        const active = value === score;
        return (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onChange(score)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold transition-all",
              toneFor(score, active),
              disabled && "cursor-not-allowed opacity-50 hover:border-line",
            )}
          >
            {score}
          </button>
        );
      })}
    </div>
  );
}
