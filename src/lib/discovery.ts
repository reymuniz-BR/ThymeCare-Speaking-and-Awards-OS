/**
 * Duplicate detection for discovered opportunities.
 *
 * Candidates are compared against the existing Opportunities database on three
 * axes — normalized name, registrable domain and approximate title similarity —
 * so near-identical programs ("Fast Company's Most Innovative Companies 2027"
 * vs "Fast Company Most Innovative Companies") never reach the inbox twice.
 */

const STOP_WORDS = new Set([
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
  "annual",
  "award",
  "awards",
  "conference",
  "summit",
  "program",
  "programme",
  "list",
  "lists",
  "series",
  "event",
]);

/** Lowercase, strip punctuation, years and ordinal prefixes. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\u2018\u2019']/g, "")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b\d{1,3}(st|nd|rd|th)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Registrable-ish host for a URL, e.g. "fastcompany.com". */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
    const parts = host.replace(/^www\./, "").split(".");
    return parts.length > 2 ? parts.slice(-2).join(".") : parts.join(".");
  } catch {
    return null;
  }
}

/** Token overlap (Jaccard) between two titles, 0–1. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

export type ExistingRecord = {
  id: string;
  name: string;
  url?: string | null;
  application_url?: string | null;
  organizer?: string | null;
};

export type DuplicateMatch = {
  id: string;
  name: string;
  /** 0–1 confidence that the candidate is the same program. */
  score: number;
  reason: string;
};

/**
 * Best duplicate match for a candidate, or null when nothing is close.
 * `score >= 0.85` should be treated as a confirmed duplicate and suppressed;
 * anything above 0.6 is worth flagging for a human.
 */
export function findDuplicate(
  candidate: { name: string; source_url?: string | null; application_url?: string | null },
  existing: ExistingRecord[],
): DuplicateMatch | null {
  const candName = normalizeName(candidate.name);
  const candDomains = new Set(
    [domainOf(candidate.source_url), domainOf(candidate.application_url)].filter((d): d is string =>
      Boolean(d),
    ),
  );

  let best: DuplicateMatch | null = null;
  for (const row of existing) {
    const rowName = normalizeName(row.name);
    const sim = titleSimilarity(candidate.name, row.name);
    const sameDomain =
      candDomains.size > 0 &&
      [domainOf(row.url), domainOf(row.application_url)].some((d) => d && candDomains.has(d));

    let score = 0;
    let reason = "";
    if (rowName && rowName === candName) {
      score = 1;
      reason = "Identical name after normalization";
    } else if (sameDomain && sim >= 0.4) {
      score = 0.9;
      reason = "Same organizer domain and similar name";
    } else if (sim >= 0.75) {
      score = sim;
      reason = `Approximate title match (${Math.round(sim * 100)}%)`;
    } else if (sameDomain) {
      score = 0.65;
      reason = "Same organizer domain";
    } else if (sim >= 0.6) {
      score = sim;
      reason = `Similar title (${Math.round(sim * 100)}%)`;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { id: row.id, name: row.name, score, reason };
    }
  }
  return best;
}

export const DUPLICATE_CONFIRMED = 0.85;
export const DUPLICATE_SUSPECTED = 0.6;

/** The healthcare-technology themes discovery should stay anchored to. */
export const FOCUS_AREAS = [
  "healthcare",
  "digital health",
  "health technology",
  "health tech innovation",
  "value-based care",
  "oncology / cancer care",
  "healthcare AI",
  "healthcare leadership",
  "healthcare finance",
  "employer healthcare",
  "health plans / payers",
  "care delivery",
  "startups and growth companies",
  "technology innovation",
  "executive leadership",
];
