/**
 * Calendar helpers.
 *
 * Deadlines are stored as a plain date plus an optional cut-off time and IANA
 * time zone, because "11:59 PM Pacific" and "11:59 PM Eastern" are three hours
 * apart and the team submits against the real cut-off. When no time is set the
 * milestone is treated as an all-day event.
 */

export const TIMEZONE_OPTIONS = [
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (UK)" },
  { value: "Europe/Paris", label: "Central Europe" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export const TIMEZONE_VALUES = TIMEZONE_OPTIONS.map((t) => t.value);
export const TIMEZONE_LABELS: Record<string, string> = Object.fromEntries(
  TIMEZONE_OPTIONS.map((t) => [t.value, t.label]),
);

export const DEFAULT_TIMEZONE = "America/Los_Angeles";

export function timezoneLabel(tz: string | null | undefined): string {
  if (!tz) return "";
  return TIMEZONE_OPTIONS.find((t) => t.value === tz)?.label ?? tz;
}

/** "23:59:00" -> "11:59 PM" */
export function formatClock(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m ?? "00"} ${suffix}`;
}

/** Human label for a deadline cut-off, e.g. "11:59 PM Pacific (PT)". */
export function deadlineTimeLabel(
  time: string | null | undefined,
  tz: string | null | undefined,
): string {
  if (!time) return "";
  return [formatClock(time), timezoneLabel(tz ?? DEFAULT_TIMEZONE)].filter(Boolean).join(" ");
}

/** Offset in minutes between the given zone and UTC at that instant. */
function zoneOffsetMinutes(utcDate: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = Object.fromEntries(
    dtf.formatToParts(utcDate).map((p) => [p.type, p.value]),
  );
  const asUTC = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"] === "24" ? "0" : parts["hour"]),
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return (asUTC - utcDate.getTime()) / 60000;
}

/** Convert a wall-clock date+time in a zone into the true UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0);
  let guess = new Date(naive);
  for (let i = 0; i < 2; i++) {
    guess = new Date(naive - zoneOffsetMinutes(guess, timeZone) * 60000);
  }
  return guess;
}

function stampUtc(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

function stampDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

export type CalendarEvent = {
  uid: string;
  title: string;
  date: string;
  time?: string | null | undefined;
  timeZone?: string | null | undefined;
  description?: string | null | undefined;
  url?: string | null | undefined;
  /** Minutes before the start to alert; omit for no alarm. */
  reminderMinutes?: number | undefined;
};

export function toVEvent(e: CalendarEvent, now = new Date()): string[] {
  const lines: string[] = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stampUtc(now)}`];
  if (e.time) {
    const start = zonedToUtc(e.date, e.time, e.timeZone || DEFAULT_TIMEZONE);
    const end = new Date(start.getTime() + 30 * 60000);
    lines.push(`DTSTART:${stampUtc(start)}`, `DTEND:${stampUtc(end)}`);
  } else {
    lines.push(
      `DTSTART;VALUE=DATE:${stampDate(e.date)}`,
      `DTEND;VALUE=DATE:${stampDate(addDays(e.date, 1))}`,
    );
  }
  lines.push(`SUMMARY:${escapeIcs(e.title)}`);
  if (e.description) lines.push(`DESCRIPTION:${escapeIcs(e.description)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.reminderMinutes) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:-PT${e.reminderMinutes}M`,
      `DESCRIPTION:${escapeIcs(e.title)}`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(
  events: CalendarEvent[],
  calendarName = "Thyme Care Program Dates",
): string {
  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Thyme Care//Speaking & Awards OS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
    "X-PUBLISHED-TTL:PT6H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    ...events.flatMap((e) => toVEvent(e, now)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n");
}

/** Google Calendar "add event" URL for a single milestone. */
export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title });
  if (e.time) {
    const start = zonedToUtc(e.date, e.time, e.timeZone || DEFAULT_TIMEZONE);
    const end = new Date(start.getTime() + 30 * 60000);
    params.set("dates", `${stampUtc(start)}/${stampUtc(end)}`);
  } else {
    params.set("dates", `${stampDate(e.date)}/${stampDate(addDays(e.date, 1))}`);
  }
  if (e.description) params.set("details", e.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "milestone"
  );
}
