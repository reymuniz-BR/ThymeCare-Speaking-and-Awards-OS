import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Chip } from "@/components/chip";
import {
  useBriefItems,
  useDiscoveries,
  useMonitoringChecks,
  useOpportunities,
  useOpportunityChanges,
  useProfiles,
  useSaveBriefItem,
  useSubmissions,
} from "@/lib/hooks";
import {
  SECTION_TITLE,
  buildBrief,
  groupEntries,
  weekRangeLabel,
  weekStartOf,
  type BriefEntry,
  type BriefSection,
} from "@/lib/brief";
import { formatDate } from "@/lib/program";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, CheckCircle2, ChevronDown, ChevronRight, Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SECTION_ORDER: BriefSection[] = ["changed", "action", "new", "pursue", "results"];

const SECTION_HINT: Record<BriefSection, string> = {
  changed: "Detected by deadline monitoring and the activity trail since Monday",
  action: "Grouped by deadline pressure and open review work",
  new: "Discovered opportunities not currently in the tracker",
  pursue: "Ranked by strategic fit: tier, priority, recommendation and timing",
  results: "Submitted, accepted, finalist, won, declined or not selected in the last 60 days",
};

type SavedItem = {
  reviewed: boolean;
  follow_up_note: string | null;
  follow_up_owner_id: string | null;
  follow_up_due: string | null;
  follow_up_done: boolean;
  owner?: { full_name: string | null } | null;
};

