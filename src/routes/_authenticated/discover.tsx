import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/chip";
import { countdownLabel, daysUntil } from "@/lib/program";
import { NewOpportunityDialog } from "@/components/new-opportunity-dialog";
import { useDiscoveries, useInvalidate, useOpportunities } from "@/lib/hooks";
import { discoverOpportunities } from "@/lib/ai.functions";
import { formatDate, labelize } from "@/lib/program";
import type { ChipTone, DiscoveryRow, OpportunityType } from "@/lib/program";
import { FOCUS_AREAS, findDuplicate, DUPLICATE_SUSPECTED } from "@/lib/discovery";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CopyCheck, ExternalLink, Library, Loader2, Search, Sparkles, X } from "lucide-react";
import { ContentMatchDialog } from "@/components/content-match-dialog";
import { attachmentNote } from "@/lib/content-match";
import type { AttachedContent } from "@/lib/content-match";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({
    meta: [
      { title: "Discover — Opportunity Discovery Inbox" },
      {
        name: "description",
        content:
          "AI-assisted discovery of healthcare technology awards, leadership lists, rankings and calls for speakers, de-duplicated against the tracker and triaged in an inbox.",
      },
      { property: "og:title", content: "Discover — Thyme Care Speaking & Awards OS" },
      {
        property: "og:description",
        content:
          "Surface credible new awards and speaking opportunities that are not already in the Opportunities database.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DiscoverPage,
});

const PRESETS: { label: string; brief: string }[] = [
  {
    label: "Awards & rankings",
    brief:
      "Healthcare, digital health and health technology company awards, innovation awards and industry rankings with submission deadlines in the next 9 months.",
  },
  {
    label: "Calls for speakers",
    brief:
      "Open calls for speakers, speaker nominations and conference programming opportunities at US healthcare, payer, provider and digital health conferences.",
  },
  {
    label: "Executive & leadership lists",
    brief:
      "Executive awards, healthcare leadership lists and 'most influential' rankings recognizing individual healthcare technology executives.",
  },
  {
    label: "Fast-growth lists",
    brief:
      "Fast-growth and high-performing company lists open to venture-backed healthcare technology and value-based care companies.",
  },
  {
    label: "Oncology & value-based care",
    brief:
      "Awards, rankings and speaking opportunities focused on oncology and cancer care, value-based care and employer healthcare innovation.",
  },
];

type Status = "new" | "researching" | "reviewed" | "promoted" | "dismissed" | "duplicate";

const STATUS_TONE: Record<Status, ChipTone> = {
  new: "primary",
  researching: "warning",
  reviewed: "info",
  promoted: "success",
  dismissed: "neutral",
  duplicate: "neutral",
};

const CONFIDENCE_TONE: Record<string, ChipTone> = {
  high: "success",
  medium: "warning",
  low: "neutral",
};

/** Library material previously attached to a candidate, stored on raw_extract. */
function attachmentsOf(d: DiscoveryRow): AttachedContent[] {
  const raw = d.raw_extract as { attached_content?: AttachedContent[] } | null;
  return Array.isArray(raw?.attached_content) ? raw.attached_content : [];
}

function DiscoverPage() {
  const { data: discoveries = [], isLoading } = useDiscoveries();
  const { data: opportunities = [] } = useOpportunities();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const [brief, setBrief] = useState<string>(PRESETS[0]!.brief);
  const [focus, setFocus] = useState<string[]>(FOCUS_AREAS);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"inbox" | "researching" | "resolved" | "all">("inbox");
  const [dupTarget, setDupTarget] = useState<{ id: string; name: string } | null>(null);
  const [matchTarget, setMatchTarget] = useState<DiscoveryRow | null>(null);

  const counts = useMemo(() => {
    const c = { new: 0, researching: 0, resolved: 0 } as Record<string, number>;
    for (const d of discoveries) {
      if (d.status === "new") c["new"]! += 1;
      else if (d.status === "researching") c["researching"]! += 1;
      else c["resolved"]! += 1;
    }
    return c;
  }, [discoveries]);

  const rows = useMemo(() => {
    const filtered = discoveries.filter((d) => {
      if (tab === "all") return true;
      if (tab === "inbox") return d.status === "new";
      if (tab === "researching") return d.status === "researching";
      return d.status !== "new" && d.status !== "researching";
    });
    return filtered.map((d) => ({
      row: d,
      // Live duplicate check against the current tracker, in case the program
      // was added to Opportunities after this candidate was discovered.
      match: findDuplicate(
        { name: d.name, source_url: d.source_url, application_url: d.application_url },
        opportunities.map((o) => ({
          id: o.id,
          name: o.name,
          url: o.url,
          application_url: o.application_url,
          organizer: o.organizer,
        })),
      ),
    }));
  }, [discoveries, opportunities, tab]);

  async function run() {
    setRunning(true);
    try {
      const result = await discoverOpportunities({
        data: {
          brief,
          focus,
          existing: opportunities.map((o) => ({
            id: o.id,
            name: o.name,
            url: o.url,
            application_url: o.application_url,
            organizer: o.organizer,
          })),
        },
      });
      invalidate(["discoveries"]);
      if (result.added === 0) {
        toast.info(
          result.suppressed
            ? `No new candidates — ${result.suppressed} matched programs already known.`
            : "No new candidates found for that brief.",
        );
      } else {
        toast.success(
          `${result.added} candidate${result.added === 1 ? "" : "s"} in the inbox from ${result.agents} research agents` +
            (result.suppressed
              ? ` · ${result.suppressed} duplicate${result.suppressed === 1 ? "" : "s"} filtered`
              : "") +
            (result.flagged ? ` · ${result.flagged} flagged as possible duplicates` : ""),
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Discovery run failed");
    } finally {
      setRunning(false);
    }
  }

  async function patch(id: string, values: Record<string, unknown>) {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("discoveries")
      .update({ reviewed_by: userData.user?.id ?? null, ...values } as never)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return false;
    }
    invalidate(["discoveries"]);
    return true;
  }

  async function markPromoted(discoveryId: string, opportunityId: string) {
    await patch(discoveryId, { status: "promoted", promoted_opportunity_id: opportunityId });
    invalidate(["opportunities"]);
    navigate({ to: "/opportunities/$id", params: { id: opportunityId } });
  }

  /** Persist attached library material on the candidate's raw_extract payload. */
  async function saveAttachments(discovery: DiscoveryRow, items: AttachedContent[]) {
    const raw = (discovery.raw_extract as Record<string, unknown> | null) ?? {};
    const ok = await patch(discovery.id, {
      raw_extract: { ...raw, attached_content: items },
    });
    if (ok)
      toast.success(
        items.length
          ? `${items.length} library item${items.length === 1 ? "" : "s"} attached`
          : "Attachments cleared",
      );
  }

  return (
    <AppShell title="Discover" subtitle={`${counts["new"]} candidates in the discovery inbox`}>
      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <section className="h-fit rounded-md border border-border bg-surface p-4">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Opportunity search
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Candidates are checked against the tracker on name, domain and approximate title before
            they reach the inbox. Nothing is added to Opportunities automatically.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setBrief(p.brief)}
                className={cn(
                  "rounded border px-2 py-1 text-[11px]",
                  brief === p.brief
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Textarea
            rows={5}
            className="mt-2 text-[13px]"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />

          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-medium">
              Focus areas ({focus.length}/{FOCUS_AREAS.length})
            </summary>
            <div className="mt-2 flex flex-wrap gap-1">
              {FOCUS_AREAS.map((f) => {
                const on = focus.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() =>
                      setFocus((cur) => (on ? cur.filter((c) => c !== f) : [...cur, f]))
                    }
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      on
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </details>

          <Button className="mt-3 w-full" onClick={run} disabled={running || brief.length < 3}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {running ? "Searching…" : "Run discovery"}
          </Button>

          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-[12px] text-muted-foreground">
              Know one already? Add it straight to the database.
            </p>
            <NewOpportunityDialog
              trigger={
                <Button variant="outline" size="sm" className="w-full">
                  Add manually
                </Button>
              }
            />
          </div>
        </section>

        <section className="rounded-md border border-border bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Discovery inbox</h2>
            <div className="flex rounded border border-border p-0.5 text-[12px]">
              {(
                [
                  ["inbox", `Inbox (${counts["new"]})`],
                  ["researching", `Researching (${counts["researching"]})`],
                  ["resolved", `Resolved (${counts["resolved"]})`],
                  ["all", "All"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "rounded px-2 py-0.5",
                    tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>

          <ul className="divide-y divide-border/60">
            {isLoading ? (
              <li className="px-4 py-10 text-center text-[13px] text-muted-foreground">Loading…</li>
            ) : rows.length === 0 ? (
              <li className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                Nothing here. Run a discovery search to surface new candidates.
              </li>
            ) : (
              rows.map(({ row: d, match }) => {
                const suspected =
                  d.status === "new" && match && match.score >= DUPLICATE_SUSPECTED ? match : null;
                const active = d.status === "new" || d.status === "researching";
                const attachedItems = attachmentsOf(d);

                return (
                  <li key={d.id} className="px-4 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[13px] font-semibold">{d.name}</h3>
                          {d.type ? <Chip tone="neutral">{labelize(d.type)}</Chip> : null}
                          <Chip
                            tone={
                              (d.relevance_score ?? 0) >= 75
                                ? "success"
                                : (d.relevance_score ?? 0) >= 50
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {d.relevance_score ?? "—"} fit
                          </Chip>
                          <Chip tone={CONFIDENCE_TONE[d.confidence] ?? "neutral"}>
                            {labelize(d.confidence)} confidence
                          </Chip>
                          {d.estimated_deadline ? (
                            <Chip tone={URGENCY_CHIP_TONE(d.estimated_deadline)}>
                              {countdownLabel(d.estimated_deadline)}
                            </Chip>
                          ) : (
                            <Chip tone="neutral">Deadline TBD</Chip>
                          )}
                          {d.status !== "new" ? (
                            <Chip tone={STATUS_TONE[d.status as Status] ?? "neutral"}>
                              {labelize(d.status)}
                            </Chip>
                          ) : null}
                        </div>

                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                          {d.description}
                        </p>
                        {d.rationale ? (
                          <p className="mt-1 text-[12px] text-foreground/80">
                            <span className="font-medium">Why it may fit:</span> {d.rationale}
                          </p>
                        ) : null}
                        {d.categories?.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {d.categories.map((c) => (
                              <Chip key={c} tone="info">
                                {c}
                              </Chip>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {d.organizer ? <span>{d.organizer}</span> : null}
                          {d.region ? <span>{d.region}</span> : null}
                          {d.event_date ? <span>Event {formatDate(d.event_date)}</span> : null}
                          <span>
                            Deadline{" "}
                            {d.estimated_deadline ? formatDate(d.estimated_deadline) : "TBD"}
                          </span>
                          <span>Discovered {formatDate(d.created_at)}</span>
                          <span>via {labelize(d.source)}</span>
                          {d.source_url ? (
                            <a
                              href={d.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              Source <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                          {d.application_url ? (
                            <a
                              href={d.application_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              Apply <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>

                        {suspected ? (
                          <p className="mt-2 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-foreground">
                            Possible duplicate of{" "}
                            <Link
                              to="/opportunities/$id"
                              params={{ id: suspected.id }}
                              className="font-medium text-primary hover:underline"
                            >
                              {suspected.name}
                            </Link>{" "}
                            — {suspected.reason}.
                          </p>
                        ) : null}
                        {attachedItems.length ? (
                          <div className="mt-2 rounded border border-border bg-surface-2 px-2 py-1.5">
                            <p className="text-[11px] font-medium">
                              Attached source material ({attachedItems.length})
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {attachedItems.map((a) => (
                                <li
                                  key={`${a.kind}:${a.id}`}
                                  className="text-[11px] text-muted-foreground"
                                >
                                  •{" "}
                                  {a.url ? (
                                    <a
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-primary hover:underline"
                                    >
                                      {a.title}
                                    </a>
                                  ) : (
                                    a.title
                                  )}
                                  {a.subtitle ? ` — ${a.subtitle}` : ""}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {d.research_notes ? (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            <span className="font-medium">Notes:</span> {d.research_notes}
                          </p>
                        ) : null}

                        {d.promoted_opportunity_id ? (
                          <Link
                            to="/opportunities/$id"
                            params={{ id: d.promoted_opportunity_id }}
                            className="mt-1.5 inline-block text-[11px] text-primary hover:underline"
                          >
                            Open tracked opportunity →
                          </Link>
                        ) : null}
                      </div>

                      {active ? (
                        <div className="flex shrink-0 flex-wrap gap-1.5 lg:flex-col">
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
                              fit_score: d.relevance_score ? String(d.relevance_score) : "",
                              source: `Discover · ${labelize(d.source)} · ${formatDate(d.created_at)}`,
                              notes: [
                                `Discovered ${formatDate(d.created_at)} via ${labelize(d.source)}.`,
                                d.source_url ? `Source: ${d.source_url}` : null,
                                d.rationale ? `Why it may fit: ${d.rationale}` : null,
                                d.research_notes,
                                attachmentNote(attachedItems),
                              ]
                                .filter(Boolean)
                                .join("\n"),
                            }}
                            onCreated={(oppId) => markPromoted(d.id, oppId)}
                            trigger={
                              <Button size="sm" className="h-7 text-[12px]">
                                Add to program
                              </Button>
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[12px]"
                            onClick={() => setMatchTarget(d)}
                          >
                            <Library className="h-3.5 w-3.5" />
                            {attachedItems.length
                              ? `Content (${attachedItems.length})`
                              : "Find content"}
                          </Button>

                          {d.status === "new" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[12px]"
                              onClick={() => patch(d.id, { status: "researching" })}
                            >
                              Research further
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[12px]"
                              onClick={() => patch(d.id, { status: "reviewed" })}
                            >
                              Mark reviewed
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[12px]"
                            onClick={() => setDupTarget({ id: d.id, name: d.name })}
                          >
                            <CopyCheck className="h-3.5 w-3.5" /> Mark duplicate
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[12px]"
                            onClick={() => patch(d.id, { status: "dismissed" })}
                          >
                            <X className="h-3.5 w-3.5" /> Dismiss
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 text-[12px]"
                          onClick={() => patch(d.id, { status: "new" })}
                        >
                          Reopen
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>

      <MarkDuplicateDialog
        target={dupTarget}
        onClose={() => setDupTarget(null)}
        options={opportunities.map((o) => ({ id: o.id, name: o.name, organizer: o.organizer }))}
        onConfirm={async (opportunityId) => {
          if (!dupTarget) return;
          const ok = await patch(dupTarget.id, {
            status: "duplicate",
            duplicate_of: opportunityId,
          });
          if (ok) toast.success("Marked as a duplicate of an existing opportunity");
          setDupTarget(null);
        }}
      />

      <ContentMatchDialog
        key={matchTarget?.id ?? "none"}
        open={Boolean(matchTarget)}
        onOpenChange={(open) => (!open ? setMatchTarget(null) : undefined)}
        attached={matchTarget ? attachmentsOf(matchTarget) : []}
        subject={
          matchTarget
            ? {
                name: matchTarget.name,
                description: matchTarget.description,
                organizer: matchTarget.organizer,
                region: matchTarget.region,
                type: matchTarget.type,
                categories: matchTarget.categories,
                rationale: matchTarget.rationale,
              }
            : null
        }
        onSave={async (items) => {
          if (matchTarget) await saveAttachments(matchTarget, items);
        }}
      />
    </AppShell>
  );
}

function MarkDuplicateDialog({
  target,
  options,
  onClose,
  onConfirm,
}: {
  target: { id: string; name: string } | null;
  options: { id: string; name: string; organizer: string | null }[];
  onClose: () => void;
  onConfirm: (opportunityId: string) => void;
}) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? options.filter(
          (o) =>
            o.name.toLowerCase().includes(term) || (o.organizer ?? "").toLowerCase().includes(term),
        )
      : options;
    return list.slice(0, 40);
  }, [options, q]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark as duplicate</DialogTitle>
          <DialogDescription>
            Link “{target?.name}” to the opportunity it duplicates. The candidate leaves the inbox
            and the match is recorded.
          </DialogDescription>
        </DialogHeader>
        <Label className="text-[12px]">Search tracked opportunities</Label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or organizer…" />
        <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded border border-border">
          {matches.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12px] text-muted-foreground">No matches.</li>
          ) : (
            matches.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => onConfirm(o.id)}
                  className="w-full px-3 py-2 text-left text-[12px] hover:bg-muted"
                >
                  <span className="font-medium">{o.name}</span>
                  {o.organizer ? (
                    <span className="text-muted-foreground"> · {o.organizer}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Chip tone based on how close a discovery deadline is. */
function URGENCY_CHIP_TONE(date: string) {
  const days = daysUntil(date);
  if (days === null) return "neutral" as const;
  if (days < 0) return "neutral" as const;
  if (days <= 14) return "critical" as const;
  if (days <= 45) return "warning" as const;
  return "info" as const;
}
