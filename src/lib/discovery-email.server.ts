/**
 * Weekly Discover email.
 *
 * After the Monday scan runs, the new candidates it queued are emailed as a
 * plain-text summary. Sends are claimed in public.email_digest_log exactly like
 * the program digests, so a retried run can never mail the same week twice, and
 * a failed send releases its claim for a later attempt.
 */

import { sendEmail } from "@/lib/email.server";
import { weekStart } from "@/lib/digest";

export type DiscoverEmailResult = {
  recipients: string[];
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

function appUrl(): string {
  return (
    process.env["APP_URL"] ?? "https://project--2183e766-3a7e-4b5f-965b-a450428b6dfe.lovable.app"
  );
}

/**
 * Where the weekly scan is mailed. A team alias wins when one is configured;
 * otherwise everyone with a role on the program gets it.
 */
export async function discoverRecipients(db: Admin): Promise<string[]> {
  const alias = (process.env["DISCOVER_ALIAS_EMAIL"] ?? process.env["TEAM_ALIAS_EMAIL"] ?? "").trim();
  if (alias) return alias.split(",").map((a) => a.trim()).filter(Boolean);

  const { data: roles, error: roleError } = await db.from("user_roles").select("user_id");
  if (roleError) throw new Error(roleError.message);
  const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
  if (!ids.length) return [];
  const { data, error } = await db.from("profiles").select("email").in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => p.email).filter((e): e is string => Boolean(e));
}

type Candidate = {
  name: string;
  organizer: string | null;
  relevance_score: number | null;
  estimated_deadline: string | null;
  rationale: string | null;
  source_url: string | null;
};

export function renderDiscoverEmail(
  brief: string,
  candidates: Candidate[],
  suppressed: number,
  url: string,
): { subject: string; text: string } {
  const subject = candidates.length
    ? `Discover: ${candidates.length} new opportunit${candidates.length === 1 ? "y" : "ies"} to review`
    : "Discover: no new opportunities this week";

  const lines: string[] = [];
  lines.push("Weekly Discover scan — Thyme Care Speaking & Awards OS", "");
  lines.push(`Focus this week: ${brief}`, "");

  if (!candidates.length) {
    lines.push("No new opportunities cleared the relevance bar this week.");
  } else {
    for (const c of candidates) {
      const score = c.relevance_score != null ? ` — fit ${c.relevance_score}/100` : "";
      lines.push(`• ${c.name}${c.organizer ? ` (${c.organizer})` : ""}${score}`);
      if (c.estimated_deadline) lines.push(`  Estimated deadline: ${c.estimated_deadline}`);
      if (c.rationale) lines.push(`  ${c.rationale}`);
      if (c.source_url) lines.push(`  ${c.source_url}`);
      lines.push("");
    }
  }

  if (suppressed) lines.push(`${suppressed} likely duplicates were suppressed.`, "");
  lines.push(`Review and triage: ${url}/discover`);

  return { subject, text: lines.join("\n") };
}

/** Email the candidates queued by a scan that started at `since`. */
export async function sendDiscoverEmail(args: {
  brief: string;
  since: string;
  suppressed: number;
  now?: Date;
}): Promise<DiscoverEmailResult> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const result: DiscoverEmailResult = {
    recipients: [],
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const { data, error } = await db
    .from("discoveries")
    .select("name, organizer, relevance_score, estimated_deadline, rationale, source_url")
    .gte("created_at", args.since)
    .order("relevance_score", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);
  const candidates = (data ?? []) as Candidate[];

  const recipients = await discoverRecipients(db);
  result.recipients = recipients;
  if (!recipients.length) return result;

  const key = `discover-${weekStart(args.now ?? new Date())}`;
  const { subject, text } = renderDiscoverEmail(
    args.brief,
    candidates,
    args.suppressed,
    appUrl(),
  );

  for (const recipient of recipients) {
    const { error: claimError } = await db.from("email_digest_log").insert({
      digest_key: key,
      recipient,
      user_id: null,
      item_count: candidates.length,
      status: "sending",
    });
    if (claimError) {
      // 23505 = unique violation: this week's email already went to them.
      if (claimError.code === "23505") {
        result.skipped += 1;
        continue;
      }
      throw new Error(claimError.message);
    }

    try {
      await sendEmail({ to: recipient, subject, text });
      await db
        .from("email_digest_log")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("digest_key", key)
        .eq("recipient", recipient);
      result.sent += 1;
    } catch (e) {
      await db.from("email_digest_log").delete().eq("digest_key", key).eq("recipient", recipient);
      result.failed += 1;
      const message = e instanceof Error ? e.message : "Send failed";
      if (!result.errors.includes(message)) result.errors.push(message);
    }
  }

  return result;
}
