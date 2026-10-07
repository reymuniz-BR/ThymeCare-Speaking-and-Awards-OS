import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { StrategyBrief } from "@/lib/strategy";
import type { AnswerVersion } from "@/lib/draft";
import type { ProofPointRow } from "@/lib/proof-points";
import { dedupeKey } from "@/lib/notifications";
import { MASTER_MESSAGING_TAG } from "@/lib/messaging";
import type { DesiredNotification, NotificationRow } from "@/lib/notifications";

import type {
  ActivityRow,
  ContentAssetRow,
  ContentSnippetRow,
  DiscoveryRow,
  OpportunityDateRow,
  OpportunityRow,
  ProfileRow,
  SubmissionFieldRow,
  SubmissionRow,
} from "@/lib/program";

export type OpportunityWithDates = OpportunityRow & {
  opportunity_dates: OpportunityDateRow[];
};

function nextDeadlineOf(dates: OpportunityDateRow[]): OpportunityDateRow | null {
  const today = new Date().toISOString().slice(0, 10);
  const candidates = dates
    .filter((d) => d.kind === "deadline" || d.kind === "extended_deadline")
    .sort((a, b) => a.date.localeCompare(b.date));
  return candidates.find((d) => d.date >= today) ?? candidates[candidates.length - 1] ?? null;
}

export function nextDeadline(o: OpportunityWithDates) {
  return nextDeadlineOf(o.opportunity_dates ?? []);
}

export function useOpportunities() {
  return useQuery({
    queryKey: ["opportunities"],
    queryFn: async (): Promise<OpportunityWithDates[]> => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("*, opportunity_dates(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpportunityWithDates[];
    },
  });
}

export function useOpportunity(id: string) {
  return useQuery({
    queryKey: ["opportunity", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select("*, opportunity_dates(*), opportunity_cycles(*), submissions(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as
        | (OpportunityWithDates & {
            opportunity_cycles: { id: string; year: number; label: string | null }[];
            submissions: SubmissionRow[];
          })
        | null;
    },
  });
}

/** The signed-in user's own profile row (used for "assigned to me" views). */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data: auth } = await supabase.auth.getUser();
      const id = auth.user?.id;
      if (!id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSubmissions() {
  return useQuery({
    queryKey: ["submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*, opportunities(id, name, type)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (SubmissionRow & {
        opportunities: { id: string; name: string; type: string } | null;
      })[];
    },
  });
}

export function useSubmission(id: string) {
  return useQuery({
    queryKey: ["submission", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select("*, opportunities(id, name, type, url, application_url), submission_fields(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as SubmissionRow & {
        opportunities: {
          id: string;
          name: string;
          type: string;
          url: string | null;
          application_url: string | null;
        } | null;
        submission_fields: SubmissionFieldRow[];
      };
      row.submission_fields = [...(row.submission_fields ?? [])].sort(
        (a, b) => a.position - b.position,
      );
      return row;
    },
  });
}

