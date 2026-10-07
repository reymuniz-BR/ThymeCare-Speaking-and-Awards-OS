import { daysUntil, labelize, formatDate } from "@/lib/program";
import type { ChipTone, DiscoveryRow, SubmissionRow } from "@/lib/program";
import type { OpportunityWithDates, MonitoringCheckRow, OpportunityChangeRow } from "@/lib/hooks";
import { isClosed } from "@/lib/opportunity-view";
import { nextDeadlineDate } from "@/lib/monitoring";

export type BriefSection = "changed" | "action" | "new" | "pursue" | "results";

export type BriefEntry = {
  /** Stable identity of the item within a week — used for review/follow-up records. */
  key: string;
  section: BriefSection;
  group: string;
  title: string;
  detail?: string | undefined;
  meta?: string | undefined;
  tone: ChipTone;
  /** Short chip label shown on the right of the row. */
  badge?: string | undefined;
  opportunityId?: string | undefined;
  discoveryId?: string | undefined;
  submissionId?: string | undefined;
  /** Higher sorts first within a group. */
  weight: number;
};

export const SECTION_TITLE: Record<BriefSection, string> = {
  changed: "What changed this week",
  action: "What requires action",
  new: "What's new",
  pursue: "What should we pursue",
  results: "Recent results",
};

/* -------------------------------- week math ------------------------------- */

/** Monday of the week containing `d`, as an ISO date string. */
export function weekStartOf(d = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - dow);
  return x.toISOString().slice(0, 10);
}

