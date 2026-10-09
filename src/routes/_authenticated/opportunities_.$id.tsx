import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ensureSubmission } from "@/lib/submission-pipeline";
import { AppShell } from "@/components/app-shell";
import { Chip } from "@/components/chip";
import { AddToCalendar } from "@/components/add-to-calendar";
import {
  DEFAULT_TIMEZONE,
  TIMEZONE_LABELS,
  TIMEZONE_VALUES,
  buildIcs,
  deadlineTimeLabel,
  downloadIcs,
  slugify,
  type CalendarEvent,
} from "@/lib/calendar";
import { TabStrip } from "@/components/ui-kit";
import { NativeSelect } from "@/components/new-opportunity-dialog";
import { StatusBadge, TaxonomyChip, TaxonomySelect } from "@/components/taxonomy";
import { supabase } from "@/integrations/supabase/client";
import { useActivity, useInvalidate, useOpportunity, useProfiles } from "@/lib/hooks";
import {
  OPPORTUNITY_TYPES,
  STAGE_TONE,
  TYPE_LABEL,
  URGENCY_CLASS,
  countdownLabel,
  formatDate,
  formatDateTime,
  labelize,
  urgencyOf,
} from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CopyPlus, ExternalLink, Save } from "lucide-react";
import { MonitoringActivity } from "@/components/monitoring-panel";
import { APPLICATION_STAGES, isClosed } from "@/lib/opportunity-view";
import { cloneToNextCycle } from "@/lib/clone-cycle";
import { memberName, ownerLabel } from "@/lib/team";
import { CLIENT_APPROVALS, CLIENT_APPROVAL_LABEL } from "@/lib/budget";

export const Route = createFileRoute("/_authenticated/opportunities_/$id")({
  head: () => ({
    meta: [
      { title: "Opportunity detail — Thyme Care Speaking & Awards OS" },
      {
        name: "description",
        content:
          "All fields, deadlines, monitoring data, activity history and related submission materials for a tracked opportunity.",
      },
      { property: "og:title", content: "Opportunity detail — Thyme Care Speaking & Awards OS" },
      {
        property: "og:description",
        content: "Full record, timeline and submission history for this opportunity.",
      },
    ],
  }),
  component: OpportunityDetail,
});

type Draft = Record<string, unknown>;

type View = "overview" | "requirements" | "history";

function OpportunityDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data, isLoading } = useOpportunity(id);
  const { data: profiles = [] } = useProfiles();
  const { data: activity = [] } = useActivity(200);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [view, setView] = useState<View>("overview");

  useEffect(() => setDraft({}), [id]);

  if (isLoading) {
    return (
      <AppShell title="Opportunity">
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell title="Opportunity">
        <p className="text-[13px] text-muted-foreground">
          This opportunity no longer exists.{" "}
          <Link to="/opportunities" className="text-primary hover:underline">
            Back to list
          </Link>
        </p>
      </AppShell>
    );
  }

  const record = { ...(data as unknown as Record<string, unknown>), ...draft };
  const dirty = Object.keys(draft).length > 0;
  const val = (k: string) => (record[k] ?? "") as string;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const deadline = (record["final_deadline"] ?? record["early_deadline"]) as string | null;
  const history = activity.filter((a) => a.opportunity_id === id);
  const cutoffTime = ((record["deadline_time"] as string | null) ?? "").slice(0, 5) || null;
  const cutoffTz = (record["deadline_timezone"] as string | null) ?? DEFAULT_TIMEZONE;
  const cutoffLabel = deadlineTimeLabel(cutoffTime, cutoffTz);
  const oppName = (record["name"] as string | null) ?? "Opportunity";
  const oppUrl =
    ((record["application_url"] as string | null) ?? (record["url"] as string | null)) || null;

  function dateEvent(label: string, date: string | null, timed = false): CalendarEvent | undefined {
    if (!date) return undefined;
    return {
      uid: `${id}-${label.toLowerCase().replace(/\s+/g, "-")}@thymecare-awards-os`,
      title: `${label}: ${oppName}`,
      date,
      time: timed ? cutoffTime : null,
      timeZone: cutoffTz,
      description: oppUrl,
      url: oppUrl,
      reminderMinutes: timed ? 60 * 24 : undefined,
    };
  }

  async function save() {
    setSaving(true);
    const payload: Draft = {};
    Object.entries(draft).forEach(([k, v]) => (payload[k] = v === "" ? null : v));
    if ("owner_id" in payload) {
      const owner = profiles.find((p) => p.id === payload["owner_id"]);
      payload["owner_name"] = owner ? memberName(owner) : null;
    }
    const { error } = await supabase
      .from("opportunities")
      .update(payload as never)
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft({});
    invalidate(["opportunity", "opportunities", "activity"]);
    toast.success("Opportunity saved");
  }

  async function startSubmission() {
    const { id: submissionId, error } = await ensureSubmission(id, data!.name);
    if (!submissionId) {
      toast.error(error ?? "Could not open a submission");
      return;
    }
    invalidate(["submissions", "opportunity", "activity"]);
    navigate({ to: "/submissions/$id", params: { id: submissionId } });
  }

  async function cloneCycle() {
    setCloning(true);
    const { id: newId, error, year } = await cloneToNextCycle(id);
    setCloning(false);
    if (!newId) {
      toast.error(error ?? "Could not clone this opportunity");
      return;
    }
    invalidate(["opportunities", "opportunity", "activity"]);
    toast.success(`${year} edition created — dates carried over and unconfirmed`);
    navigate({ to: "/opportunities/$id", params: { id: newId } });
  }

  const profileOptions = ["", ...profiles.map((p) => p.id)];
  const profileLabels: Record<string, string> = { "": "Unassigned" };
  profiles.forEach((p) => (profileLabels[p.id] = p.full_name ?? p.email ?? "User"));

  return (
    <AppShell
      title={data.name}
      eyebrow={
        <>
          <Link to="/opportunities" className="hover:text-foreground hover:underline">
            Opportunities
          </Link>
          <span className="text-border">/</span>
          <span className="tracking-[0.12em] uppercase">
            {TYPE_LABEL[data.type] ?? labelize(data.type)}
          </span>
        </>
      }
      {...(data.organizer ? { subtitle: data.organizer } : {})}
      actions={
        <>
          {data.url ? (
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Source
            </a>
          ) : null}
          {isClosed(data.status) ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={cloning}
              onClick={cloneCycle}
            >
              <CopyPlus className="h-3.5 w-3.5" /> {cloning ? "Cloning…" : "Clone to next cycle"}
            </Button>
          ) : null}
          <Button size="sm" className="h-8" onClick={startSubmission}>
            {(data.submissions ?? []).length ? "Open submission" : "Start submission"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!dirty || saving}
            onClick={save}
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {/* Command summary */}
      <section className="rounded-lg border border-border bg-surface">
        <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x">
          <SummaryCell label="Status">
            <StatusBadge status={data.status} type={data.type} />
          </SummaryCell>
          <SummaryCell label="Deadline">
            <div className="flex items-center gap-2">
              <span className="tabnum text-[13px] font-medium">{formatDate(deadline)}</span>
              {deadline ? (
                <span className={cn("text-[11.5px]", URGENCY_CLASS[urgencyOf(deadline)])}>
                  {countdownLabel(deadline)}
                </span>
              ) : null}
            </div>
          </SummaryCell>
          <SummaryCell label="Priority">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="neutral">Tier {data.tier}</Chip>
              <TaxonomyChip kind="priority" value={data.priority} />
            </div>
          </SummaryCell>
          <SummaryCell label="Owner">
            <span className="text-[13px]">
              {ownerLabel(record["owner_id"] as string | null, profiles, data.owner_name)}
            </span>
          </SummaryCell>
          <SummaryCell label="Signals">
            <div className="flex flex-wrap items-center gap-1.5">
              <TaxonomyChip kind="deadline_type" value={data.deadline_type} />
              <TaxonomyChip kind="recommendation" value={data.recommendation} />
              {data.change_detected ? <Chip tone="warning">Change detected</Chip> : null}
            </div>
          </SummaryCell>
        </div>
      </section>

      <TabStrip
        value={view}
        onChange={setView}
        tabs={[
          { key: "overview" as View, label: "Overview" },
          { key: "requirements" as View, label: "Requirements & materials" },
          { key: "history" as View, label: "Monitoring & history" },
        ]}
        className="mt-5 mb-4"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <div className="space-y-4">
          {view === "overview" ? (
            <>
              <Panel title="Core information">
                <Grid>
                  <Field label="Opportunity name" wide>
                    <Input value={val("name")} onChange={(e) => set("name", e.target.value)} />
                  </Field>
                  <Field label="Opportunity type">
                    <NativeSelect
                      value={val("type")}
                      onChange={(v) => set("type", v)}
                      options={OPPORTUNITY_TYPES}
                      labels={TYPE_LABEL}
                    />
                  </Field>
                  <Field label="Organization / publisher">
                    <Input
                      value={val("organizer")}
                      onChange={(e) => set("organizer", e.target.value)}
                    />
                  </Field>
                  <Field label="Website URL">
                    <Input value={val("url")} onChange={(e) => set("url", e.target.value)} />
                  </Field>
                  <Field label="Application URL">
                    <Input
                      value={val("application_url")}
                      onChange={(e) => set("application_url", e.target.value)}
                    />
                  </Field>
                  <Field label="Event date">
                    <Input
                      type="date"
                      value={val("event_date")}
                      onChange={(e) => set("event_date", e.target.value)}
                    />
                  </Field>
                  <Field label="Publication / announcement date">
                    <Input
                      type="date"
                      value={val("announcement_date")}
                      onChange={(e) => set("announcement_date", e.target.value)}
                    />
                  </Field>
                  <Field label="Location">
                    <Input
                      value={val("location")}
                      onChange={(e) => set("location", e.target.value)}
                    />
                  </Field>
                  <Field label="Client approval">
                    <NativeSelect
                      value={String(val("client_approval") || "needs_approval")}
                      onChange={(v) => set("client_approval", v)}
                      options={CLIENT_APPROVALS.map((a) => a.value)}
                      labels={CLIENT_APPROVAL_LABEL}
                    />
                  </Field>
                  <Field label="Category / award category">
                    <Input
                      value={val("category")}
                      onChange={(e) => set("category", e.target.value)}
                    />
                  </Field>
                  <Field label="Audience">
                    <Input
                      value={val("audience")}
                      onChange={(e) => set("audience", e.target.value)}
                    />
                  </Field>
                  <Field label="Region">
                    <Input value={val("region")} onChange={(e) => set("region", e.target.value)} />
                  </Field>
                  <Field label="Opportunity owner">
                    <NativeSelect
                      value={val("owner_id")}
                      onChange={(v) => set("owner_id", v)}
                      options={profileOptions}
                      labels={profileLabels}
                    />
                  </Field>
                  <Field label="Description" wide>
                    <Textarea
                      rows={3}
                      value={val("description")}
                      onChange={(e) => set("description", e.target.value)}
                    />
                  </Field>
                </Grid>
              </Panel>

              <Panel title="Deadline information">
                <Grid>
                  <Field label="Application open date">
                    <Input
                      type="date"
                      value={val("open_date")}
                      onChange={(e) => set("open_date", e.target.value)}
                    />
                  </Field>
                  <Field label="Early deadline">
                    <Input
                      type="date"
                      value={val("early_deadline")}
                      onChange={(e) => set("early_deadline", e.target.value)}
                    />
                  </Field>
                  <Field label="Final submission deadline">
                    <Input
                      type="date"
                      value={val("final_deadline")}
                      onChange={(e) => set("final_deadline", e.target.value)}
                    />
                  </Field>
                  <Field label="Deadline cut-off time (optional)">
                    <Input
                      type="time"
                      value={val("deadline_time")?.slice(0, 5)}
                      onChange={(e) => set("deadline_time", e.target.value)}
                    />
                  </Field>
                  <Field label="Deadline time zone">
                    <NativeSelect
                      value={val("deadline_timezone") || DEFAULT_TIMEZONE}
                      onChange={(v) => set("deadline_timezone", v)}
                      options={TIMEZONE_VALUES}
                      labels={TIMEZONE_LABELS}
                    />
                  </Field>
                  <Field label="Deadline type">
                    <TaxonomySelect
                      kind="deadline_type"
                      value={val("deadline_type")}
                      onChange={(v) => set("deadline_type", v)}
                    />
                  </Field>
                  <Field label="Deadline source URL">
                    <Input
                      value={val("deadline_source_url")}
                      onChange={(e) => set("deadline_source_url", e.target.value)}
                    />
                  </Field>
                  <Field label="Deadline last verified">
                    <Input
                      type="date"
                      value={val("deadline_verified_at")}
                      onChange={(e) => set("deadline_verified_at", e.target.value)}
                    />
                  </Field>
                </Grid>
              </Panel>

              <Panel title="Program management" collapsible>
                <Grid>
                  <Field label="Status">
                    <TaxonomySelect
                      kind="status"
                      appliesTo={val("type")}
                      value={val("status")}
                      onChange={(v) => set("status", v)}
                    />
                  </Field>
                  <Field label="Priority">
                    <TaxonomySelect
                      kind="priority"
                      value={val("priority")}
                      onChange={(v) => set("priority", v)}
                    />
                  </Field>
                  <Field label="Strategic fit score (0–100)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={val("fit_score")}
                      onChange={(e) =>
                        set("fit_score", e.target.value ? Number(e.target.value) : "")
                      }
                    />
                  </Field>
                  <Field label="Recommendation">
                    <TaxonomySelect
                      kind="recommendation"
                      value={val("recommendation")}
                      onChange={(v) => set("recommendation", v)}
                    />
                  </Field>
                  <Field label="Submission owner">
                    <NativeSelect
                      value={val("submission_owner_id")}
                      onChange={(v) => set("submission_owner_id", v)}
                      options={profileOptions}
                      labels={profileLabels}
                    />
                  </Field>
                  <Field label="Tier">
                    <NativeSelect
                      value={String(record["tier"] ?? 2)}
                      onChange={(v) => set("tier", Number(v))}
                      options={["1", "2", "3"]}
                      labels={{ "1": "Tier 1", "2": "Tier 2", "3": "Tier 3" }}
                    />
                  </Field>
                  <Field label="Internal draft due">
                    <Input
                      type="date"
                      value={val("internal_draft_due")}
                      onChange={(e) => set("internal_draft_due", e.target.value)}
                    />
                  </Field>
                  <Field label="Client review due">
                    <Input
                      type="date"
                      value={val("client_review_due")}
                      onChange={(e) => set("client_review_due", e.target.value)}
                    />
                  </Field>
                  <Field label="Submission date">
                    <Input
                      type="date"
                      value={val("submission_date")}
                      onChange={(e) => set("submission_date", e.target.value)}
                    />
                  </Field>
                  <Field label="Outcome">
                    <TaxonomySelect
                      kind="outcome"
                      value={val("outcome")}
                      onChange={(v) => set("outcome", v)}
                      allowEmpty
                      emptyLabel="No outcome yet"
                    />
                  </Field>
                  <Field label="Notes" wide>
                    <Textarea
                      rows={4}
                      value={val("notes")}
                      onChange={(e) => set("notes", e.target.value)}
                      placeholder="Judging criteria, past feedback, internal decisions…"
                    />
                  </Field>
                </Grid>
              </Panel>
            </>
          ) : null}

          {view === "history" ? (
            <>
              <Panel title="Monitoring">
                <Grid>
                  <Field label="Monitoring enabled">
                    <NativeSelect
                      value={record["monitoring_enabled"] ? "yes" : "no"}
                      onChange={(v) => set("monitoring_enabled", v === "yes")}
                      options={["yes", "no"]}
                      labels={{ yes: "Enabled", no: "Disabled" }}
                    />
                  </Field>
                  <Field label="Change detected">
                    <NativeSelect
                      value={record["change_detected"] ? "yes" : "no"}
                      onChange={(v) => set("change_detected", v === "yes")}
                      options={["yes", "no"]}
                      labels={{ yes: "Yes — needs review", no: "No" }}
                    />
                  </Field>
                  <Field label="Previous deadline">
                    <Input
                      type="date"
                      value={val("previous_deadline")}
                      onChange={(e) => set("previous_deadline", e.target.value)}
                    />
                  </Field>
                  <Field label="Application state">
                    <NativeSelect
                      value={val("application_stage")}
                      onChange={(v) => set("application_stage", v)}
                      options={["", ...APPLICATION_STAGES.map((s) => s.value)]}
                      labels={{
                        "": "—",
                        ...Object.fromEntries(APPLICATION_STAGES.map((s) => [s.value, s.label])),
                      }}
                    />
                  </Field>

                  <Field label="Last checked">
                    <div className="flex h-9 items-center text-[13px] text-muted-foreground tabnum">
                      {formatDateTime(data.last_checked_at)}
                    </div>
                  </Field>
                  <Field label="Last verified">
                    <div className="flex h-9 items-center text-[13px] text-muted-foreground tabnum">
                      {formatDateTime(data.last_verified_at)}
                    </div>
                  </Field>
                  <Field label="Monitoring notes" wide>
                    <Textarea
                      rows={3}
                      value={val("monitoring_notes")}
                      onChange={(e) => set("monitoring_notes", e.target.value)}
                    />
                  </Field>
                </Grid>
              </Panel>

              <MonitoringActivity opportunityId={data.id} />
            </>
          ) : null}

          {view === "requirements" ? (
            <Panel title="Related submission materials">
              <ul className="divide-y divide-border/60">
                {(data.submissions ?? []).map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-4 py-2.5">
                    <Link
                      to="/submissions/$id"
                      params={{ id: s.id }}
                      className="text-[13px] font-medium hover:text-primary hover:underline"
                    >
                      {s.title}
                    </Link>
                    <Chip tone={STAGE_TONE[s.stage]}>{labelize(s.stage)}</Chip>
                  </li>
                ))}
                {(data.submissions ?? []).length === 0 ? (
                  <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                    No submissions started.
                  </li>
                ) : null}
              </ul>
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-4">
          <section className="rounded-md border border-border bg-surface">
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">Key dates</h2>
            </header>
            <ul className="divide-y divide-border/60 text-[13px]">
              <DateRow
                label="Opens"
                date={record["open_date"] as string | null}
                event={dateEvent("Opens", record["open_date"] as string | null)}
              />
              <DateRow
                label="Early deadline"
                date={record["early_deadline"] as string | null}
                timeLabel={cutoffLabel}
                event={dateEvent("Early deadline", record["early_deadline"] as string | null, true)}
              />
              <DateRow
                label="Final deadline"
                date={record["final_deadline"] as string | null}
                timeLabel={cutoffLabel}
                event={dateEvent("Deadline", record["final_deadline"] as string | null, true)}
              />
              <DateRow
                label="Internal draft"
                date={record["internal_draft_due"] as string | null}
                event={dateEvent(
                  "Internal draft due",
                  record["internal_draft_due"] as string | null,
                )}
              />
              <DateRow
                label="Client review"
                date={record["client_review_due"] as string | null}
                event={dateEvent("Client review", record["client_review_due"] as string | null)}
              />
              <DateRow label="Submitted" date={record["submission_date"] as string | null} />
              <DateRow
                label="Announcement"
                date={record["announcement_date"] as string | null}
                event={dateEvent("Winners announced", record["announcement_date"] as string | null)}
              />
              <DateRow
                label="Event"
                date={record["event_date"] as string | null}
                event={dateEvent("Event", record["event_date"] as string | null)}
              />
            </ul>
          </section>

          <section className="rounded-md border border-border bg-surface">
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">Activity history</h2>
            </header>
            <ul className="max-h-[420px] divide-y divide-border/60 overflow-y-auto">
              {history.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{labelize(a.action)}</span>
                    <span className="tabnum text-muted-foreground">
                      {formatDateTime(a.created_at)}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    {a.field ? `${labelize(a.field)}: ` : ""}
                    {a.old_value ? `${a.old_value} → ` : ""}
                    {a.new_value ?? a.summary ?? ""}
                    {a.profiles?.full_name ? ` · ${a.profiles.full_name}` : ""}
                  </div>
                </li>
              ))}
              {history.length === 0 ? (
                <li className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                  No recorded changes yet.
                </li>
              ) : null}
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function Panel({
  title,
  collapsible,
  defaultOpen = true,
  children,
}: {
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;
  return (
    <section className="rounded-md border border-border bg-surface">
      <header className={isOpen ? "border-b border-border px-4 py-2.5" : "px-4 py-2.5"}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={isOpen}
            className="flex w-full items-center justify-between text-left"
          >
            <h2 className="text-[13px] font-semibold">{title}</h2>
            <span className="text-[11px] text-muted-foreground">{isOpen ? "Hide" : "Show"}</span>
          </button>
        ) : (
          <h2 className="text-[13px] font-semibold">{title}</h2>
        )}
      </header>
      {isOpen ? children : null}
    </section>
  );
}

function SummaryCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 text-[10.5px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <label className="mb-1.5 block text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

function DateRow({
  label,
  date,
  event,
  timeLabel,
}: {
  label: string;
  date: string | null;
  event?: CalendarEvent | undefined;
  timeLabel?: string | undefined;
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-4 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="tabnum">
          {formatDate(date)}
          {date && timeLabel ? (
            <span className="ml-1 text-[11px] text-muted-foreground">{timeLabel}</span>
          ) : null}
        </span>
        {date ? (
          <span className={cn("text-[11px]", URGENCY_CLASS[urgencyOf(date)])}>
            {countdownLabel(date)}
          </span>
        ) : null}
        {date && event ? <AddToCalendar event={event} /> : null}
      </span>
    </li>
  );
}
