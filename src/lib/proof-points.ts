import { daysUntil } from "@/lib/program";

/**
 * Messaging & Proof Point Bank.
 *
 * Canonical building blocks — company overview, differentiators, impact
 * narratives, metrics, executive bios, milestones, approved quotes — that the
 * submission workspace reuses ahead of older historical submission language.
 * Historical submissions supply precedent and narrative inspiration; the bank
 * supplies the most reliable current facts.
 */

import type { Database } from "@/integrations/supabase/types";

export type ProofPointRow = Database["public"]["Tables"]["proof_points"]["Row"];
export type ProofPointKind = Database["public"]["Enums"]["proof_point_kind"];

export const PROOF_POINT_GROUPS: { group: string; kinds: ProofPointKind[] }[] = [
  {
    group: "Company narrative",
    kinds: ["company_overview", "differentiation", "market_problem", "innovation_story"],
  },
  {
    group: "Impact",
    kinds: ["healthcare_impact", "patient_impact", "customer_impact"],
  },
  {
    group: "Metrics",
    kinds: ["growth_metric", "business_metric"],
  },
  {
    group: "Positioning",
    kinds: ["technology_narrative", "value_based_care"],
  },
  {
    group: "People & evidence",
    kinds: [
      "executive_bio",
      "leadership_example",
      "customer_example",
      "milestone",
      "award_recognition",
      "approved_quote",
    ],
  },
];

export const PROOF_POINT_KIND_LABEL: Record<ProofPointKind, string> = {
  company_overview: "Company overview",
  differentiation: "Company differentiation",
  market_problem: "Market problem",
  innovation_story: "Innovation story",
  healthcare_impact: "Healthcare impact",
  patient_impact: "Patient impact",
  customer_impact: "Customer impact",
  growth_metric: "Growth metrics",
  business_metric: "Financial / business metrics",
  technology_narrative: "Technology / AI narrative",
  value_based_care: "Value-based care narrative",
  executive_bio: "Executive biography",
  leadership_example: "Executive leadership example",
  customer_example: "Customer example",
  milestone: "Key milestone",
  award_recognition: "Award / recognition",
  approved_quote: "Approved quote",
};

export const PROOF_POINT_KINDS = PROOF_POINT_GROUPS.flatMap((g) => g.kinds);

/** Kinds whose content is inherently dated and should carry a re-verification date. */
export const DATED_KINDS: ProofPointKind[] = [
  "growth_metric",
  "business_metric",
  "healthcare_impact",
  "patient_impact",
  "customer_impact",
  "award_recognition",
  "milestone",
];

export type BankState = "draft" | "expired" | "due" | "stale" | "current";

/**
 * Trust state of a bank entry. Only `current` and `due` entries are offered to
 * the drafting engine as canonical facts; drafts and expired entries are never
 * used as source material.
 */
export function bankState(p: {
  approved: boolean;
  expires_on: string | null;
  last_verified_at: string | null;
  source_date: string | null;
}): BankState {
  if (!p.approved) return "draft";
  const exp = daysUntil(p.expires_on);
  if (exp !== null && exp < 0) return "expired";
  if (exp !== null && exp <= 30) return "due";
  const anchor = p.last_verified_at ?? p.source_date;
  if (anchor) {
    const age = daysUntil(anchor);
    if (age !== null && age < -365) return "stale";
  }
  return "current";
}

export const BANK_STATE_LABEL: Record<BankState, string> = {
  draft: "Not approved",
  expired: "Expired",
  due: "Re-verify soon",
  stale: "Ageing",
  current: "Approved & current",
};

export const BANK_STATE_TONE: Record<BankState, "neutral" | "warning" | "critical" | "success"> = {
  draft: "neutral",
  expired: "critical",
  due: "warning",
  stale: "warning",
  current: "success",
};

/** Entries the AI may treat as canonical current fact. */
export function isCitable(p: Parameters<typeof bankState>[0]) {
  const s = bankState(p);
  return s === "current" || s === "due" || s === "stale";
}
