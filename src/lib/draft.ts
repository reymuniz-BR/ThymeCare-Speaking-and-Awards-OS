/**
 * AI-assisted answer drafting.
 *
 * Shapes shared by the drafting server function and the workspace UI. A draft
 * is always accompanied by the source material it was built from, the facts a
 * human has to verify, and an optional alternate angle. Every saved edit
 * becomes a version so the answer that is finally submitted can be marked
 * reusable and fed back into the Content Library for future applications.
 */

import type { BriefSource } from "@/lib/strategy";

export type DraftSourceUse = {
  ref: string;
  how_used: string;
};

export type DraftVerification = {
  claim: string;
  refs: string[];
  why: string;
};

export type DraftResult = {
  draft: string;
  alternate: { angle: string; draft: string } | null;
  sources_used: DraftSourceUse[];
  verifications: DraftVerification[];
  gaps: string[];
  /** Ranked shortlist the draft was allowed to draw on. */
  sources: BriefSource[];
  model: string;
};

export type AnswerVersion = {
  id: string;
  field_id: string;
  submission_id: string;
  version: number;
  answer: string;
  word_count: number;
  char_count: number;
  origin: "ai" | "human";
  model: string | null;
  sources: BriefSource[];
  verifications: DraftVerification[];
  alternate: { angle: string; draft: string } | null;
  note: string | null;
  is_final: boolean;
  reusable: boolean;
  created_at: string;
};

export function charCount(text: string): number {
  return text.length;
}

export type LimitState = {
  words: number;
  chars: number;
  wordLimit: number | null;
  charLimit: number | null;
  overWords: boolean;
  overChars: boolean;
};

export function limitState(
  text: string,
  words: number,
  wordLimit: number | null,
  charLimit: number | null,
): LimitState {
  const chars = charCount(text);
  return {
    words,
    chars,
    wordLimit,
    charLimit,
    overWords: wordLimit !== null && words > wordLimit,
    overChars: charLimit !== null && chars > charLimit,
  };
}
