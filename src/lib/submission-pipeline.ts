/**
 * The team's real submission pipeline.
 *
 * The Opportunities grid status is what the team actually maintains, so it —
 * not the presence of a draft record — decides whether something is in
 * progress, submitted or decided. Draft records are layered on top so a
 * started draft always shows up too.
 */
import { supabase } from "@/integrations/supabase/client";
import { bestDeadline } from "@/lib/opportunity-view";
import type { ChipTone } from "@/lib/program";

export type PipelineSegment = "working" | "sent" | "decided";

type OpportunityLike = {
  id: string;
  name: string;
  type: string;
  status: string;
  application_stage?: string | null;
  owner_name?: string | null;
  final_deadline: string | null;
  early_deadline: string | null;
};

type SubmissionLike = {
  id: string;
  opportunity_id: string | null;
  title: string;
  stage: string;
  updated_at?: string;
};

export type PipelineRow = {
  key: string;
  opportunityId: string | null;
  submissionId: string | null;
  name: string;
  type: string | null;
  ownerName: string | null;
  deadline: string | null;
  stageLabel: string;
  tone: ChipTone;
  segment: PipelineSegment;
};

/** Grid statuses that put an opportunity into the submission pipeline. */
const STATUS_SEGMENT: Record<string, PipelineSegment> = {
  in_progress: "working",
  drafting: "working",
  submitted: "sent",
  shortlisted: "sent",
  outcome_pending: "sent",
  won: "decided",
  lost: "decided",
};

/** Submission stages, which win over the grid status when a draft exists. */
const STAGE_SEGMENT: Record<string, PipelineSegment> = {
  draft: "working",
  in_review: "working",
  approved: "working",
  submitted: "sent",
  outcome_pending: "sent",
  won: "decided",
  lost: "decided",
};

const STAGE_LABEL: Record<string, { label: string; tone: ChipTone }> = {
  draft: { label: "Drafting", tone: "neutral" },
  in_review: { label: "In review", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  submitted: { label: "Submitted", tone: "primary" },
  outcome_pending: { label: "Awaiting outcome", tone: "info" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "critical" },
};

const STATUS_LABEL: Record<string, { label: string; tone: ChipTone }> = {
  in_progress: { label: "In progress", tone: "warning" },
  drafting: { label: "Drafting", tone: "neutral" },
  submitted: { label: "Submitted", tone: "primary" },
  shortlisted: { label: "Shortlisted", tone: "info" },
  outcome_pending: { label: "Awaiting outcome", tone: "info" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "critical" },
};

/**
 * One row per opportunity: everything the grid says we are working on or have
 * sent, plus anything with a draft started against it.
 */
export function buildPipeline(
  opportunities: OpportunityLike[],
  submissions: SubmissionLike[],
): PipelineRow[] {
  const byOpportunity = new Map<string, SubmissionLike>();
  for (const s of submissions) {
    if (!s.opportunity_id) continue;
    const existing = byOpportunity.get(s.opportunity_id);
    if (!existing || (s.updated_at ?? "") > (existing.updated_at ?? "")) {
      byOpportunity.set(s.opportunity_id, s);
    }
  }

  const rows: PipelineRow[] = [];

  for (const o of opportunities) {
    const submission = byOpportunity.get(o.id) ?? null;
    const fromStage = submission ? STAGE_SEGMENT[submission.stage] : undefined;
    const fromStatus =
      STATUS_SEGMENT[o.status] ??
      (o.application_stage === "submitted"
        ? "sent"
        : o.application_stage === "drafting"
          ? "working"
          : undefined);
    const segment = fromStage ?? fromStatus;
    if (!segment) continue;

    const descriptor = submission
      ? (STAGE_LABEL[submission.stage] ?? { label: submission.stage, tone: "neutral" as ChipTone })
      : (STATUS_LABEL[o.status] ?? { label: o.status, tone: "neutral" as ChipTone });

    rows.push({
      key: o.id,
      opportunityId: o.id,
      submissionId: submission?.id ?? null,
      name: o.name,
      type: o.type,
      ownerName: o.owner_name ?? null,
      deadline: bestDeadline(o),
      stageLabel: descriptor.label,
      tone: descriptor.tone,
      segment,
    });
  }

  // Drafts that are not linked to a tracked opportunity still deserve a row.
  for (const s of submissions) {
    if (s.opportunity_id && opportunities.some((o) => o.id === s.opportunity_id)) continue;
    const segment = STAGE_SEGMENT[s.stage] ?? "working";
    const descriptor = STAGE_LABEL[s.stage] ?? { label: s.stage, tone: "neutral" as ChipTone };
    rows.push({
      key: s.id,
      opportunityId: s.opportunity_id,
      submissionId: s.id,
      name: s.title,
      type: null,
      ownerName: null,
      deadline: null,
      stageLabel: descriptor.label,
      tone: descriptor.tone,
      segment,
    });
  }

  return rows.sort((a, b) =>
    (a.deadline ?? "9999-12-31").localeCompare(b.deadline ?? "9999-12-31"),
  );
}

export function segmentOf(rows: PipelineRow[], segment: PipelineSegment): PipelineRow[] {
  return rows.filter((r) => r.segment === segment);
}

/**
 * Open the submission for an opportunity, creating one only if none exists.
 * Returns the submission id, or null when creation failed.
 */
export async function ensureSubmission(
  opportunityId: string,
  name: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data: existing, error: findError } = await supabase
    .from("submissions")
    .select("id")
    .eq("opportunity_id", opportunityId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (findError) return { id: null, error: findError.message };
  if (existing && existing.length > 0) return { id: existing[0]!.id, error: null };

  const { data: userData } = await supabase.auth.getUser();
  const { data: created, error } = await supabase
    .from("submissions")
    .insert({
      opportunity_id: opportunityId,
      title: `${name} submission`,
      stage: "draft",
      assignee_id: userData.user?.id ?? null,
      created_by: userData.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !created)
    return { id: null, error: error?.message ?? "Could not start a submission" };
  return { id: created.id, error: null };
}

/** Keep the grid status aligned when a submission moves stage. */
const STAGE_TO_STATUS: Record<string, string> = {
  draft: "in_progress",
  in_review: "in_progress",
  approved: "in_progress",
  submitted: "submitted",
  outcome_pending: "submitted",
  won: "won",
  lost: "lost",
};

export async function syncOpportunityStatus(opportunityId: string | null, stage: string) {
  if (!opportunityId) return;
  const status = STAGE_TO_STATUS[stage];
  if (!status) return;
  await supabase
    .from("opportunities")
    .update({ status } as never)
    .eq("id", opportunityId);
}
