/**
 * Content Library pull-through.
 *
 * Ranks Drive assets, saved snippets and answers from previous submissions
 * against a discovery candidate so the team can attach reusable source
 * material (prior applications, executive bios, boilerplate, metrics) before
 * the opportunity ever enters the program.
 *
 * Scoring is deterministic keyword overlap — no model call — so the panel is
 * instant and the same candidate always produces the same shortlist.
 */

const STOP = new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "and",
  "in",
  "on",
  "to",
  "s",
  "is",
  "are",
  "with",
  "by",
  "at",
  "from",
  "that",
  "this",
  "it",
  "as",
  "be",
  "or",
  "our",
  "we",
  "their",
  "its",
  "new",
  "2025",
  "2026",
  "2027",
]);

function tokenize(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export type MatchKind = "proof_point" | "asset" | "snippet" | "submission_field";

export type AttachedContent = {
  kind: MatchKind;
  id: string;
  title: string;
  subtitle?: string | null;
  url?: string | null;
};

export type ContentMatch = AttachedContent & {
  /** 0–1 relevance against the candidate. */
  score: number;
  category: string;
  preview: string;
  reasons: string[];
};

export type MatchSubject = {
  name: string;
  description?: string | null;
  organizer?: string | null;
  region?: string | null;
  type?: string | null;
  categories?: string[] | null;
  rationale?: string | null;
};

export type MatchInputs = {
  assets: {
    id: string;
    name: string;
    category: string;
    summary: string | null;
    extracted_text: string | null;
    tags: string[] | null;
    web_view_link: string | null;
  }[];
  snippets: {
    id: string;
    title: string;
    body: string;
    category: string;
    tags: string[] | null;
  }[];
  proofPoints: {
    id: string;
    title: string;
    kind: string;
    content: string;
    theme: string | null;
    executive_name: string | null;
    tags: string[] | null;
  }[];
  submissionFields: {
    id: string;
    prompt: string;
    answer: string;
    submissionTitle: string;
    opportunityName: string | null;
    opportunityType: string | null;
    submissionId: string;
  }[];
};

function overlap(subject: Set<string>, candidate: string[]): { score: number; hits: string[] } {
  if (!subject.size || !candidate.length) return { score: 0, hits: [] };
  const seen = new Set<string>();
  for (const t of candidate) if (subject.has(t)) seen.add(t);
  // Normalize against the subject so short bios aren't unfairly penalized.
  return { score: seen.size / Math.max(4, subject.size), hits: [...seen].slice(0, 6) };
}

function clamp(n: number) {
  return Math.max(0, Math.min(1, n));
}

function truncate(text: string, len = 220) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > len ? `${t.slice(0, len)}…` : t;
}

/**
 * Ranked reusable material for a candidate. Executive bios always get a floor
 * score so at least one speaker bio surfaces for speaking opportunities.
 */
