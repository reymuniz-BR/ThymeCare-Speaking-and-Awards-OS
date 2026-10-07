import { daysUntil } from "@/lib/program";
import { isClosed } from "@/lib/opportunity-view";
import type { OpportunityRow } from "@/lib/program";

export type FlagKey =
  | "deadline_7"
  | "deadline_14"
  | "deadline_30"
  | "newly_open"
  | "deadline_changed"
  | "pending_changes"
  | "tbd"
  | "stale_verification"
  | "no_source";

export type Flag = {
  key: FlagKey;
  label: string;
  tone: "critical" | "warning" | "info" | "neutral" | "primary" | "success";
  weight: number;
};

export const FLAG_FILTERS: { key: FlagKey; label: string }[] = [
  { key: "deadline_7", label: "Deadline ≤ 7 days" },
  { key: "deadline_14", label: "Deadline ≤ 14 days" },
  { key: "deadline_30", label: "Deadline ≤ 30 days" },
  { key: "newly_open", label: "Newly opened" },
  { key: "deadline_changed", label: "Deadline changed" },
  { key: "pending_changes", label: "Changes to review" },
  { key: "tbd", label: "Information still TBD" },
  { key: "stale_verification", label: "Not verified recently" },
  { key: "no_source", label: "No source URL" },
];

export const STALE_DAYS = 14;

/** Days since an ISO timestamp, or null when never. */
export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

export function isActive(o: OpportunityRow): boolean {
  return !isClosed(o.status);
}

export function nextDeadlineDate(o: OpportunityRow): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const options = [o.early_deadline, o.final_deadline].filter(
    (d): d is string => !!d && d >= today,
  );
  options.sort();
  return options[0] ?? o.final_deadline ?? null;
}

export type AttentionInput = OpportunityRow & { pending_changes?: number };

/** Urgency + monitoring-health indicators for one opportunity. */
export function attentionFlags(o: AttentionInput): Flag[] {
  const flags: Flag[] = [];
  const deadline = nextDeadlineDate(o);
  const d = daysUntil(deadline);

  if (d !== null && d >= 0) {
    if (d <= 7)
      flags.push({ key: "deadline_7", label: `Deadline in ${d}d`, tone: "critical", weight: 100 });
    else if (d <= 14)
      flags.push({ key: "deadline_14", label: `Deadline in ${d}d`, tone: "warning", weight: 80 });
    else if (d <= 30)
      flags.push({ key: "deadline_30", label: `Deadline in ${d}d`, tone: "info", weight: 60 });
  }

  if (o.application_state === "open" && (o.status === "monitoring" || o.status === "not_open_yet"))
    flags.push({
      key: "newly_open",
      label: "Applications newly open",
      tone: "success",
      weight: 90,
    });

  if (o.change_detected)
    flags.push({ key: "deadline_changed", label: "Change detected", tone: "primary", weight: 85 });

  if ((o.pending_changes ?? 0) > 0)
    flags.push({
      key: "pending_changes",
      label: `${o.pending_changes} change${o.pending_changes === 1 ? "" : "s"} to review`,
      tone: "warning",
      weight: 88,
    });

  if (!deadline || o.deadline_type === "tbd" || o.deadline_type === "estimated")
    flags.push({ key: "tbd", label: "Information still TBD", tone: "neutral", weight: 30 });

  const since = daysSince(o.last_verified_at ?? o.last_checked_at);
  if (o.monitoring_enabled && (since === null || since > STALE_DAYS))
    flags.push({
      key: "stale_verification",
      label: since === null ? "Never verified" : `Not verified in ${since}d`,
      tone: "warning",
      weight: 55,
    });

  if (o.monitoring_enabled && !o.deadline_source_url && !o.application_url && !o.url)
    flags.push({ key: "no_source", label: "No source URL", tone: "critical", weight: 70 });

  return flags;
}

export function attentionScore(flags: Flag[]): number {
  return flags.reduce((max, f) => Math.max(max, f.weight), 0);
}

export const APPLICATION_STATE_LABEL: Record<string, string> = {
  not_announced: "Not announced",
  not_yet_open: "Not yet open",
  open: "Open",
  rolling: "Rolling",
  closed: "Closed",
  unknown: "Unknown",
};

export const APPLICATION_STATE_TONE: Record<string, Flag["tone"]> = {
  not_announced: "neutral",
  not_yet_open: "info",
  open: "success",
  rolling: "info",
  closed: "critical",
  unknown: "neutral",
};

export const CONFIDENCE_TONE: Record<string, Flag["tone"]> = {
  confirmed: "success",
  likely: "warning",
  uncertain: "critical",
};
