import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Chip, TierChip } from "@/components/chip";
import { StatusBadge } from "@/components/taxonomy";
import { NewOpportunityDialog } from "@/components/new-opportunity-dialog";
import {
  useDiscoveries,
  useInvalidate,
  useOpportunities,
  useProfiles,
  useSubmissions,
} from "@/lib/hooks";
import { useTaxonomy, optionsFor } from "@/lib/taxonomy";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ensureSubmission } from "@/lib/submission-pipeline";
import { bestDeadline, isClosed, APPLICATION_STAGES } from "@/lib/opportunity-view";
import { cloneToNextCycle } from "@/lib/clone-cycle";
import { memberName, teamMembers } from "@/lib/team";
import { Panel, TabStrip, TableHead, Th, Td, EmptyState } from "@/components/ui-kit";
import {
  OPPORTUNITY_TYPES,
  TYPE_LABEL,
  URGENCY_CLASS,
  countdownLabel,
  formatDate,
  labelize,
  urgencyOf,
} from "@/lib/program";
import type { OpportunityType } from "@/lib/program";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Download, ExternalLink, Search } from "lucide-react";
import {
  CLIENT_APPROVALS,
  downloadCsv,
  opportunitiesToCsv,
} from "@/lib/budget";

const TABS = ["tracked", "review", "closed"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/opportunities")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => {
    const value = String(search["tab"] ?? "");
    return (TABS as readonly string[]).includes(value) ? { tab: value as Tab } : {};
  },
  head: () => ({
    meta: [
      { title: "Opportunities — Thyme Care Speaking & Awards" },
      {
        name: "description",
        content:
          "Every speaking and award opportunity we track, plus newly found programs waiting for a yes or no.",
      },
      { property: "og:title", content: "Opportunities — Thyme Care Speaking & Awards" },
      {
        property: "og:description",
        content: "One list of awards and speaking opportunities, sorted by what is due next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpportunitiesPage,
});

function OpportunitiesPage() {
  const { tab = "tracked" } = Route.useSearch();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: opportunities = [], isLoading } = useOpportunities();
  const { data: submissions = [] } = useSubmissions();
  const { data: discoveries = [] } = useDiscoveries();
  const { data: taxonomy = [] } = useTaxonomy();
  const { data: profiles = [] } = useProfiles();
  const team = teamMembers(profiles);

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [tier, setTier] = useState("all");
  const [cloningId, setCloningId] = useState<string | null>(null);

  async function cloneCycle(opportunityId: string) {
    setCloningId(opportunityId);
    const { id, error, year } = await cloneToNextCycle(opportunityId);
    setCloningId(null);
    if (!id) {
      toast.error(error ?? "Could not clone this opportunity");
      return;
    }
    invalidate(["opportunities"]);
    toast.success(`${year} edition created — dates carried over and unconfirmed`);
    navigate({ to: "/opportunities/$id", params: { id } });
  }

  const submissionFor = (opportunityId: string) =>
    submissions.find((s) => s.opportunity_id === opportunityId) ?? null;

  const statusOptions = useMemo(() => {
    const list = optionsFor(taxonomy, "status", type === "all" ? undefined : type);
    const seen = new Set<string>();
    return list.filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)));
  }, [taxonomy, type]);

  const reviewQueue = discoveries.filter((d) => d.status === "new" || d.status === "researching");

  const rows = useMemo(() => {
    const far = "9999-12-31";
    return opportunities
      .filter((o) => (tab === "closed" ? isClosed(o.status) : !isClosed(o.status)))
      .filter((o) => {
        if (type !== "all" && o.type !== type) return false;
        if (status !== "all" && o.status !== status) return false;
        if (tier !== "all" && String(o.tier ?? "") !== tier) return false;
        if (!q) return true;
        const hay = [o.name, o.organizer, o.category, o.region, o.owner_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => (bestDeadline(a) ?? far).localeCompare(bestDeadline(b) ?? far));
  }, [opportunities, tab, type, status, tier, q]);

  async function markNotPursuing(id: string, name: string) {
    const { error } = await supabase
      .from("opportunities")
      .update({ status: "passed" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`“${name}” marked as not pursuing`);
    invalidate(["opportunities"]);
  }

  async function startSubmission(opportunityId: string, name: string) {
    const { id, error } = await ensureSubmission(opportunityId, name);
    if (!id) {
      toast.error(error ?? "Could not start a submission");
      return;
    }
    invalidate(["submissions"]);
    navigate({ to: "/submissions/$id", params: { id } });
  }

  async function dismissDiscovery(id: string) {
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

  async function markPromoted(discoveryId: string, opportunityId: string) {
    await supabase
      .from("discoveries")
      .update({ status: "promoted", promoted_opportunity_id: opportunityId } as never)
      .eq("id", discoveryId);
    invalidate(["discoveries", "opportunities"]);
    navigate({ to: "/opportunities/$id", params: { id: opportunityId } });
  }

  const open = opportunities.filter((o) => !isClosed(o.status)).length;
  const closed = opportunities.length - open;

  async function setOwner(id: string, ownerId: string) {
    const profile = team.find((p) => p.id === ownerId) ?? null;
    const { error } = await supabase
      .from("opportunities")
      .update({
        owner_id: profile?.id ?? null,
        owner_name: profile ? memberName(profile) : null,
      } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["opportunities"]);
  }

  async function setApproval(id: string, value: string) {
    const { error } = await supabase
      .from("opportunities")
      .update({ client_approval: value } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["opportunities"]);
  }

  function exportCsv() {
    if (rows.length === 0) {
      toast.error("Nothing to export with these filters");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`thyme-care-opportunities-${stamp}.csv`, opportunitiesToCsv(rows));
    toast.success(`Exported ${rows.length} opportunities`);
  }

  async function setStage(id: string, stage: string) {
    const { error } = await supabase
      .from("opportunities")
      .update({ application_stage: stage || null } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    invalidate(["opportunities"]);
  }

  return (
    <AppShell
      title="Opportunities"
      eyebrow={
        <>
          <span className="tracking-[0.12em] uppercase">Master database</span>
          <span className="text-border">/</span>
          <span>
            {opportunities.length} records · {open} open · {reviewQueue.length} awaiting triage
          </span>
        </>
      }
      subtitle="Every award and speaking program we track, sorted by what is due next."
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <NewOpportunityDialog />
        </div>
      }
    >
      <TabStrip
        value={tab}
        onChange={(key) => navigate({ to: "/opportunities", search: { tab: key } })}
        tabs={[
          { key: "tracked" as Tab, label: "Open", count: open },
          { key: "review" as Tab, label: "To review", count: reviewQueue.length },
          { key: "closed" as Tab, label: "Closed", count: closed },
        ]}
        className="mb-4"
      />

      {tab === "review" ? (
        <ReviewList items={reviewQueue} onDismiss={dismissDiscovery} onPromoted={markPromoted} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search opportunities…"
                className="h-9 w-72 pl-8 text-[13px]"
              />
            </div>
            <Select
              value={type}
              onChange={(v) => {
                setType(v);
                setStatus("all");
              }}
              options={[
                { value: "all", label: "Awards & speaking" },
                ...OPPORTUNITY_TYPES.map((t) => ({
                  value: t,
                  label: TYPE_LABEL[t] ?? labelize(t),
                })),
              ]}
            />
            <Select
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "Any status" },
                ...statusOptions.map((o) => ({ value: o.value, label: o.label })),
              ]}
            />
            <Select
              value={tier}
              onChange={setTier}
              options={[
                { value: "all", label: "Any priority" },
                { value: "1", label: "Tier 1" },
                { value: "2", label: "Tier 2" },
                { value: "3", label: "Tier 3" },
              ]}
            />
            <span className="ml-auto tabnum text-[12px] text-muted-foreground">
              {rows.length} shown
            </span>
          </div>

          {isLoading ? (
            <p className="text-[13px] text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState title="Nothing matches these filters">
              Clear the filters, or add an opportunity with the button above.
            </EmptyState>
          ) : (
            <Panel bodyClassName="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-[13px]">
                <TableHead>
                  <tr>
                    <Th className="w-[34%]">Opportunity</Th>
                    <Th className="w-20">Type</Th>
                    <Th className="w-36">Status</Th>
                    <Th className="w-28">Deadline</Th>
                    <Th className="w-24 text-right">Countdown</Th>
                    <Th className="w-16">Tier</Th>
                    <Th className="w-28">Owner</Th>
                    <Th className="w-36">Client approval</Th>
                    <Th className="w-32">Application</Th>
                    <Th className="w-32 text-right">Action</Th>
                  </tr>
                </TableHead>
                <tbody className="divide-y divide-border/70">
                  {rows.map((o) => {
                    const deadline = bestDeadline(o);
                    const submission = submissionFor(o.id);
                    return (
                      <tr key={o.id} className="group transition-colors hover:bg-surface-2/70">
                        <Td>
                          <div className="flex items-center gap-2">
                            <Link
                              to="/opportunities/$id"
                              params={{ id: o.id }}
                              className="truncate font-medium hover:text-primary hover:underline"
                            >
                              {o.name}
                            </Link>
                            {o.change_detected ? (
                              <span
                                title="The program page changed since we last checked"
                                className="inline-flex shrink-0 items-center gap-1 text-[11px] text-warning-foreground"
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            ) : null}
                          </div>
                          {o.organizer ? (
                            <div className="truncate text-[11.5px] text-muted-foreground">
                              {o.organizer}
                            </div>
                          ) : null}
                        </Td>
                        <Td className="text-[12px] text-muted-foreground">
                          {TYPE_LABEL[o.type] ?? labelize(o.type)}
                        </Td>
                        <Td>
                          <StatusBadge status={o.status} type={o.type} />
                        </Td>
                        <Td className="tabnum text-[12px] text-muted-foreground">
                          {formatDate(deadline)}
                        </Td>
                        <Td className="text-right">
                          {o.deadline_type === "rolling" ? (
                            <Chip tone="info">Rolling</Chip>
                          ) : (
                            <span
                              className={cn(
                                "tabnum text-[12px]",
                                URGENCY_CLASS[urgencyOf(deadline)],
                              )}
                            >
                              {countdownLabel(deadline)}
                            </span>
                          )}
                        </Td>
                        <Td>
                          <TierChip tier={o.tier} />
                        </Td>
                        <Td>
                          <select
                            value={o.owner_id ?? ""}
                            onChange={(e) => setOwner(o.id, e.target.value)}
                            className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-[12px] hover:border-border focus:border-border"
                          >
                            <option value="">Unassigned</option>
                            {team.map((p) => (
                              <option key={p.id} value={p.id}>
                                {memberName(p)}
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td>
                          <select
                            value={o.client_approval ?? "needs_approval"}
                            onChange={(e) => setApproval(o.id, e.target.value)}
                            className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-[12px] hover:border-border focus:border-border"
                          >
                            {CLIENT_APPROVALS.map((a) => (
                              <option key={a.value} value={a.value}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td>

                          <select
                            value={o.application_stage ?? ""}
                            onChange={(e) => setStage(o.id, e.target.value)}
                            className="h-7 w-full rounded border border-transparent bg-transparent px-1 text-[12px] hover:border-border focus:border-border"
                          >
                            <option value="">—</option>
                            {APPLICATION_STAGES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </Td>

                        <Td className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3 opacity-70 transition-opacity group-hover:opacity-100">
                            {submission ? (
                              <Link
                                to="/submissions/$id"
                                params={{ id: submission.id }}
                                className="text-[12px] font-medium text-primary hover:underline"
                              >
                                Open
                              </Link>
                            ) : tab === "closed" ? null : (
                              <button
                                onClick={() => startSubmission(o.id, o.name)}
                                className="text-[12px] font-medium text-primary hover:underline"
                              >
                                Start
                              </button>
                            )}
                            {tab === "closed" ? (
                              <button
                                onClick={() => cloneCycle(o.id)}
                                disabled={cloningId === o.id}
                                className="text-[12px] font-medium text-primary hover:underline disabled:opacity-60"
                              >
                                {cloningId === o.id ? "Cloning…" : "Clone to next cycle"}
                              </button>
                            ) : (
                              <button
                                onClick={() => markNotPursuing(o.id, o.name)}
                                className="text-[12px] text-muted-foreground hover:text-critical"
                              >
                                Pass
                              </button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
    </AppShell>
  );
}

/** Newly found programs awaiting a yes/no from the team. */
function ReviewList({
  items,
  onDismiss,
  onPromoted,
}: {
  items: ReturnType<typeof useDiscoveries>["data"] extends (infer T)[] | undefined ? T[] : never;
  onDismiss: (id: string) => void;
  onPromoted: (discoveryId: string, opportunityId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-[13px] text-muted-foreground">
          Nothing new to review. Run an opportunity search to look for more.
        </p>
        <Link
          to="/discover"
          className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline"
        >
          Search for new opportunities →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Link to="/discover" className="text-[12px] text-primary hover:underline">
          Search for more opportunities →
        </Link>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {items.map((d) => (
          <li key={d.id} className="px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[14px] font-medium">{d.name}</h3>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {[
                    d.type ? labelize(d.type) : null,
                    d.organizer,
                    d.estimated_deadline
                      ? `deadline ${formatDate(d.estimated_deadline)}`
                      : "deadline TBD",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-foreground/80">
                  {d.rationale ?? d.description}
                </p>
                {d.source_url ? (
                  <a
                    href={d.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    View program page <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <NewOpportunityDialog
                  defaults={{
                    name: d.name,
                    organizer: d.organizer ?? "",
                    url: d.source_url ?? "",
                    application_url: d.application_url ?? "",
                    type: (d.type ?? "award") as OpportunityType,
                    description: d.description ?? "",
                    discoveryId: d.id,
                    deadline: d.estimated_deadline ?? "",
                    event_date: d.event_date ?? "",
                    category: d.categories?.[0] ?? "",
                    region: d.region ?? "",
                  }}
                  onCreated={(oppId) => onPromoted(d.id, oppId)}
                  trigger={
                    <Button size="sm" className="h-8 text-[12px]">
                      Track this
                    </Button>
                  }
                />
                <button
                  onClick={() => onDismiss(d.id)}
                  className="text-[12px] text-muted-foreground hover:text-critical"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border bg-surface px-2 text-[13px] text-foreground"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
