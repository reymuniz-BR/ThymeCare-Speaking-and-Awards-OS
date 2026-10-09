import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/chip";
import { Panel, StatTile, EmptyState } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  useCurrentUser,
  useDiscoveries,
  useInvalidate,
  useOpportunities,
  useSubmissions,
} from "@/lib/hooks";
import { memberName } from "@/lib/team";
import type { OpportunityWithDates } from "@/lib/hooks";
import { bestDeadline, isClosed } from "@/lib/opportunity-view";
import { buildPipeline, ensureSubmission, segmentOf } from "@/lib/submission-pipeline";
import { countdownLabel, daysUntil, formatDate, labelize } from "@/lib/program";
import { budgetSummary } from "@/lib/budget";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Command center — Thyme Care Speaking & Awards" },
      {
        name: "description",
        content:
          "Program signals, the deadline runway, active submissions and new opportunities awaiting a decision.",
      },
      { property: "og:title", content: "Command center — Thyme Care Speaking & Awards" },
      {
        property: "og:description",
        content: "The comms team's daily operating view for speaking and award opportunities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomePage,
});

type Dated = { o: OpportunityWithDates; deadline: string; days: number };

function HomePage() {
  const { data: opportunities = [], isLoading } = useOpportunities();
  const { data: submissions = [] } = useSubmissions();
  const { data: discoveries = [] } = useDiscoveries();
  const { data: me } = useCurrentUser();
  const invalidate = useInvalidate();
  const navigate = useNavigate();

  const submissionFor = (opportunityId: string) =>
    submissions.find((s) => s.opportunity_id === opportunityId) ?? null;

  const open = opportunities.filter((o) => !isClosed(o.status));
  const budget = budgetSummary(opportunities);

  const dated = open
    .map((o) => ({ o, deadline: bestDeadline(o), days: daysUntil(bestDeadline(o)) }))
    .filter((x) => x.days !== null) as Dated[];

  const overdue = dated
    .filter((x) => x.days < 0 && x.o.status !== "submitted")
    .sort((a, b) => a.days - b.days);
  const week = dated.filter((x) => x.days >= 0 && x.days <= 7).sort((a, b) => a.days - b.days);
  const month = dated.filter((x) => x.days > 7 && x.days <= 30).sort((a, b) => a.days - b.days);
  const later = dated.filter((x) => x.days > 30 && x.days <= 120).sort((a, b) => a.days - b.days);
  const changed = open.filter((o) => o.change_detected);

  // Everything the signed-in user personally owns, most urgent first.
  const mine = me
    ? dated
        .filter((x) => x.o.owner_id === me.id)
        .sort((a, b) => a.days - b.days)
        .concat(
          open
            .filter((o) => o.owner_id === me.id && daysUntil(bestDeadline(o)) === null)
            .map((o) => ({ o, deadline: "", days: Number.POSITIVE_INFINITY })),
        )
    : [];

  const pipeline = buildPipeline(opportunities, submissions);
  const working = segmentOf(pipeline, "working");
  const sent = segmentOf(pipeline, "sent");
  const toReview = discoveries.filter((d) => d.status === "new");

  async function startSubmission(opportunityId: string, name: string) {
    const { id, error } = await ensureSubmission(opportunityId, name);
    if (!id) {
      toast.error(error ?? "Could not start a submission");
      return;
    }
    invalidate(["submissions"]);
    navigate({ to: "/submissions/$id", params: { id } });
  }

  async function dismiss(id: string) {
    const { error } = await supabase
      .from("discoveries")
      .update({ status: "dismissed" } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["discoveries"]);
  }

  return (
    <AppShell
      title="Command center"
      eyebrow={
        <>
          <span className="tracking-[0.12em] uppercase">Program status</span>
          <span className="text-border">/</span>
          <span>
            {opportunities.length} opportunities tracked · {open.length} active
          </span>
        </>
      }
      subtitle={
        isLoading
          ? "Loading program data…"
          : "Deadline runway, live submissions and sourcing decisions in one view."
      }
    >
      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Due in 7 days"
          value={week.length}
          tone={week.length ? "critical" : "neutral"}
          hint={week[0] ? `Next: ${week[0].o.name}` : "Nothing due this week"}
        />
        <StatTile
          label="Overdue"
          value={overdue.length}
          tone={overdue.length ? "warning" : "neutral"}
          hint={overdue.length ? "Confirm or close these records" : "Runway is clean"}
        />
        <StatTile
          label="Active submissions"
          value={working.length}
          tone="primary"
          hint={`${sent.length} submitted and awaiting outcome`}
        />
        <StatTile
          label="New to review"
          value={toReview.length}
          tone={toReview.length ? "info" : "neutral"}
          hint={
            changed.length ? `${changed.length} deadline changes detected` : "No detected changes"
          }
        />
      </div>

      {/* Client approval */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Awaiting client approval"
          value={budget.awaitingCount}
          tone={budget.awaitingCount ? "warning" : "neutral"}
          hint={
            budget.awaitingCount ? "Needs sign-off before we commit" : "Nothing pending sign-off"
          }
        />
      </div>

      {/* Operating area */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          title="Deadline runway"
          hint="Ordered by urgency across every active opportunity"
          action={
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
            >
              Calendar <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {isLoading ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">Loading…</p>
          ) : overdue.length + week.length + month.length + later.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No deadlines in the next 30 days">
                Track more opportunities or extend the horizon from the calendar.
              </EmptyState>
            </div>
          ) : (
            <div>
              <RunwayGroup
                label="Overdue"
                tone="critical"
                rows={overdue}
                onStart={startSubmission}
                submissionFor={submissionFor}
              />
              <RunwayGroup
                label="Next 7 days"
                tone="warning"
                rows={week}
                onStart={startSubmission}
                submissionFor={submissionFor}
              />
              <RunwayGroup
                label="Next 30 days"
                tone="neutral"
                rows={month}
                onStart={startSubmission}
                submissionFor={submissionFor}
              />
              <RunwayGroup
                label="Next 120 days"
                tone="neutral"
                rows={later}
                onStart={startSubmission}
                submissionFor={submissionFor}
              />
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            title="My assignments"
            hint={me ? `Owned by ${memberName(me)}` : "Sign-in required"}
            action={
              <Link
                to="/opportunities"
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
              >
                All opportunities <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            {mine.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                Nothing is assigned to you right now.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {mine.slice(0, 6).map(({ o, deadline, days }) => {
                  const submission = submissionFor(o.id);
                  return (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/opportunities/$id"
                          params={{ id: o.id }}
                          className="block truncate text-[13px] font-medium hover:text-primary hover:underline"
                        >
                          {o.name}
                        </Link>
                        <div className="truncate text-[11.5px] text-muted-foreground">
                          {labelize(o.type)}
                          {deadline ? ` · due ${formatDate(deadline)}` : " · no deadline"}
                        </div>
                      </div>
                      {deadline ? (
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 tabnum text-[11.5px] font-medium",
                            days < 0
                              ? "bg-critical/12 text-critical"
                              : days <= 7
                                ? "bg-warning/20 text-warning-foreground"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {countdownLabel(deadline)}
                        </span>
                      ) : null}
                      {submission ? (
                        <Link
                          to="/submissions/$id"
                          params={{ id: submission.id }}
                          className="shrink-0 text-[12px] font-medium text-primary hover:underline"
                        >
                          Open
                        </Link>
                      ) : (
                        <button
                          onClick={() => startSubmission(o.id, o.name)}
                          className="shrink-0 text-[12px] font-medium text-primary hover:underline"
                        >
                          Start
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Active submissions"
            hint="In drafting, review or approval"
            action={
              <Link
                to="/submissions"
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
              >
                Pipeline <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            {working.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                Nothing in progress yet.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {working.slice(0, 6).map((row) => (
                  <li key={row.key} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      {row.submissionId ? (
                        <Link
                          to="/submissions/$id"
                          params={{ id: row.submissionId }}
                          className="block truncate text-[13px] font-medium hover:text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <button
                          onClick={() => startSubmission(row.opportunityId!, row.name)}
                          className="block max-w-full truncate text-left text-[13px] font-medium hover:text-primary hover:underline"
                        >
                          {row.name}
                        </button>
                      )}
                      <div className="truncate text-[11.5px] text-muted-foreground">
                        {row.ownerName ? `${row.ownerName} · ` : ""}
                        {row.deadline ? `due ${formatDate(row.deadline)}` : "no deadline"}
                      </div>
                    </div>
                    <Chip tone={row.tone}>{row.stageLabel}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="New opportunities to review"
            hint="Sourced by the research agents — decide yes or no"
            action={
              <Link
                to="/opportunities"
                search={{ tab: "review" }}
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
              >
                Triage <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            {toReview.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                Nothing new to review right now.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {toReview.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{d.name}</div>
                      <div className="truncate text-[11.5px] text-muted-foreground">
                        {[
                          d.type ? labelize(d.type) : null,
                          d.organizer,
                          d.estimated_deadline
                            ? `deadline ${formatDate(d.estimated_deadline)}`
                            : "deadline TBD",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <Link
                      to="/opportunities"
                      search={{ tab: "review" }}
                      className="shrink-0 text-[12px] font-medium text-primary hover:underline"
                    >
                      Review
                    </Link>
                    <button
                      onClick={() => dismiss(d.id)}
                      className="shrink-0 text-[12px] text-muted-foreground hover:text-critical"
                    >
                      Dismiss
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {changed.length ? (
            <Panel title="Detected changes" hint="Monitoring flagged a deadline or status move">
              <ul className="divide-y divide-border/70">
                {changed.slice(0, 4).map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Link
                      to="/opportunities/$id"
                      params={{ id: o.id }}
                      className="min-w-0 flex-1 truncate text-[13px] font-medium hover:text-primary hover:underline"
                    >
                      {o.name}
                    </Link>
                    <Chip tone="warning">Changed</Chip>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function RunwayGroup({
  label,
  tone,
  rows,
  onStart,
  submissionFor,
}: {
  label: string;
  tone: "critical" | "warning" | "neutral";
  rows: Dated[];
  onStart: (id: string, name: string) => void;
  submissionFor: (id: string) => { id: string } | null;
}) {
  if (rows.length === 0) return null;
  const bar = {
    critical: "bg-critical",
    warning: "bg-warning",
    neutral: "bg-border",
  }[tone];
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-1.5">
        <span className={cn("h-2 w-2 rounded-full", bar)} />
        <span className="text-[11px] font-medium tracking-[0.07em] text-muted-foreground uppercase">
          {label}
        </span>
        <span className="tabnum text-[11px] text-muted-foreground">{rows.length}</span>
      </div>
      <ul className="divide-y divide-border/70">
        {rows.slice(0, 8).map(({ o, deadline, days }) => {
          const submission = submissionFor(o.id);
          return (
            <li
              key={o.id}
              className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    to="/opportunities/$id"
                    params={{ id: o.id }}
                    className="truncate text-[13.5px] font-medium hover:text-primary hover:underline"
                  >
                    {o.name}
                  </Link>
                  {o.change_detected ? <Chip tone="warning">Changed</Chip> : null}
                </div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  {labelize(o.type)}
                  {o.organizer ? ` · ${o.organizer}` : ""}
                  {o.owner_name ? ` · ${o.owner_name}` : ""} · {formatDate(deadline)}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 tabnum text-[11.5px] font-medium",
                  days < 0
                    ? "bg-critical/12 text-critical"
                    : days <= 7
                      ? "bg-warning/20 text-warning-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {countdownLabel(deadline)}
              </span>
              {submission ? (
                <Link
                  to="/submissions/$id"
                  params={{ id: submission.id }}
                  className="shrink-0 text-[12px] font-medium text-primary opacity-0 group-hover:opacity-100 hover:underline"
                >
                  Open
                </Link>
              ) : (
                <button
                  onClick={() => onStart(o.id, o.name)}
                  className="shrink-0 text-[12px] font-medium text-primary opacity-0 group-hover:opacity-100 hover:underline"
                >
                  Start
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