export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  )}`;
}

function since(weekStart: string): number {
  return new Date(`${weekStart}T00:00:00`).getTime();
}

/* --------------------------------- helpers -------------------------------- */

const RESULT_STATUSES: Record<string, ChipTone> = {
  submitted: "info",
  awaiting_results: "info",
  accepted: "success",
  finalist: "success",
  won: "success",
  declined: "critical",
  not_selected: "critical",
  passed: "neutral",
};

const DEADLINE_FIELDS = new Set(["final_deadline", "early_deadline"]);

/** Strategic fit: tier, explicit fit score, priority, recommendation and timing. */
export function fitScore(o: OpportunityWithDates): number {
  let score = 0;
  if (o.tier === 1) score += 40;
  else if (o.tier === 2) score += 24;
  else score += 10;

  if (typeof o.fit_score === "number") score += Math.max(0, Math.min(10, o.fit_score)) * 3;

  score += { critical: 24, high: 18, medium: 10, low: 2 }[o.priority ?? "medium"] ?? 8;
  score += { recommended: 22, needs_review: 6, do_not_pursue: -60 }[o.recommendation ?? ""] ?? 0;

  const d = daysUntil(nextDeadlineDate(o));
  if (d !== null && d >= 0) {
    // Enough runway to write something good, but close enough to matter.
    if (d <= 7) score += 6;
    else if (d <= 30) score += 16;
    else if (d <= 90) score += 10;
  } else if (d !== null) {
    score -= 30;
  }

  if (o.application_state === "open" || o.application_state === "rolling") score += 10;
  return Math.round(score);
}

export function discoveryFitScore(d: DiscoveryRow): number {
  return Math.round((d.relevance_score ?? 5) * 8 + (d.estimated_deadline ? 6 : 0));
}

/* ------------------------------- brief build ------------------------------ */

export type BriefInput = {
  weekStart: string;
  opportunities: OpportunityWithDates[];
  changes: (OpportunityChangeRow & {
    opportunities: { id: string; name: string; type: string } | null;
  })[];
  checks: MonitoringCheckRow[];
  discoveries: DiscoveryRow[];
  submissions: (SubmissionRow & {
    opportunities: { id: string; name: string; type: string } | null;
  })[];
};

function stateTransitions(checks: MonitoringCheckRow[], from: number) {
  // Oldest → newest per opportunity, so we can see the state actually change.
  const byOpp = new Map<string, MonitoringCheckRow[]>();
  for (const c of [...checks].sort((a, b) => a.checked_at.localeCompare(b.checked_at))) {
    if (!c.ok || !c.application_state) continue;
    const list = byOpp.get(c.opportunity_id) ?? [];
    list.push(c);
    byOpp.set(c.opportunity_id, list);
  }
  const out: { opportunityId: string; state: string; at: string; source: string | null }[] = [];
  for (const [opportunityId, list] of byOpp) {
    let prev: string | null = null;
    for (const c of list) {
      const state = c.application_state!;
      if (prev && prev !== state && new Date(c.checked_at).getTime() >= from)
        out.push({ opportunityId, state, at: c.checked_at, source: c.source_url });
      prev = state;
    }
  }
  return out;
}

export function buildBrief(input: BriefInput): BriefEntry[] {
  const { weekStart, opportunities, changes, checks, discoveries, submissions } = input;
  const from = since(weekStart);
  const byId = new Map(opportunities.map((o) => [o.id, o]));
  const entries: BriefEntry[] = [];

  /* ------------------------- 1. What changed this week ------------------------ */

  const weekChanges = changes.filter((c) => new Date(c.detected_at).getTime() >= from);

  for (const c of weekChanges) {
    const name = c.opportunities?.name ?? byId.get(c.opportunity_id)?.name ?? "Opportunity";
    const isDate = DEADLINE_FIELDS.has(c.field);
    let group: string | null = null;
    let tone: ChipTone = "info";

    if (isDate && !c.old_value) {
      group = "Newly announced deadlines";
      tone = "primary";
    } else if (isDate) {
      group = "Deadline changes";
      tone = "warning";
    } else if (c.field === "open_date") {
      group = "Applications newly opened";
      tone = "success";
    } else if (c.field === "event_date") {
      group = "New event dates";
      tone = "info";
    } else if (c.field === "category") {
      group = "New award categories";
      tone = "info";
    }
    if (!group) continue;

    entries.push({
      key: `change:${c.id}`,
      section: "changed",
      group,
      title: name,
      detail: `${c.label}: ${c.old_value ?? "not recorded"} → ${c.new_value ?? "—"}`,
      badge: c.review_status === "pending" ? "Review" : "Change",
      meta: `${labelize(c.confidence)} · ${c.review_status === "pending" ? "Awaiting review" : labelize(c.review_status)}`,
      tone,
      opportunityId: c.opportunity_id,
      weight: c.review_status === "pending" ? 90 : 50,
    });
  }

  for (const t of stateTransitions(checks, from)) {
    const o = byId.get(t.opportunityId);
    if (!o) continue;
    if (t.state === "open" || t.state === "rolling") {
      entries.push({
        key: `state:${t.opportunityId}:open:${t.at.slice(0, 10)}`,
        section: "changed",
        group: "Applications newly opened",
        title: o.name,
        detail:
          t.state === "rolling"
            ? "Submissions are accepted on a rolling basis"
            : "Applications are now open",
        meta: t.source ?? undefined,
        tone: "success",
        badge: "Open",
        opportunityId: o.id,
        weight: 95,
      });
    } else if (t.state === "closed") {
      entries.push({
        key: `state:${t.opportunityId}:closed:${t.at.slice(0, 10)}`,
        section: "changed",
        group: "Opportunities that closed",
        title: o.name,
        detail: "Submissions have closed on the source page",
        meta: t.source ?? undefined,
        tone: "critical",
        badge: "Closed",
        opportunityId: o.id,
        weight: 70,
      });
    }
  }

  // A deadline that lapsed this week also counts as closed.
  for (const o of opportunities) {
    const deadline = o.final_deadline;
    if (!deadline) continue;
    const t = new Date(`${deadline}T00:00:00`).getTime();
    if (t >= from && t <= Date.now() && !isClosed(o.status)) {
      entries.push({
        key: `closed:${o.id}:${deadline}`,
        section: "changed",
        group: "Opportunities that closed",
        title: o.name,
        detail: `Final deadline passed ${formatDate(deadline)} without a recorded submission`,
        tone: "critical",
        badge: "Closed",
        opportunityId: o.id,
        weight: 80,
      });
    }
  }

  /* -------------------------- 2. What requires action ------------------------- */

  for (const o of opportunities) {
    if (isClosed(o.status)) continue;
    const deadline = nextDeadlineDate(o);
    const d = daysUntil(deadline);
    if (d === null || d < 0) continue;
    const group =
      d <= 7
        ? "Due within 7 days"
        : d <= 14
          ? "Due within 14 days"
          : d <= 30
            ? "Due within 30 days"
            : null;
    if (!group) continue;
    entries.push({
      key: `due:${o.id}:${deadline}`,
      section: "action",
      group,
      title: o.name,
      detail: `${labelize(o.type)} · ${formatDate(deadline)} · ${d === 0 ? "due today" : `${d}d left`}`,
      meta: labelize(o.status),
      tone: d <= 7 ? "critical" : d <= 14 ? "warning" : "info",
      badge: d === 0 ? "Today" : `${d}d`,
      opportunityId: o.id,
      weight: 100 - d,
    });
  }

  for (const o of opportunities) {
    if (isClosed(o.status)) continue;
    const hasDeadline = !!nextDeadlineDate(o);
    const tbd = !hasDeadline || o.deadline_type === "tbd" || o.deadline_type === "estimated";
    if (!tbd) continue;
    entries.push({
      key: `tbd:${o.id}`,
      section: "action",
      group: "TBD — needs follow-up",
      title: o.name,
      detail: hasDeadline
        ? `Deadline recorded as ${labelize(o.deadline_type)} — confirm with the organizer`
        : "No deadline on record — confirm timing with the organizer",
      meta: o.deadline_source_url ?? o.application_url ?? o.url ?? "No source URL",
      tone: "neutral",
      badge: "TBD",
      opportunityId: o.id,
      weight: o.tier === 1 ? 40 : 20,
    });
  }

  for (const s of submissions) {
    if (s.stage !== "in_review") continue;
    entries.push({
      key: `review:${s.id}`,
      section: "action",
      group: "Drafts awaiting client review",
      title: s.title,
      detail: s.opportunities?.name ?? "Unlinked submission",
      meta: "In client review",
      tone: "primary",
      badge: "Review",
      submissionId: s.id,
      opportunityId: s.opportunity_id,
      weight: 60,
    });
  }
  for (const o of opportunities) {
    if (o.status !== "client_review") continue;
    if (submissions.some((s) => s.opportunity_id === o.id && s.stage === "in_review")) continue;
    entries.push({
      key: `review-opp:${o.id}`,
      section: "action",
      group: "Drafts awaiting client review",
      title: o.name,
      detail: "Marked as client review on the opportunity record",
      meta: o.internal_draft_due ? `Draft due ${formatDate(o.internal_draft_due)}` : undefined,
      tone: "primary",
      badge: "Review",
      opportunityId: o.id,
      weight: 55,
    });
  }

  /* ------------------------------ 3. What's new ------------------------------ */

  const trackedNames = new Set(opportunities.map((o) => o.name.trim().toLowerCase()));
  for (const d of discoveries) {
    if (d.status !== "new") continue;
    if (d.promoted_opportunity_id || d.duplicate_of) continue;
    if (trackedNames.has(d.name.trim().toLowerCase())) continue;
    entries.push({
      key: `discovery:${d.id}`,
      section: "new",
      group: d.type === "award" ? "New awards" : "New speaking opportunities",
      title: d.name,
      detail: d.rationale ?? d.description ?? undefined,
      meta: [
        d.organizer,
        d.estimated_deadline ? `est. ${formatDate(d.estimated_deadline)}` : null,
        d.source,
      ]
        .filter(Boolean)
        .join(" · "),
      tone: (d.relevance_score ?? 0) >= 8 ? "success" : "info",
      badge: d.relevance_score ? `Fit ${d.relevance_score}/10` : "New",
      discoveryId: d.id,
      weight: discoveryFitScore(d),
    });
  }

  /* --------------------------- 4. What should we pursue ---------------------- */

  const pursuable = opportunities
    .filter((o) => !isClosed(o.status) && o.recommendation !== "do_not_pursue")
    .map((o) => ({ o, score: fitScore(o) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const { o, score } of pursuable) {
    const deadline = nextDeadlineDate(o);
    entries.push({
      key: `pursue:${o.id}`,
      section: "pursue",
      group: "Tracked opportunities",
      title: o.name,
      detail: [
        `Tier ${o.tier ?? "—"}`,
        labelize(o.priority),
        labelize(o.recommendation),
        deadline ? formatDate(deadline) : "no deadline",
      ].join(" · "),
      tone: score >= 80 ? "success" : score >= 55 ? "primary" : "neutral",
      badge: `Fit ${score}`,
      opportunityId: o.id,
      weight: score,
    });
  }

  const pursuableNew = discoveries
    .filter((d) => d.status === "new" && !d.promoted_opportunity_id)
    .map((d) => ({ d, score: discoveryFitScore(d) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const { d, score } of pursuableNew) {
    entries.push({
      key: `pursue-new:${d.id}`,
      section: "pursue",
      group: "Newly discovered",
      title: d.name,
      detail: [labelize(d.type), d.organizer, d.region].filter(Boolean).join(" · "),
      tone: score >= 70 ? "success" : "info",
      badge: `Fit ${score}`,
      discoveryId: d.id,
      weight: score,
    });
  }

  /* ------------------------------ 5. Recent results --------------------------- */

  const RESULT_WINDOW = 60 * 86_400_000;
  for (const o of opportunities) {
    const tone = RESULT_STATUSES[o.status ?? ""] ?? (o.outcome ? "neutral" : null);
    if (!tone) continue;
    const at = new Date(o.updated_at).getTime();
    if (Date.now() - at > RESULT_WINDOW) continue;
    entries.push({
      key: `result:${o.id}`,
      section: "results",
      group: ["won", "finalist", "accepted"].includes(o.status ?? "")
        ? "Wins & acceptances"
        : ["not_selected", "declined", "passed"].includes(o.status ?? "")
          ? "Not selected"
          : "Submitted / awaiting results",
      title: o.name,
      detail: [labelize(o.status), o.outcome ? `Outcome: ${labelize(o.outcome)}` : null]
        .filter(Boolean)
        .join(" · "),
      meta: o.submission_date ? `Submitted ${formatDate(o.submission_date)}` : undefined,
      tone,
      badge: labelize(o.outcome ?? o.status),
      opportunityId: o.id,
      weight: at,
    });
  }

  for (const s of submissions) {
    if (!["submitted", "outcome_pending", "won", "lost"].includes(s.stage)) continue;
    const at = new Date(s.updated_at).getTime();
    if (Date.now() - at > RESULT_WINDOW) continue;
    if (s.opportunity_id && entries.some((e) => e.key === `result:${s.opportunity_id}`)) continue;
    entries.push({
      key: `result-sub:${s.id}`,
      section: "results",
      group:
        s.stage === "won"
          ? "Wins & acceptances"
          : s.stage === "lost"
            ? "Not selected"
            : "Submitted / awaiting results",
      title: s.title,
      detail: `${s.opportunities?.name ?? "Unlinked"} · ${labelize(s.stage)}`,
      meta: s.submitted_at ? `Submitted ${formatDate(s.submitted_at.slice(0, 10))}` : undefined,
      tone: s.stage === "won" ? "success" : s.stage === "lost" ? "critical" : "info",
      badge: labelize(s.stage),
      submissionId: s.id,
      opportunityId: s.opportunity_id,
      weight: at,
    });
  }

  return entries;
}

export function groupEntries(entries: BriefEntry[], section: BriefSection) {
  const groups = new Map<string, BriefEntry[]>();
  for (const e of entries.filter((x) => x.section === section)) {
    const list = groups.get(e.group) ?? [];
    list.push(e);
    groups.set(e.group, list);
  }
  return [...groups.entries()].map(([group, items]) => ({
    group,
    items: items.sort((a, b) => b.weight - a.weight),
  }));
}
