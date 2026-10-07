import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/taxonomy";
import { Chip } from "@/components/chip";
import { useOpportunities } from "@/lib/hooks";
import { URGENCY_CLASS, countdownLabel, formatDate, labelize, urgencyOf } from "@/lib/program";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CalendarPlus, Copy, Rss } from "lucide-react";
import { AddToCalendar } from "@/components/add-to-calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCalendarFeedUrl } from "@/lib/calendar.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DEFAULT_TIMEZONE,
  buildIcs,
  deadlineTimeLabel,
  downloadIcs,
  type CalendarEvent,
} from "@/lib/calendar";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar & Deadlines — Thyme Care Speaking & Awards OS" },
      {
        name: "description",
        content:
          "Month view and runway list of every opening date, deadline, notification and event across the program.",
      },
      { property: "og:title", content: "Deadline Calendar — Thyme Care Speaking & Awards OS" },
      {
        property: "og:description",
        content: "See every program milestone by month so nothing slips.",
      },
    ],
  }),
  component: CalendarPage,
});

const KIND_DOT: Record<string, string> = {
  opens: "bg-info",
  deadline: "bg-critical",
  extended_deadline: "bg-warning",
  notification: "bg-primary",
  event_start: "bg-success",
  event_end: "bg-success",
};

const KIND_TITLE: Record<string, string> = {
  opens: "Opens",
  deadline: "Deadline",
  extended_deadline: "Early deadline",
  notification: "Winners announced",
  event_start: "Event",
  event_end: "Event ends",
};

type MilestoneOpportunity = {
  id: string;
  name: string;
  url?: string | null;
  application_url?: string | null;
  deadline_time?: string | null;
  deadline_timezone?: string | null;
};

function milestoneEvent(
  id: string,
  kind: string,
  date: string,
  o: MilestoneOpportunity,
): CalendarEvent {
  const timed = kind === "deadline" || kind === "extended_deadline";
  const link = o.application_url ?? o.url ?? null;
  return {
    uid: `${id}@thymecare-awards-os`,
    title: `${KIND_TITLE[kind] ?? labelize(kind)}: ${o.name}`,
    date,
    time: timed ? ((o.deadline_time ?? "").slice(0, 5) || null) : null,
    timeZone: o.deadline_timezone ?? DEFAULT_TIMEZONE,
    description: link,
    url: link,
    reminderMinutes: timed ? 60 * 24 : undefined,
  };
}

function SubscribeDialog() {
  const fetchUrl = useServerFn(getCalendarFeedUrl);
  const { data } = useQuery({ queryKey: ["calendar-feed"], queryFn: () => fetchUrl({}) });
  const feedUrl =
    data?.token && typeof window !== "undefined"
      ? `${window.location.origin}/api/public/calendar-feed?token=${data.token}`
      : "";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Rss className="h-3.5 w-3.5" /> Subscribe
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Subscribe to program dates</DialogTitle>
          <DialogDescription>
            In Google Calendar choose “Other calendars → From URL” and paste this private feed. It
            refreshes automatically, so new and changed deadlines flow through. Treat the link as a
            password — anyone with it can read program dates.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={feedUrl} className="h-9 font-mono text-[12px]" />
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={!feedUrl}
            onClick={() => {
              navigator.clipboard.writeText(feedUrl);
              toast.success("Feed URL copied");
            }}
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </div>
        <a
          href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`}
          target="_blank"
          rel="noreferrer"
          className="text-[12.5px] text-primary hover:underline"
        >
          Open Google Calendar to add it
        </a>
      </DialogContent>
    </Dialog>
  );
}

function CalendarPage() {
  const { data: opportunities = [] } = useOpportunities();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const events = useMemo(
    () =>
      opportunities.flatMap((o) =>
        (o.opportunity_dates ?? []).map((d) => ({
          id: d.id,
          date: d.date,
          kind: d.kind,
          opportunity: o,
        })),
      ),
    [opportunities],
  );

  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const monthEvents = events.filter((e) => e.date.startsWith(monthKey));
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = events
    .filter((e) => e.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 20);

  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <AppShell
      title="Calendar & Deadlines"
      subtitle={`${events.length} tracked milestones`}
      actions={
        <div className="flex items-center gap-1.5">
          <SubscribeDialog />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() =>
              downloadIcs(
                "thyme-care-program",
                buildIcs(
                  events.map((e) =>
                    milestoneEvent(e.id, e.kind, e.date, e.opportunity as MilestoneOpportunity),
                  ),
                ),
              )
            }
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Download .ics
          </Button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded border border-border hover:bg-muted"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="w-36 text-center text-[13px] font-medium">
            {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button
            className="flex h-8 w-8 items-center justify-center rounded border border-border hover:bg-muted"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="grid grid-cols-7 gap-px text-[11px] tracking-wide text-muted-foreground uppercase">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="px-2 py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-px bg-border">
            {cells.map((day, i) => {
              const iso = day ? `${monthKey}-${String(day).padStart(2, "0")}` : null;
              const dayEvents = iso ? monthEvents.filter((e) => e.date === iso) : [];
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-24 bg-surface p-1.5",
                    iso === todayIso && "bg-primary/5 ring-1 ring-primary/40 ring-inset",
                  )}
                >
                  {day ? (
                    <>
                      <div className="mb-1 text-[11px] tabnum text-muted-foreground">{day}</div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((e) => (
                          <Link
                            key={e.id}
                            to="/opportunities/$id"
                            params={{ id: e.opportunity.id }}
                            className="flex items-start gap-1 rounded bg-surface-2 px-1 py-0.5 text-[11px] leading-tight hover:bg-muted"
                          >
                            <span
                              className={cn(
                                "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                                KIND_DOT[e.kind] ?? "bg-muted-foreground",
                              )}
                            />
                            <span className="line-clamp-2">{e.opportunity.name}</span>
                          </Link>
                        ))}
                        {dayEvents.length > 3 ? (
                          <div className="px-1 text-[10px] text-muted-foreground">
                            +{dayEvents.length - 3} more
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {Object.keys(KIND_DOT).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[k])} />
                {labelize(k)}
              </span>
            ))}
          </div>
        </div>

        <section className="rounded-md border border-border bg-surface">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Next 20 milestones</h2>
          </header>
          <ul className="divide-y divide-border/60">
            {upcoming.map((e) => (
              <li key={e.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    to="/opportunities/$id"
                    params={{ id: e.opportunity.id }}
                    className="truncate text-[13px] font-medium hover:text-primary hover:underline"
                  >
                    {e.opportunity.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={cn("text-[12px]", URGENCY_CLASS[urgencyOf(e.date)])}>
                      {countdownLabel(e.date)}
                    </span>
                    <AddToCalendar
                      event={milestoneEvent(
                        e.id,
                        e.kind,
                        e.date,
                        e.opportunity as MilestoneOpportunity,
                      )}
                    />
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[e.kind])} />
                  {labelize(e.kind)} · {formatDate(e.date)}
                  {(e.kind === "deadline" || e.kind === "extended_deadline") &&
                  e.opportunity.deadline_time
                    ? ` · ${deadlineTimeLabel(
                        e.opportunity.deadline_time.slice(0, 5),
                        e.opportunity.deadline_timezone ?? DEFAULT_TIMEZONE,
                      )}`
                    : ""}
                  <StatusBadge
                    status={e.opportunity.status}
                    type={e.opportunity.type}
                    className="ml-auto"
                  />
                </div>
              </li>
            ))}
            {upcoming.length === 0 ? (
              <li className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                No upcoming milestones.
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