export function useDiscoveries() {
  return useQuery({
    queryKey: ["discoveries"],
    queryFn: async (): Promise<DiscoveryRow[]> => {
      const { data, error } = await supabase
        .from("discoveries")
        .select("*")
        .order("relevance_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContentAssets() {
  return useQuery({
    queryKey: ["content_assets"],
    queryFn: async (): Promise<ContentAssetRow[]> => {
      const { data, error } = await supabase
        .from("content_assets")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Canonical Messaging & Proof Point Bank entries. */
export function useProofPoints() {
  return useQuery({
    queryKey: ["proof_points"],
    queryFn: async (): Promise<ProofPointRow[]> => {
      const { data, error } = await supabase
        .from("proof_points")
        .select("*")
        .order("approved", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSnippets() {
  return useQuery({
    queryKey: ["content_snippets"],
    queryFn: async (): Promise<ContentSnippetRow[]> => {
      const { data, error } = await supabase
        .from("content_snippets")
        .select("*")
        .order("usage_count", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Sections of the master messaging document pulled from Google Drive. */
export function useMasterMessaging() {
  return useQuery({
    queryKey: ["master_messaging"],
    queryFn: async (): Promise<ContentSnippetRow[]> => {
      const { data, error } = await supabase
        .from("content_snippets")
        .select("*")
        .contains("tags", [MASTER_MESSAGING_TAG])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Answers from previous submissions, used as reusable source material. */
export function useSubmissionFieldLibrary() {
  return useQuery({
    queryKey: ["submission_field_library"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("submission_fields")
        .select("id, prompt, answer, submission_id, submissions(title, opportunities(name, type))")
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((f) => {
        const row = f as unknown as {
          id: string;
          prompt: string;
          answer: string;
          submission_id: string;
          submissions: {
            title: string;
            opportunities: { name: string; type: string } | null;
          } | null;
        };
        return {
          id: row.id,
          prompt: row.prompt,
          answer: row.answer,
          submissionId: row.submission_id,
          submissionTitle: row.submissions?.title ?? "Untitled submission",
          opportunityName: row.submissions?.opportunities?.name ?? null,
          opportunityType: row.submissions?.opportunities?.type ?? null,
        };
      });
    },
  });
}

export function useActivity(limit = 100) {
  return useQuery({
    queryKey: ["activity", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*, profiles:actor_id(full_name), opportunities:opportunity_id(name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as (ActivityRow & {
        profiles: { full_name: string | null } | null;
        opportunities: { name: string } | null;
      })[];
    },
  });
}
/** The Submission Strategy Brief stored for a submission, if one was generated. */
export function useSubmissionBrief(submissionId: string) {
  return useQuery({
    queryKey: ["submission_brief", submissionId],
    queryFn: async (): Promise<StrategyBrief | null> => {
      const { data, error } = await supabase
        .from("submission_briefs")
        .select("*")
        .eq("submission_id", submissionId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StrategyBrief) ?? null;
    },
  });
}

/** Saved version history for one application question, newest first. */
export function useAnswerVersions(fieldId: string) {
  return useQuery({
    queryKey: ["answer_versions", fieldId],
    queryFn: async (): Promise<AnswerVersion[]> => {
      const { data, error } = await supabase
        .from("submission_answer_versions")
        .select("*")
        .eq("field_id", fieldId)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AnswerVersion[];
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useUpsertOpportunity() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (payload: Partial<OpportunityRow> & { id?: string }) => {
      const { data, error } = await supabase
        .from("opportunities")
        .upsert(payload as never)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(["opportunities", "activity", "opportunity"]),
  });
}

/* ---------------------------- Deadline monitoring --------------------------- */

export type MonitoringCheckRow = Database["public"]["Tables"]["monitoring_checks"]["Row"];
export type OpportunityChangeRow = Database["public"]["Tables"]["opportunity_changes"]["Row"];

export function useMonitoringChecks(opportunityId?: string, limit = 20) {
  return useQuery({
    queryKey: ["monitoring_checks", opportunityId ?? "all", limit],
    queryFn: async (): Promise<MonitoringCheckRow[]> => {
      let q = supabase
        .from("monitoring_checks")
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(limit);
      if (opportunityId) q = q.eq("opportunity_id", opportunityId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOpportunityChanges(
  opts: { opportunityId?: string; pendingOnly?: boolean } = {},
) {
  return useQuery({
    queryKey: ["opportunity_changes", opts.opportunityId ?? "all", opts.pendingOnly ?? false],
    queryFn: async () => {
      let q = supabase
        .from("opportunity_changes")
        .select("*, opportunities:opportunity_id(id, name, type)")
        .order("detected_at", { ascending: false })
        .limit(300);
      if (opts.opportunityId) q = q.eq("opportunity_id", opts.opportunityId);
      if (opts.pendingOnly) q = q.eq("review_status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (OpportunityChangeRow & {
        opportunities: { id: string; name: string; type: string } | null;
      })[];
    },
  });
}

/** Accept (apply to the record) or reject a proposed change. */
export function useReviewChange() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      change,
      decision,
    }: {
      change: OpportunityChangeRow;
      decision: "accepted" | "rejected";
    }) => {
      if (decision === "accepted") {
        const patch: Record<string, unknown> = { [change.field]: change.new_value };
        if (change.field === "final_deadline") patch["previous_deadline"] = change.old_value;
        if (change.field !== "deadline_source_url" && change.source_url)
          patch["deadline_source_url"] = change.source_url;
        patch["deadline_verified_at"] = new Date().toISOString().slice(0, 10);
        const { error } = await supabase
          .from("opportunities")
          .update(patch as never)
          .eq("id", change.opportunity_id);
        if (error) throw error;
      }

      const { data: user } = await supabase.auth.getUser();
      const { error: updErr } = await supabase
        .from("opportunity_changes")
        .update({
          review_status: decision,
          reviewed_by: user.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        } as never)
        .eq("id", change.id);
      if (updErr) throw updErr;

      const { count } = await supabase
        .from("opportunity_changes")
        .select("id", { count: "exact", head: true })
        .eq("opportunity_id", change.opportunity_id)
        .eq("review_status", "pending");
      await supabase
        .from("opportunities")
        .update({ change_detected: (count ?? 0) > 0 } as never)
        .eq("id", change.opportunity_id);
    },
    onSuccess: () =>
      invalidate([
        "opportunity_changes",
        "opportunities",
        "opportunity",
        "activity",
        "monitoring_checks",
      ]),
  });
}

/* ----------------------------- Weekly brief ------------------------------- */

export type BriefItemRow = Database["public"]["Tables"]["brief_items"]["Row"];

export function useBriefItems(weekStart: string) {
  return useQuery({
    queryKey: ["brief_items", weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brief_items")
        .select("*, owner:follow_up_owner_id(full_name), reviewer:reviewed_by(full_name)")
        .eq("week_start", weekStart);
      if (error) throw error;
      return (data ?? []) as (BriefItemRow & {
        owner: { full_name: string | null } | null;
        reviewer: { full_name: string | null } | null;
      })[];
    },
  });
}

export type BriefItemPatch = {
  weekStart: string;
  itemKey: string;
  section: string;
  title: string;
  opportunityId?: string | null;
  discoveryId?: string | null;
  submissionId?: string | null;
  reviewed?: boolean;
  followUpNote?: string | null;
  followUpOwnerId?: string | null;
  followUpDue?: string | null;
  followUpDone?: boolean;
};

/** Mark a brief item reviewed and/or attach a follow-up action. */
export function useSaveBriefItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: BriefItemPatch) => {
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user?.id ?? null;
      const row: Record<string, unknown> = {
        week_start: patch.weekStart,
        item_key: patch.itemKey,
        section: patch.section,
        title: patch.title,
        opportunity_id: patch.opportunityId ?? null,
        discovery_id: patch.discoveryId ?? null,
        submission_id: patch.submissionId ?? null,
        created_by: uid,
      };
      if (patch.reviewed !== undefined) {
        row["reviewed"] = patch.reviewed;
        row["reviewed_by"] = patch.reviewed ? uid : null;
        row["reviewed_at"] = patch.reviewed ? new Date().toISOString() : null;
      }
      if (patch.followUpNote !== undefined) row["follow_up_note"] = patch.followUpNote;
      if (patch.followUpOwnerId !== undefined) row["follow_up_owner_id"] = patch.followUpOwnerId;
      if (patch.followUpDue !== undefined) row["follow_up_due"] = patch.followUpDue;
      if (patch.followUpDone !== undefined) row["follow_up_done"] = patch.followUpDone;

      const { error } = await supabase
        .from("brief_items")
        .upsert(row as never, { onConflict: "week_start,item_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief_items"] }),
  });
}

/* ------------------------------ Notifications ----------------------------- */

export type SavedViewRow = Database["public"]["Tables"]["saved_views"]["Row"];

export function useNotifications(limit = 60) {
  return useQuery({
    queryKey: ["notifications", limit],
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 120_000,
  });
}

/**
 * Write any newly-derived notifications for the signed-in user.
 * Deduplicated against everything already stored, so it is safe to call on
 * every app load.
 */
export function useSyncNotifications() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (desired: DesiredNotification[]) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || desired.length === 0) return 0;

      const { data: existing, error } = await supabase
        .from("notifications")
        .select("kind, opportunity_id, title")
        .limit(500);
      if (error) throw error;
      const seen = new Set((existing ?? []).map((n) => dedupeKey(n)));

      const rows = desired
        .filter((d) => !seen.has(dedupeKey(d)))
        .map((d) => ({ ...d, user_id: uid }));
      if (!rows.length) return 0;

      const { error: insErr } = await supabase.from("notifications").insert(rows as never);
      if (insErr) throw insErr;
      return rows.length;
    },
    onSuccess: (count) => {
      if (count) invalidate(["notifications"]);
    },
  });
}

export function useMarkNotificationsRead() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (ids: string[] | "all") => {
      const stamp = new Date().toISOString();
      let q = supabase.from("notifications").update({ read_at: stamp } as never);
      q = ids === "all" ? q.is("read_at", null) : q.in("id", ids);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => invalidate(["notifications"]),
  });
}

/* ------------------------------- Saved views ------------------------------ */

export function useSavedViews() {
  return useQuery({
    queryKey: ["saved_views"],
    queryFn: async (): Promise<SavedViewRow[]> => {
      const { data, error } = await supabase
        .from("saved_views")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveView() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: Record<string, unknown> }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { error } = await supabase
        .from("saved_views")
        .insert({ name, filters: filters as never, user_id: uid });
      if (error) throw error;
    },
    onSuccess: () => invalidate(["saved_views"]),
  });
}

export function useDeleteView() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(["saved_views"]),
  });
}
