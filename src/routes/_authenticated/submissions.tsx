import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/chip";
import { Panel, StatTile, TabStrip, TableHead, Th, Td, EmptyState } from "@/components/ui-kit";
import { useOpportunities, useInvalidate, useSubmissions } from "@/lib/hooks";
import { buildPipeline, ensureSubmission, segmentOf } from "@/lib/submission-pipeline";
import type { PipelineRow, PipelineSegment } from "@/lib/submission-pipeline";
import { URGENCY_CLASS, countdownLabel, formatDate, labelize, urgencyOf } from "@/lib/program";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/submissions")({
  head: () => ({
    meta: [
      { title: "Submissions — Thyme Care Speaking & Awards" },
      {
        name: "description",
        content:
          "Every award entry and speaking abstract the team is drafting, reviewing or has already submitted.",
      },
      { property: "og:title", content: "Submissions — Thyme Care Speaking & Awards" },
      {
        property: "og:description",
        content: "What we are working on and what we have already sent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubmissionsPage,
});

function SubmissionsPage() {
  const { data: submissions = [], isLoading } = useSubmissions();
  const { data: opportunities = [] } = useOpportunities();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PipelineSegment>("working");

  const rows = useMemo(
    () => buildPipeline(opportunities, submissions),
    [opportunities, submissions],
  );

  const working = segmentOf(rows, "working");
  const sent = segmentOf(rows, "sent");
  const decided = segmentOf(rows, "decided");
  const visible = tab === "working" ? working : tab === "sent" ? sent : decided;

  async function open(row: PipelineRow) {
    if (row.submissionId) {
      navigate({ to: "/submissions/$id", params: { id: row.submissionId } });
      return;
    }
    if (!row.opportunityId) return;
    const { id, error } = await ensureSubmission(row.opportunityId, row.name);
    if (!id) {
      toast.error(error ?? "Could not open this submission");
      return;
    }
    invalidate(["submissions"]);
    navigate({ to: "/submissions/$id", params: { id } });
  }

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of visible) counts.set(r.stageLabel, (counts.get(r.stageLabel) ?? 0) + 1);
    return [...counts.entries()];
  }, [visible]);

  const dueSoon = working.filter((r) => {
    const u = urgencyOf(r.deadline);
    return u === "overdue" || u === "critical";
  }).length;

  return (
    <AppShell
      title="Submissions"
      eyebrow={
        <>
          <span className="tracking-[0.12em] uppercase">Production pipeline</span>
          <span className="text-border">/</span>
          <span>
            {working.length} in progress · {sent.length} submitted · {decided.length} decided
          </span>
        </>
      }
      subtitle="Everything the team is drafting, has sent, or has an outcome for."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="In progress"
          value={working.length}
          tone="primary"
          hint={`${dueSoon} due within a week`}
        />
        <StatTile label="Submitted" value={sent.length} tone="info" hint="Awaiting a decision" />
        <StatTile label="Decided" value={decided.length} hint="Won or lost this cycle" />
      </div>

      <TabStrip
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "working" as PipelineSegment, label: "In progress", count: working.length },
          { key: "sent" as PipelineSegment, label: "Submitted", count: sent.length },
          { key: "decided" as PipelineSegment, label: "Decided", count: decided.length },
        ]}
        className="mt-5 mb-4"
      />

      {stageCounts.length > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="tracking-[0.08em] uppercase">Stages</span>
          {stageCounts.map(([label, count]) => (
            <span key={label} className="rounded border border-border bg-surface px-2 py-0.5">
              {label} <span className="tabnum font-medium text-foreground">{count}</span>
            </span>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title={
            tab === "working"
              ? "Nothing in progress"
              : tab === "sent"
                ? "Nothing submitted yet"
                : "No outcomes recorded yet"
          }
        >
          <Link to="/opportunities" className="font-medium text-primary hover:underline">
            Pick an opportunity and start a submission →
          </Link>
        </EmptyState>
      ) : (
        <Panel bodyClassName="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <TableHead>
              <tr>
                <Th className="w-[42%]">Submission</Th>
                <Th className="w-28">Type</Th>
                <Th className="w-36">Stage</Th>
                <Th className="w-28">Owner</Th>
                <Th className="w-28">Deadline</Th>
                <Th className="w-24 text-right">Countdown</Th>
              </tr>
            </TableHead>
            <tbody className="divide-y divide-border/70">
              {visible.map((row) => (
                <tr
                  key={row.key}
                  onClick={() => open(row)}
                  className="cursor-pointer transition-colors hover:bg-surface-2/70"
                >
                  <Td className="font-medium">{row.name}</Td>
                  <Td className="text-[12px] text-muted-foreground">
                    {row.type ? labelize(row.type) : "Not linked"}
                  </Td>
                  <Td>
                    <Chip tone={row.tone}>{row.stageLabel}</Chip>
                  </Td>
                  <Td className="text-[12px] text-muted-foreground">{row.ownerName ?? "—"}</Td>
                  <Td className="tabnum text-[12px] text-muted-foreground">
                    {row.deadline ? formatDate(row.deadline) : "—"}
                  </Td>
                  <Td
                    className={cn(
                      "text-right tabnum text-[12px]",
                      URGENCY_CLASS[urgencyOf(row.deadline)],
                    )}
                  >
                    {row.deadline ? countdownLabel(row.deadline) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </AppShell>
  );
}
