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
 * The specific round a given person submitted on this case (their own A or B
 * result), so per-annotator accuracy audits THAT person's work — not the case's
 * agreed/defined result. In double-blind, A and B are two independent rounds by
 * two different people; auditing "A" must compare A's own submission (not B's).
 * Returns undefined when the person didn't submit an audited round here (e.g.
 * they were only the C reviewer, whose result IS the baseline).
 */
export function annotatorRound(flow: ReviewFlow, email: string): ActorScore | undefined {
  const aWho = flow.aAnnotator ?? flow.aAssignee;
  const bWho = flow.bAnnotator ?? flow.bAssignee;
  if (bWho === email && flow.bResultStatus === "Submitted") return flow.bResult?.bot;
  if (aWho === email && flow.aResultStatus === "Submitted") return flow.aResult?.bot;
  return undefined;
}

/**
 * Per-case QC accuracy: share of dimensions where C agrees with the audited
 * baseline (A, or B in double-blind). Each shared dimension is equal-weighted
 * (match = 100%, mismatch = 0%). Returns null when it can't be computed.
 *
 * When `baseOverride` is given (e.g. a specific annotator's own round from
 * annotatorRound), C is compared against that instead of cBaseline — this is
 * how per-annotator accuracy audits each person's own submission rather than
 * the case's agreed result.
 */
export function caseAccuracy(flow: ReviewFlow, baseOverride?: ActorScore): number | null {
  const c = flow.cResult?.bot?.scores;
  const base = (baseOverride ?? cBaseline(flow))?.scores;
  if (!c || !base) return null;
  const keys = Object.keys(c).filter((k) => base[k] !== undefined);
  if (keys.length === 0) return null;
  const matched = keys.filter((k) => c[k] === base[k]).length;
  return (matched / keys.length) * 100;
}

/**
 * Whether a case counts as correct under the all-correct rule used by every
 * aggregate accuracy (case set, per-annotator, per-tag): a case is correct only
 * when every compared dimension matches the audited baseline. A single mismatch
 * makes the whole case wrong. Returns null when it can't be computed (no C
 * result / no baseline / no shared dimension), so the case is excluded from the
 * denominator.
 */
export function caseFullyCorrect(flow: ReviewFlow, baseOverride?: ActorScore): boolean | null {
  const acc = caseAccuracy(flow, baseOverride);
  if (acc === null) return null;
  return acc === 100;
}

/**
 * Aggregate accuracy under the all-correct rule: fully-correct cases divided by
 * QC'd cases. This is the only correct way to roll up accuracy across a case
 * set, an annotator or a tag. Never average the per-case dimension percentages
 * (that would run high). Returns null when nothing is QC'd yet.
 *
 * When `annotator` is given, this is that person's accuracy: each case is
 * scored against THAT person's own submitted round (annotatorRound), and cases
 * where they didn't submit an audited round (e.g. they were only the blind
 * partner or the C reviewer on that case) are excluded from the denominator.
 * This keeps A's number about A's work even though filtering by A also surfaces
 * A's blind partner B in the list.
 */
export function aggregateAccuracy(flows: ReviewFlow[], annotator?: string): number | null {
  const scored = flows
    .map((f) => {
      if (annotator) {
        const round = annotatorRound(f, annotator);
        if (!round) return null; // person didn't submit an audited round here
        return caseFullyCorrect(f, round);
      }
      return caseFullyCorrect(f);
    })
    .filter((v): v is boolean => v !== null);
  if (scored.length === 0) return null;
  const correct = scored.filter(Boolean).length;
  return (correct / scored.length) * 100;
}
