import { cn } from "@/lib/utils";

type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

const toneClasses: Record<Tone, string> = {
  brand: "bg-brand-light text-brand border border-brand/20",
  success: "bg-success-light text-success border border-success/20",
  warning: "bg-warning-light text-[#B45309] border border-warning/30",
  danger: "bg-danger-light text-danger border border-danger/20",
  neutral: "bg-gray-100 text-subtle border border-line",
};

export default function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (s.includes("invalid")) return "neutral";
  if (s.includes("diff") || s.includes("待拉齐")) return "danger";
  if (s.includes("qc completed")) return "success";
  if (s.includes("waiting for qc")) return "warning";
  if (s.includes("submitted")) return "success";
  if (s.includes("assigned")) return "brand";
  return "neutral";
}
