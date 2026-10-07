/**
 * Submission Strategy Brief.
 *
 * Shapes and provenance rules for the analysis produced when a submission is
 * started. Every recommendation points at an indexed source (a Drive file, a
 * saved snippet, or an answer from a previous submission) so the team can tell
 * approved source material apart from an AI recommendation, and so dated or
 * numerical claims can be flagged for re-verification before they are reused.
 */

export type BriefSource = {
  /** Stable citation label used by the model, e.g. "S3". */
  ref: string;
  kind: "proof_point" | "asset" | "snippet" | "submission_field";
  id: string;
  title: string;
  subtitle: string | null;
  category: string;
  /** Drive web view link when the source is a Drive file. */
  url: string | null;
  /** ISO date the source material was last updated in the library. */
  sourceDate: string | null;
  preview: string;
  score: number;
  reasons: string[];
};

export type EvidenceItem = {
  claim: string;
  refs: string[];
  needs_verification?: boolean;
  note?: string;
};

export type ReusableItem = {
  passage: string;
  refs: string[];
  how_to_use: string;
};

export type ProofPoint = {
  point: string;
  refs: string[];
  as_of?: string;
  needs_verification?: boolean;
};

export type JudgeSignal = {
  signal: string;
  stands_out: string;
};

export type GapItem = {
  requirement: string;
  why: string;
  needed_from?: string;
};

export type MatchItem = {
  refs: string[];
  why: string;
  criteria_similarity?: number;
};

export type BriefContent = {
  pursue: { verdict: string; rationale: string };
  narrative: { headline: string; summary: string };
  best_matches: MatchItem[];
  reusable: ReusableItem[];
  proof_points: ProofPoint[];
  judge_signals: JudgeSignal[];
  gaps: GapItem[];
  evidence: EvidenceItem[];
  weaknesses: string[];
};

export type StrategyBrief = {
  id: string;
  submission_id: string;
  opportunity_id: string | null;
  model: string | null;
  brief: BriefContent;
  sources: BriefSource[];
  created_at: string;
  updated_at: string;
};

/** Numbers, currency, percentages and years read as claims that age. */
const NUMERIC =
  /(\$\s?\d|\d+(\.\d+)?\s?%|\b\d{1,3}(,\d{3})+\b|\b\d{4}\b|\b\d+(\.\d+)?\s?(x|m|k|bn|million|billion|patients|members|lives|customers|clients|states)\b)/i;

export function looksNumeric(text: string): boolean {
  return NUMERIC.test(text);
}

const STALE_MONTHS = 12;

export function monthsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60 * 24 * 30.44);
}

export function isStale(iso: string | null | undefined): boolean {
  const m = monthsSince(iso);
  return m !== null && m > STALE_MONTHS;
}

/**
 * Deterministic re-verification rule, applied on top of whatever the model
 * flags: a claim that contains a figure or a year, or that leans on source
 * material older than a year, must be checked by a human before it is reused.
 */
export function needsVerification(
  text: string,
  refs: string[],
  sources: BriefSource[],
  modelFlag?: boolean,
): boolean {
  if (modelFlag) return true;
  if (looksNumeric(text)) return true;
  return refs.some((r) => isStale(sources.find((s) => s.ref === r)?.sourceDate));
}

export function sourceOf(refs: string[] | undefined, sources: BriefSource[]): BriefSource[] {
  return (refs ?? [])
    .map((r) => sources.find((s) => s.ref === r))
    .filter((s): s is BriefSource => Boolean(s));
}

export const SOURCE_KIND_LABEL: Record<BriefSource["kind"], string> = {
  proof_point: "Proof Point Bank",
  asset: "Drive file",
  snippet: "Approved snippet",
  submission_field: "Previous submission",
};
