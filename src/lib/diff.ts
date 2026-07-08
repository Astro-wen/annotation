import type { ActorScore, ReviewFlow } from "@/mock/types";

/** dimension keys where two actor score maps disagree. */
export function diffDims(a?: ActorScore, b?: ActorScore): Set<string> {
  const out = new Set<string>();
  const as = a?.scores ?? {};
  const bs = b?.scores ?? {};
  const keys = new Set([...Object.keys(as), ...Object.keys(bs)]);
  for (const k of keys) if (as[k] !== bs[k]) out.add(k);
  return out;
}

/**
 * The baseline C is compared against. By the time a case reaches QC, A and B
 * are always one agreed result (blind diffs are reconciled and open review
 * overwrites A), so A === B — reading B when present, else A, is equivalent.
 * Normal (single-review) uses A.
 */
export function cBaseline(flow: ReviewFlow): ActorScore | undefined {
  const isDouble = flow.bResultStatus === "Submitted";
  return isDouble ? flow.bResult?.bot ?? flow.aResult?.bot : flow.aResult?.bot;
}

/**
 * Per-case QC accuracy: share of dimensions where C agrees with the audited
 * baseline (A, or B in double-blind). Each shared dimension is equal-weighted
 * (match = 100%, mismatch = 0%). Returns null when it can't be computed.
 */
export function caseAccuracy(flow: ReviewFlow): number | null {
  const c = flow.cResult?.bot?.scores;
  const base = cBaseline(flow)?.scores;
  if (!c || !base) return null;
  const keys = Object.keys(c).filter((k) => base[k] !== undefined);
  if (keys.length === 0) return null;
  const matched = keys.filter((k) => c[k] === base[k]).length;
  return (matched / keys.length) * 100;
}
