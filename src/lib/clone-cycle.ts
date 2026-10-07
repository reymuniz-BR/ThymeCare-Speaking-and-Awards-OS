/**
 * Clone a finished opportunity into next year's cycle.
 *
 * The new record keeps every descriptive detail, moves each date forward one
 * year and marks those dates unconfirmed (they must be verified against the
 * program page), and carries a link back to last year's record, submission and
 * outcome so the team can reuse what they wrote.
 */
import { supabase } from "@/integrations/supabase/client";

/** Fields copied verbatim onto next year's edition. */
const COPIED_FIELDS = [
  "name",
  "type",
  "organizer",
  "url",
  "application_url",
  "description",
  "audience",
  "region",
  "location",
  "tier",
  "cost_usd",
  "effort",
  "category",
  "recommendation",
  "owner_id",
  "owner_name",
  "submission_owner_id",
  "tags",
  "source",
  "deadline_type",
  "deadline_source_url",
  "monitoring_enabled",
] as const;

/** Dates shifted forward one year on the clone. */
const SHIFTED_DATES = [
  "open_date",
  "early_deadline",
  "final_deadline",
  "announcement_date",
  "event_date",
  "internal_draft_due",
  "client_review_due",
] as const;

/** Move a YYYY-MM-DD date forward one year (Feb 29 lands on Feb 28). */
export function shiftYear(date: string | null | undefined, years = 1): string | null {
  if (!date) return null;
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const year = y + years;
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The cycle year an opportunity belongs to, inferred from its dates. */
export function cycleYear(o: Record<string, unknown>): number {
  const anchor = (o["final_deadline"] ??
    o["early_deadline"] ??
    o["event_date"] ??
    o["open_date"] ??
    null) as string | null;
  return anchor ? Number(anchor.slice(0, 4)) : new Date().getUTCFullYear();
}

type CloneResult = { id: string | null; error?: string; year?: number };

export async function cloneToNextCycle(opportunityId: string): Promise<CloneResult> {
  const { data: source, error: readError } = await supabase
    .from("opportunities")
    .select("*, submissions(id, title, outcome, stage, submitted_at)")
    .eq("id", opportunityId)
    .maybeSingle();
  if (readError) return { id: null, error: readError.message };
  if (!source) return { id: null, error: "That opportunity no longer exists." };

  const row = source as unknown as Record<string, unknown>;
  const submissions = (row["submissions"] ?? []) as {
    id: string;
    outcome: string | null;
    stage: string | null;
  }[];
  const lastSubmission = submissions[0] ?? null;
  const priorYear = cycleYear(row);
  const nextYear = priorYear + 1;

  const insert: Record<string, unknown> = {};
  COPIED_FIELDS.forEach((f) => (insert[f] = row[f] ?? null));
  SHIFTED_DATES.forEach((f) => (insert[f] = shiftYear(row[f] as string | null)));

  insert["status"] = "monitoring";
  insert["priority"] = row["priority"] ?? "medium";
  insert["application_stage"] = null;
  insert["outcome"] = null;
  insert["change_detected"] = false;
  insert["previous_deadline"] = null;
  insert["deadline_verified_at"] = null;
  insert["last_verified_at"] = null;
  insert["last_checked_at"] = null;
  insert["application_state"] = null;

  const outcomeText =
    (row["outcome"] as string | null) ??
    lastSubmission?.outcome ??
    (row["status"] as string | null) ??
    "closed";
  const linkBack = [
    `${nextYear} cycle — cloned from the ${priorYear} edition.`,
    `Last cycle outcome: ${outcomeText.replace(/_/g, " ")}.`,
    `Previous record: /opportunities/${opportunityId}`,
    lastSubmission ? `Previous submission: /submissions/${lastSubmission.id}` : null,
    "Dates are carried over from last year and are unconfirmed — verify on the program page.",
  ]
    .filter(Boolean)
    .join("\n");
  insert["notes"] = [linkBack, (row["notes"] as string | null) ?? ""].join("\n\n").trim();
  insert["monitoring_notes"] = "Dates unconfirmed — copied from the previous cycle.";

  const { data: created, error: insertError } = await supabase
    .from("opportunities")
    .insert(insert as never)
    .select("id")
    .single();
  if (insertError || !created) return { id: null, error: insertError?.message ?? "Clone failed" };

  const newId = (created as { id: string }).id;

  // Record both cycles so the two editions read as one programme over time.
  await supabase.from("opportunity_cycles").insert([
    { opportunity_id: opportunityId, year: priorYear, label: `${priorYear} cycle`, is_current: false },
    { opportunity_id: newId, year: nextYear, label: `${nextYear} cycle`, is_current: true },
  ] as never);

  // Every carried-over date is a guess until someone verifies it.
  await supabase
    .from("opportunity_dates")
    .update({ confidence: "unconfirmed", last_verified_at: null } as never)
    .eq("opportunity_id", newId);

  return { id: newId, year: nextYear };
}
