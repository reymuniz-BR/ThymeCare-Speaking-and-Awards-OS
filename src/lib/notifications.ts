/**
 * Notification derivation.
 *
 * The team should not have to visit the monitoring log or the discovery inbox
 * to learn that something needs attention. This module turns the program data
 * we already hold — pending monitoring changes, new high-fit discoveries and
 * deadline thresholds — into notification rows for the signed-in user.
 *
 * Rows are deduplicated on (kind, opportunity_id, title), so the same event
 * never lands twice no matter how often the sync runs.
 */

import type { Database } from "@/integrations/supabase/types";

export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export type NotificationKind = "deadline_change" | "discovery" | "deadline";

export type DesiredNotification = {
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  opportunity_id: string | null;
};

export const NOTIFICATION_LABEL: Record<string, string> = {
  deadline_change: "Deadline change",
  discovery: "New opportunity",
  deadline: "Deadline approaching",
};

export const NOTIFICATION_TONE: Record<string, "warning" | "info" | "critical" | "neutral"> = {
  deadline_change: "warning",
  discovery: "info",
  deadline: "critical",
};

/** Day thresholds that earn a notification as a deadline approaches. */
export const DEADLINE_THRESHOLDS = [14, 7, 1];

type OppLike = {
  id: string;
  name: string;
  status: string;
  final_deadline: string | null;
  early_deadline: string | null;
};

type ChangeLike = {
  id: string;
  opportunity_id: string;
  label: string;
  old_value: string | null;
  new_value: string | null;
  review_status: string;
  opportunities?: { name: string | null } | null;
};

type DiscoveryLike = {
  id: string;
  name: string;
  status: string;
  relevance_score: number | null;
  organizer: string | null;
};

function daysBetween(date: string): number {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function dedupeKey(n: {
  kind: string;
  opportunity_id: string | null;
  title: string;
}): string {
  return `${n.kind}|${n.opportunity_id ?? ""}|${n.title}`;
}

/** Everything the signed-in user should be told about right now. */
export function deriveNotifications(input: {
  opportunities: OppLike[];
  changes: ChangeLike[];
  discoveries: DiscoveryLike[];
  closed: (status: string) => boolean;
}): DesiredNotification[] {
  const out: DesiredNotification[] = [];

  for (const c of input.changes) {
    if (c.review_status !== "pending") continue;
    const name = c.opportunities?.name ?? "An opportunity";
    out.push({
      kind: "deadline_change",
      title: `${name} — ${c.label} changed`,
      body: `${c.old_value ?? "—"} → ${c.new_value ?? "—"}`,
      link: `/opportunities/${c.opportunity_id}`,
      opportunity_id: c.opportunity_id,
    });
  }

  for (const d of input.discoveries) {
    if (d.status !== "new") continue;
    if ((d.relevance_score ?? 0) < 70) continue;
    out.push({
      kind: "discovery",
      title: `High-fit find: ${d.name}`,
      body: `${d.organizer ?? "New program"} · fit ${d.relevance_score}`,
      link: `/discover`,
      opportunity_id: null,
    });
  }

  for (const o of input.opportunities) {
    if (input.closed(o.status)) continue;
    const deadline = o.final_deadline ?? o.early_deadline;
    if (!deadline) continue;
    const days = daysBetween(deadline);
    const hit = DEADLINE_THRESHOLDS.find((t) => t === days);
    if (hit === undefined) continue;
    out.push({
      kind: "deadline",
      title: `${o.name} — ${hit} day${hit === 1 ? "" : "s"} to deadline`,
      body: `Deadline ${deadline}`,
      link: `/opportunities/${o.id}`,
      opportunity_id: o.id,
    });
  }

  return out;
}
