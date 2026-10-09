/**
 * Program email digests.
 *
 * Two jobs, both driven by the Monday scheduled sweep:
 *  1. A weekly digest to every team member: deadlines in the next 14 days,
 *     monitoring changes awaiting review, and drafts idle for a week.
 *  2. Owner reminders 14, 7 and 2 days before an opportunity's deadline.
 *
 * Every send is claimed in public.email_digest_log first. The unique index on
 * (digest_key, recipient) makes that claim atomic, so a retried or overlapping
 * run can never send the same email twice. A failed send releases its claim so
 * the message can go out on a later run.
 */

import {
  ACTIVE_SUBMISSION_STAGES,
  DIGEST_HORIZON_DAYS,
  STALLED_DRAFT_DAYS,
  renderReminder,
  renderWeeklyDigest,
  reminderKey,
  reminderThreshold,
  upcomingDeadlines,
  weekStart,
  weeklyDigestItemCount,
  weeklyDigestKey,
  type DigestOpportunity,
  type WeeklyDigestData,
} from "@/lib/digest";
import { bestDeadline } from "@/lib/opportunity-view";
import { daysUntil } from "@/lib/program";
import type { AppDb } from "@/integrations/supabase/firestore/builder";
import { sendEmail } from "@/lib/email.server";
import { teamRecipients } from "@/lib/team.server";

export type DigestRunResult = {
  weeklySent: number;
  remindersSent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

function appUrl(): string {
  return (
    process.env["APP_URL"] ?? "https://ais-dev-z53f7or2rcvfol4alxwyeu-693915527211.us-west2.run.app"
  );
}

type Admin = AppDb;

/**
 * Claim a send. Returns false when this exact email was already logged, which
 * is the guarantee that nothing goes out twice.
 */
async function claim(
  db: Admin,
  key: string,
  recipient: string,
  userId: string | null,
  itemCount: number,
): Promise<boolean> {
  const { error } = await db.from("email_digest_log").insert({
    digest_key: key,
    recipient,
    user_id: userId,
    item_count: itemCount,
    status: "sending",
  });
  if (!error) return true;
  // 23505 = unique violation: already claimed or already sent.
  if (error.code === "23505") return false;
  throw new Error(`Could not record the send: ${error.message}`);
}

async function markSent(db: Admin, key: string, recipient: string) {
  await db
    .from("email_digest_log")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("digest_key", key)
    .eq("recipient", recipient);
}

/** Release a failed claim so the email can be retried on a later run. */
async function releaseClaim(db: Admin, key: string, recipient: string) {
  await db.from("email_digest_log").delete().eq("digest_key", key).eq("recipient", recipient);
}

async function deliver(
  db: Admin,
  result: DigestRunResult,
  args: {
    key: string;
    recipient: string;
    userId: string | null;
    itemCount: number;
    subject: string;
    text: string;
    kind: "weekly" | "reminder";
  },
): Promise<void> {
  const claimed = await claim(db, args.key, args.recipient, args.userId, args.itemCount);
  if (!claimed) {
    result.skipped += 1;
    return;
  }
  try {
    await sendEmail({ to: args.recipient, subject: args.subject, text: args.text });
    await markSent(db, args.key, args.recipient);
    if (args.kind === "weekly") result.weeklySent += 1;
    else result.remindersSent += 1;
  } catch (e) {
    await releaseClaim(db, args.key, args.recipient);
    result.failed += 1;
    const message = e instanceof Error ? e.message : "Send failed";
    if (!result.errors.includes(message)) result.errors.push(message);
  }
}

async function collectWeeklyData(db: Admin, opps: DigestOpportunity[]): Promise<WeeklyDigestData> {
  const deadlines = upcomingDeadlines(opps).map((o) => {
    const deadline = bestDeadline(o)!;
    return { name: o.name, deadline, days: daysUntil(deadline) ?? 0 };
  });

  const { data: changes, error: changeError } = await db
    .from("opportunity_changes")
    .select("label, old_value, new_value, opportunities(name)")
    .eq("review_status", "pending")
    .order("detected_at", { ascending: false })
    .limit(50);
  if (changeError) throw new Error(changeError.message);

  const idleBefore = new Date(Date.now() - STALLED_DRAFT_DAYS * 86_400_000).toISOString();
  const { data: drafts, error: draftError } = await db
    .from("submissions")
    .select("title, stage, updated_at, opportunities(name)")
    .in("stage", [...ACTIVE_SUBMISSION_STAGES])
    .lt("updated_at", idleBefore)
    .order("updated_at", { ascending: true })
    .limit(50);
  if (draftError) throw new Error(draftError.message);

  return {
    deadlines,
    changes: (changes ?? []).map((c) => ({
      name: c.opportunities?.name ?? "Opportunity",
      label: c.label,
      oldValue: c.old_value,
      newValue: c.new_value,
    })),
    stalledDrafts: (drafts ?? []).map((s) => ({
      title: s.title,
      opportunity: s.opportunities?.name ?? "Opportunity",
      stage: s.stage,
      idleDays: Math.max(0, -(daysUntil(s.updated_at) ?? 0)),
    })),
  };
}

/**
 * Run both digests. Safe to call more than once: already-sent emails are
 * skipped, not resent.
 */
export async function runEmailDigests(now = new Date()): Promise<DigestRunResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin;
  const result: DigestRunResult = {
    weeklySent: 0,
    remindersSent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const { data: oppRows, error: oppError } = await db
    .from("opportunities")
    .select("id, name, status, final_deadline, early_deadline, owner_id");
  if (oppError) throw new Error(oppError.message);
  const opps = (oppRows ?? []) as DigestOpportunity[];

  // 1. Weekly digest to the whole team.
  const week = weekStart(now);
  const weekly = await collectWeeklyData(db, opps);
  const count = weeklyDigestItemCount(weekly);
  const body = renderWeeklyDigest(weekly, appUrl());
  const members = await teamRecipients(db);

  for (const member of members) {
    await deliver(db, result, {
      key: weeklyDigestKey(week),
      recipient: member.email,
      userId: member.id,
      itemCount: count,
      subject: `Your week: ${weekly.deadlines.length} deadline(s) in the next ${DIGEST_HORIZON_DAYS} days`,
      text: body,
      kind: "weekly",
    });
  }

  // 2. Owner reminders at 14, 7 and 2 days out.
  const byId = new Map(members.flatMap((m) => (m.id ? [[m.id, m] as const] : [])));
  for (const o of opps) {
    const threshold = reminderThreshold(o);
    if (threshold === null || !o.owner_id) continue;
    const owner = byId.get(o.owner_id);
    if (!owner) continue;
    const deadline = bestDeadline(o)!;
    await deliver(db, result, {
      key: reminderKey(o.id, deadline, threshold),
      recipient: owner.email,
      userId: owner.id,
      itemCount: 1,
      subject: `${o.name} closes in ${threshold} day${threshold === 1 ? "" : "s"}`,
      text: renderReminder({ name: o.name, deadline, days: threshold }, appUrl(), o.id),
      kind: "reminder",
    });
  }

  return result;
}
