import type { Database } from "@/integrations/supabase/types";

export type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"];
export type OpportunityDateRow = Database["public"]["Tables"]["opportunity_dates"]["Row"];
export type SubmissionRow = Database["public"]["Tables"]["submissions"]["Row"];
export type SubmissionFieldRow = Database["public"]["Tables"]["submission_fields"]["Row"];
export type DiscoveryRow = Database["public"]["Tables"]["discoveries"]["Row"];
export type ContentAssetRow = Database["public"]["Tables"]["content_assets"]["Row"];
export type ContentSnippetRow = Database["public"]["Tables"]["content_snippets"]["Row"];
export type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type TaxonomyRow = Database["public"]["Tables"]["taxonomy_options"]["Row"];

export type OpportunityType = Database["public"]["Enums"]["opportunity_type"];
export type DateKind = Database["public"]["Enums"]["date_kind"];
export type SubmissionStage = Database["public"]["Enums"]["submission_stage"];
export type AssetCategory = Database["public"]["Enums"]["asset_category"];

/** Status is intentionally a free-form string driven by the taxonomy_options table. */
export type OpportunityStatus = string;

export const OPPORTUNITY_TYPES: OpportunityType[] = ["speaking", "award"];

export const TYPE_LABEL: Record<string, string> = {
  speaking: "Speaking",
  award: "Award",
  conference: "Conference",
  recognition: "Recognition",
};

/** Configurable taxonomy kinds stored in taxonomy_options. */
export const TAXONOMY_KINDS = [
  "status",
  "priority",
  "deadline_type",
  "recommendation",
  "outcome",
] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export const SUBMISSION_STAGES: SubmissionStage[] = [
  "draft",
  "in_review",
  "approved",
  "submitted",
  "outcome_pending",
  "won",
  "lost",
];

export const DATE_KINDS: DateKind[] = [
  "opens",
  "deadline",
  "extended_deadline",
  "notification",
  "event_start",
  "event_end",
];

export const ASSET_CATEGORIES: AssetCategory[] = [
  "bio",
  "boilerplate",
  "prior_application",
  "metrics",
  "case_study",
  "press",
  "other",
];

export function labelize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ChipTone = "neutral" | "info" | "success" | "warning" | "critical" | "primary";

export function asTone(value: string | null | undefined): ChipTone {
  const tones: ChipTone[] = ["neutral", "info", "success", "warning", "critical", "primary"];
  return tones.includes(value as ChipTone) ? (value as ChipTone) : "neutral";
}

export const STAGE_TONE: Record<SubmissionStage, ChipTone> = {
  draft: "neutral",
  in_review: "warning",
  approved: "info",
  submitted: "primary",
  outcome_pending: "info",
  won: "success",
  lost: "critical",
};

export const TONE_CLASS: Record<ChipTone, string> = {
  neutral: "bg-neutralchip text-neutralchip-foreground",
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  warning: "bg-warning/18 text-warning-foreground",
  critical: "bg-critical/12 text-critical",
  primary: "bg-primary/12 text-primary",
};

/**
 * Whole days from today until `date`, counted in local calendar days.
 * Accepts a plain `YYYY-MM-DD` date or a full timestamp. Negative = in the past.
 * This is the single day-counting helper: deadlines, monitoring and proof-point
 * freshness all use it so they never disagree by a day.
 */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const target = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export type Urgency = "overdue" | "critical" | "soon" | "upcoming" | "future" | "none";

export function urgencyOf(date: string | null | undefined): Urgency {
  const d = daysUntil(date);
  if (d === null) return "none";
  if (d < 0) return "overdue";
  if (d <= 7) return "critical";
  if (d <= 30) return "soon";
  if (d <= 90) return "upcoming";
  return "future";
}

export const URGENCY_CLASS: Record<Urgency, string> = {
  overdue: "text-muted-foreground",
  critical: "text-critical font-semibold",
  soon: "text-warning-foreground font-medium",
  upcoming: "text-foreground",
  future: "text-muted-foreground",
  none: "text-muted-foreground",
};

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  // Plain YYYY-MM-DD is pinned to local midnight; timestamps parse as-is.
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function countdownLabel(date: string | null | undefined): string {
  const d = daysUntil(date);
  if (d === null) return "No date";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  return `${d}d left`;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