function FollowUpPopover({
  entry,
  saved,
  profiles,
  onSave,
}: {
  entry: BriefEntry;
  saved: SavedItem | undefined;
  profiles: { id: string; full_name: string | null }[];
  onSave: (patch: {
    followUpNote: string | null;
    followUpOwnerId: string | null;
    followUpDue: string | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(saved?.follow_up_note ?? "");
  const [owner, setOwner] = useState(saved?.follow_up_owner_id ?? "");
  const [due, setDue] = useState(saved?.follow_up_due ?? "");
  const hasAction = !!saved?.follow_up_note || !!saved?.follow_up_owner_id;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Assign a follow-up action"
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[11px] whitespace-nowrap",
            hasAction
              ? "border-primary/40 bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Flag className="h-3 w-3" />
          {hasAction ? "Follow-up" : "Assign"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-3">
        <div className="text-[12px] font-medium">Follow-up action</div>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What needs to happen next?"
          className="text-[13px]"
        />
        <Select
          value={owner || "unassigned"}
          onValueChange={(v) => setOwner(v === "unassigned" ? "" : v)}
        >
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name ?? "Teammate"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="h-8 text-[12px]"
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave({
                followUpNote: note.trim() || null,
                followUpOwnerId: owner || null,
                followUpDue: due || null,
              });
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{entry.title}</p>
      </PopoverContent>
    </Popover>
  );
}

function EntryRow({
  entry,
  saved,
  profiles,
  onReview,
  onFollowUp,
}: {
  entry: BriefEntry;
  saved: SavedItem | undefined;
  profiles: { id: string; full_name: string | null }[];
  onReview: (reviewed: boolean) => void;
  onFollowUp: (patch: {
    followUpNote: string | null;
    followUpOwnerId: string | null;
    followUpDue: string | null;
  }) => void;
}) {
  const reviewed = saved?.reviewed ?? false;
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-2.5",
        reviewed && "bg-muted/40 text-muted-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => onReview(!reviewed)}
        title={reviewed ? "Mark not reviewed" : "Mark reviewed"}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
          reviewed
            ? "border-success bg-success/15 text-success"
            : "border-border hover:border-foreground",
        )}
      >
        {reviewed ? <Check className="h-3 w-3" /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {entry.opportunityId ? (
            <Link
              to="/opportunities/$id"
              params={{ id: entry.opportunityId }}
              className={cn(
                "text-[13px] font-medium hover:text-primary hover:underline",
                reviewed && "line-through",
              )}
            >
              {entry.title}
            </Link>
          ) : entry.discoveryId ? (
            <Link
              to="/discover"
              className={cn(
                "text-[13px] font-medium hover:text-primary hover:underline",
                reviewed && "line-through",
              )}
            >
              {entry.title}
            </Link>
          ) : (
            <span className={cn("text-[13px] font-medium", reviewed && "line-through")}>
              {entry.title}
            </span>
          )}
          {entry.submissionId ? (
            <Link
              to="/submissions/$id"
              params={{ id: entry.submissionId }}
              className="text-[11px] text-primary hover:underline"
            >
              Open draft
            </Link>
          ) : null}
        </div>
        {entry.detail ? (
          <div className="mt-0.5 text-[12px] text-muted-foreground">{entry.detail}</div>
        ) : null}
        {entry.meta ? (
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/80">
            {entry.meta}
          </div>
        ) : null}
        {saved?.follow_up_note || saved?.follow_up_owner_id ? (
          <div className="mt-1 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] text-foreground">
            <span className="font-medium">Follow-up:</span> {saved.follow_up_note ?? "Assigned"}
            {saved.owner?.full_name ? ` · ${saved.owner.full_name}` : ""}
            {saved.follow_up_due ? ` · due ${formatDate(saved.follow_up_due)}` : ""}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Chip tone={entry.tone}>{entry.badge ?? entry.group}</Chip>
        <FollowUpPopover entry={entry} saved={saved} profiles={profiles} onSave={onFollowUp} />
      </div>
    </li>
  );
}

export function WeeklyBrief() {
  const [weekStart] = useState(() => weekStartOf());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hideReviewed, setHideReviewed] = useState(false);

  const { data: opportunities = [], isLoading } = useOpportunities();
  const { data: submissions = [] } = useSubmissions();
  const { data: discoveries = [] } = useDiscoveries();
  const { data: changes = [] } = useOpportunityChanges();
  const { data: checks = [] } = useMonitoringChecks(undefined, 400);
  const { data: profiles = [] } = useProfiles();
  const { data: savedItems = [] } = useBriefItems(weekStart);
  const save = useSaveBriefItem();

  const entries = useMemo(
    () => buildBrief({ weekStart, opportunities, changes, checks, discoveries, submissions }),
    [weekStart, opportunities, changes, checks, discoveries, submissions],
  );

  const savedByKey = useMemo(() => {
    const m = new Map<string, SavedItem>();
    for (const s of savedItems) m.set(s.item_key, s as unknown as SavedItem);
    return m;
  }, [savedItems]);

  const reviewedCount = entries.filter((e) => savedByKey.get(e.key)?.reviewed).length;

  const persist = (entry: BriefEntry, extra: Record<string, unknown>) =>
    save.mutate(
      {
        weekStart,
        itemKey: entry.key,
        section: entry.section,
        title: entry.title,
        opportunityId: entry.opportunityId ?? null,
        discoveryId: entry.discoveryId ?? null,
        submissionId: entry.submissionId ?? null,
        ...extra,
      } as never,
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save") },
    );

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold">Weekly Program Brief</h2>
          <p className="text-[11px] text-muted-foreground">
            Week of {weekRangeLabel(weekStart)} · {entries.length} items · {reviewedCount} reviewed
          </p>
        </div>
        <div className="flex items-center gap-2">
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
          <button
            type="button"
            onClick={() => setHideReviewed((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px]",
              hideReviewed
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CheckCircle2 className="h-3 w-3" />
            Hide reviewed
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
          Building brief…
        </div>
      ) : (
        <div className="divide-y divide-border">
          {SECTION_ORDER.map((section) => {
            const groups = groupEntries(entries, section)
              .map((g) => ({
                ...g,
                items: hideReviewed
                  ? g.items.filter((i) => !savedByKey.get(i.key)?.reviewed)
                  : g.items,
              }))
              .filter((g) => g.items.length > 0);
            const total = groups.reduce((n, g) => n + g.items.length, 0);

            return (
              <div key={section}>
                <div className="flex items-baseline justify-between gap-3 bg-muted/40 px-4 py-2">
                  <h3 className="text-[11px] font-semibold tracking-wide uppercase">
                    {SECTION_TITLE[section]}
                  </h3>
                  <span className="text-[11px] text-muted-foreground">{total}</span>
                </div>
                <p className="px-4 pt-1.5 text-[11px] text-muted-foreground">
                  {SECTION_HINT[section]}
                </p>

                {total === 0 ? (
                  <p className="px-4 py-4 text-[12px] text-muted-foreground">
                    Nothing to report in this section.
                  </p>
                ) : (
                  groups.map((g) => {
                    const key = `${section}:${g.group}`;
                    const isCollapsed = collapsed[key] ?? false;
                    return (
                      <div key={key} className="mt-1">
                        <button
                          type="button"
                          onClick={() => setCollapsed((c) => ({ ...c, [key]: !isCollapsed }))}
                          className="flex w-full items-center gap-1.5 px-4 py-1.5 text-left text-[12px] font-medium hover:bg-muted/40"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {g.group}
                          <span className="text-muted-foreground">({g.items.length})</span>
                        </button>
                        {isCollapsed ? null : (
                          <ul className="divide-y divide-border/60 border-t border-border/60">
                            {g.items.map((entry) => (
                              <EntryRow
                                key={entry.key}
                                entry={entry}
                                saved={savedByKey.get(entry.key)}
                                profiles={profiles}
                                onReview={(reviewed) => persist(entry, { reviewed })}
                                onFollowUp={(patch) => persist(entry, patch)}
                              />
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
