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

/** True when double-blind A and B disagree on any dimension score. */
export function hasABDiff(flow: ReviewFlow): boolean {
  if (!flow.backToBackEnabled) return false;
  if (!flow.aResult?.bot || !flow.bResult?.bot) return false;
  return diffDims(flow.aResult.bot, flow.bResult.bot).size > 0;
}

/** The baseline C is compared against: B in double-blind (once B submitted), else A. */
export function cBaseline(flow: ReviewFlow): ActorScore | undefined {
  const isDouble = flow.bResultStatus === "Submitted";
  return isDouble ? flow.bResult?.bot ?? flow.aResult?.bot : flow.aResult?.bot;
}

/** True when C's final result differs from its baseline (A, or A/B) on any dim. */
export function hasCDiff(flow: ReviewFlow): boolean {
  if (!flow.cResult?.bot) return false;
  const base = cBaseline(flow);
  if (!base) return false;
  return diffDims(base, flow.cResult.bot).size > 0;
}
