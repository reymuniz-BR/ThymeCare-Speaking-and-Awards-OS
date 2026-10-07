import { buildIcs, DEFAULT_TIMEZONE, type CalendarEvent } from "@/lib/calendar";

const KIND_LABEL: Record<string, string> = {
  opens: "Opens",
  deadline: "Deadline",
  extended_deadline: "Early deadline",
  notification: "Winners announced",
  event_start: "Event",
  event_end: "Event ends",
};

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  let diff = av.length ^ bv.length;
  const max = Math.max(av.length, bv.length);
  for (let i = 0; i < max; i++) diff |= (av[i] ?? 0) ^ (bv[i] ?? 0);
  return diff === 0;
}

export async function readFeedToken(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("job_secrets")
    .select("secret")
    .eq("name", "calendar-feed")
    .maybeSingle();
  return data?.secret ?? null;
}

/** Every tracked program date rendered as a subscribable ICS calendar. */
export async function buildProgramCalendar(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("opportunities")
    .select(
      "id, name, type, status, url, application_url, deadline_time, deadline_timezone, owner_name, opportunity_dates(id, kind, date)",
    )
    .not("status", "in", "(archived,declined)");

  if (error) throw new Error(error.message);

  const events: CalendarEvent[] = [];
  for (const o of data ?? []) {
    for (const d of (o.opportunity_dates ?? []) as { id: string; kind: string; date: string }[]) {
      const timed = d.kind === "deadline" || d.kind === "extended_deadline";
      events.push({
        uid: `${d.id}@thymecare-awards-os`,
        title: `${KIND_LABEL[d.kind] ?? d.kind}: ${o.name}`,
        date: d.date,
        time: timed ? (o.deadline_time ?? null) : null,
        timeZone: o.deadline_timezone ?? DEFAULT_TIMEZONE,
        description: [
          o.owner_name ? `Owner: ${o.owner_name}` : null,
          o.application_url ?? o.url ?? null,
        ]
          .filter(Boolean)
          .join("\n"),
        url: o.application_url ?? o.url ?? null,
        reminderMinutes: timed ? 60 * 24 : undefined,
      });
    }
  }
  return buildIcs(events);
}