export function matchContent(
  subject: MatchSubject,
  inputs: MatchInputs,
  limit = 12,
): ContentMatch[] {
  const subjectTokens = new Set(
    [
      ...tokenize(subject.name),
      ...tokenize(subject.description),
      ...tokenize(subject.organizer),
      ...tokenize(subject.rationale),
      ...(subject.categories ?? []).flatMap(tokenize),
    ].filter(Boolean),
  );
  const isSpeaking = subject.type === "speaking" || subject.type === "conference";

  const out: ContentMatch[] = [];

  // Approved bank entries are canonical current fact, so they carry a floor
  // score and outrank historical submission language on equal overlap.
  for (const p of inputs.proofPoints ?? []) {
    const { score, hits } = overlap(
      subjectTokens,
      tokenize([p.title, p.content, p.theme, p.executive_name, ...(p.tags ?? [])].join(" ")),
    );
    const reasons = ["Approved Proof Point Bank entry"];
    let boosted = score + 0.35;
    if (isSpeaking && (p.kind === "executive_bio" || p.kind === "leadership_example")) {
      boosted += 0.2;
      reasons.push("Executive material for a speaking opportunity");
    }
    if (p.kind === "growth_metric" || p.kind === "business_metric") {
      boosted += 0.1;
      reasons.push("Verified metric");
    }
    if (p.theme) reasons.push(`Theme: ${p.theme}`);
    if (hits.length) reasons.push(`Matches ${hits.slice(0, 3).join(", ")}`);
    out.push({
      kind: "proof_point",
      id: p.id,
      title: p.title,
      subtitle: p.executive_name ?? p.theme ?? null,
      url: null,
      score: clamp(boosted),
      category: p.kind,
      preview: truncate(p.content),
      reasons,
    });
  }

  for (const a of inputs.assets) {
    const text = [a.name, a.summary, a.extracted_text, ...(a.tags ?? [])].filter(Boolean).join(" ");
    const { score, hits } = overlap(subjectTokens, tokenize(text));
    const reasons: string[] = [];
    let boosted = score;
    // A file whose *name* names this program (e.g. a prior Fast Company draft)
    // is the single most useful thing to surface, even when its body text has
    // not been indexed yet — so score the filename on its own terms.
    const titleTokens = tokenize(a.name);
    const titleHits = titleTokens.filter((t) => subjectTokens.has(t));
    if (titleHits.length) {
      const titleScore = titleHits.length / Math.max(3, titleTokens.length);
      boosted += titleScore * 0.7;
      if (titleScore >= 0.3) reasons.push("Filename matches this program");
    }
    if (a.category === "prior_application") {
      boosted += 0.2;
      reasons.push("Previous application");
    }
    if (a.category === "bio") {
      boosted += isSpeaking ? 0.3 : 0.15;
      reasons.push("Executive bio");
    }
    if (a.category === "boilerplate" || a.category === "metrics") {
      boosted += 0.1;
      reasons.push(a.category === "metrics" ? "Proof points" : "Approved boilerplate");
    }
    if (hits.length) reasons.push(`Matches ${hits.slice(0, 3).join(", ")}`);
    if (boosted <= 0) continue;
    out.push({
      kind: "asset",
      id: a.id,
      title: a.name,
      subtitle: a.category === "bio" ? "Executive bio" : null,
      url: a.web_view_link,
      score: clamp(boosted),
      category: a.category,
      preview: truncate(a.summary ?? a.extracted_text ?? "No summary indexed yet."),
      reasons,
    });
  }

  for (const s of inputs.snippets) {
    const { score, hits } = overlap(
      subjectTokens,
      tokenize([s.title, s.body, ...(s.tags ?? [])].join(" ")),
    );
    let boosted = score;
    const reasons: string[] = ["Saved snippet"];
    if (s.category === "bio") boosted += isSpeaking ? 0.25 : 0.1;
    if (s.category === "boilerplate") boosted += 0.1;
    if (hits.length) reasons.push(`Matches ${hits.slice(0, 3).join(", ")}`);
    if (boosted <= 0) continue;
    out.push({
      kind: "snippet",
      id: s.id,
      title: s.title,
      subtitle: null,
      url: null,
      score: clamp(boosted),
      category: s.category,
      preview: truncate(s.body),
      reasons,
    });
  }

  for (const f of inputs.submissionFields) {
    const { score, hits } = overlap(
      subjectTokens,
      tokenize([f.prompt, f.answer, f.opportunityName].filter(Boolean).join(" ")),
    );
    let boosted = score + 0.15;
    const reasons = [`From “${f.opportunityName ?? f.submissionTitle}”`];
    if (f.opportunityType && subject.type && f.opportunityType === subject.type) {
      boosted += 0.1;
      reasons.push("Same opportunity type");
    }
    if (hits.length) reasons.push(`Matches ${hits.slice(0, 3).join(", ")}`);
    out.push({
      kind: "submission_field",
      id: f.id,
      title: truncate(f.prompt, 90),
      subtitle: f.submissionTitle,
      url: null,
      score: clamp(boosted),
      category: "prior_application",
      preview: truncate(f.answer),
      reasons,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Provenance block appended to the new opportunity's notes on promotion. */
export function attachmentNote(items: AttachedContent[]): string | null {
  if (!items.length) return null;
  const label: Record<MatchKind, string> = {
    proof_point: "Proof Point Bank",
    asset: "Drive asset",
    snippet: "Snippet",
    submission_field: "Prior submission answer",
  };
  return [
    "Reusable source material attached from the Content Library:",
    ...items.map(
      (i) =>
        `• [${label[i.kind]}] ${i.title}${i.subtitle ? ` — ${i.subtitle}` : ""}${i.url ? ` (${i.url})` : ""}`,
    ),
  ].join("\n");
}
