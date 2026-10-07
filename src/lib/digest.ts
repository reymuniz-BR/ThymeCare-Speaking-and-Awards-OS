/**
 * Pure helpers for the program email digests.
 *
 * Kept free of database and network access so the selection rules — what counts
 * as "due soon", "stalled" or a reminder threshold — can be reasoned about and
 * reused by the dashboard if needed.
 */

import { daysUntil, formatDate } from "@/lib/program";
import { bestDeadline, isClosed } from "@/lib/opportunity-view";

/** Deadline horizon covered by the Monday digest. */
export const DIGEST_HORIZON_DAYS = 14;

/** Days before a deadline that the opportunity owner is reminded. */
export const REMINDER_THRESHOLDS = [14, 7, 2] as const;

/** A draft that has not been touched in this many days is "stalled". */
export const STALLED_DRAFT_DAYS = 7;

/** Submission stages that are still being worked on. */
export const ACTIVE_SUBMISSION_STAGES = ["draft", "in_review", "approved"] as const;

export type DigestOpportunity = {
  id: string;
  name: string;
  status: string;
  final_deadline: string | null;
  early_deadline: string | null;
  owner_id: string | null;
};

/** The Monday (UTC) that starts the week containing `now`. */
export function weekStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const shift = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/** Open opportunities whose deadline falls inside the digest horizon. */
export function upcomingDeadlines<T extends DigestOpportunity>(opps: T[]): T[] {
  return opps
    .filter((o) => {
      if (isClosed(o.status)) return false;
      const d = daysUntil(bestDeadline(o));
      return d !== null && d >= 0 && d <= DIGEST_HORIZON_DAYS;
    })
    .sort((a, b) => (bestDeadline(a) ?? "").localeCompare(bestDeadline(b) ?? ""));
}

/**
 * The reminder threshold an opportunity qualifies for today, or null.
 * Exactly one threshold can match on a given day, so an owner never gets two
 * reminders for the same deadline.
 */
export function reminderThreshold(o: DigestOpportunity): number | null {
  if (isClosed(o.status)) return null;
  const d = daysUntil(bestDeadline(o));
  if (d === null) return null;
  return REMINDER_THRESHOLDS.find((t) => t === d) ?? null;
}

/** Stable key so a given email is only ever recorded — and sent — once. */
export function weeklyDigestKey(week: string): string {
  return `weekly:${week}`;
}

export function reminderKey(opportunityId: string, deadline: string, days: number): string {
  return `deadline:${opportunityId}:${deadline}:${days}`;
}

export function countdown(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

export type WeeklyDigestData = {
  deadlines: { name: string; deadline: string; days: number }[];
  changes: { name: string; label: string; oldValue: string | null; newValue: string | null }[];
  stalledDrafts: { title: string; opportunity: string; stage: string; idleDays: number }[];
};

export function weeklyDigestItemCount(data: WeeklyDigestData): number {
  return data.deadlines.length + data.changes.length + data.stalledDrafts.length;
}

/** Plain-text body of the Monday digest. */
export function renderWeeklyDigest(data: WeeklyDigestData, appUrl: string): string {
  const lines: string[] = ["Thyme Care Speaking & Awards — your week", ""];

  lines.push(`DEADLINES IN THE NEXT ${DIGEST_HORIZON_DAYS} DAYS (${data.deadlines.length})`);
  if (!data.deadlines.length) lines.push("  Nothing due in this window.");
  for (const d of data.deadlines) {
    lines.push(`  • ${d.name} — ${formatDate(d.deadline)} (${countdown(d.days)})`);
  }
  lines.push("");

  lines.push(`CHANGES AWAITING REVIEW (${data.changes.length})`);
  if (!data.changes.length) lines.push("  Nothing to review.");
  for (const c of data.changes) {
    lines.push(`  • ${c.name} — ${c.label}: ${c.oldValue ?? "—"} → ${c.newValue ?? "—"}`);
  }
  lines.push("");

  lines.push(`DRAFTS THAT HAVEN'T MOVED IN A WEEK (${data.stalledDrafts.length})`);
  if (!data.stalledDrafts.length) lines.push("  All drafts are moving.");
  for (const s of data.stalledDrafts) {
    lines.push(`  • ${s.title} (${s.opportunity}) — ${s.stage}, idle ${s.idleDays} days`);
  }
  lines.push("", `Open the program: ${appUrl}`);

  return lines.join("\n");
}

/** Plain-text body of an owner deadline reminder. */
export function renderReminder(
  o: { name: string; deadline: string; days: number },
  appUrl: string,
  opportunityId: string,
): string {
  return [
    `${o.name} closes ${countdown(o.days)}.`,
    "",
    `Deadline: ${formatDate(o.deadline)}`,
    `You are the owner of this opportunity.`,
    "",
    `Open it: ${appUrl}/opportunities/${opportunityId}`,
  ].join("\n");
}
