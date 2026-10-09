import { createFileRoute } from "@tanstack/react-router";
import { authorizeHook, json } from "@/lib/hook-auth.server";

const JOB_NAME = "tracker-weekly";
const MIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // at most one reconcile per ~week

/**
 * Weekly reconciliation against the client's master tracker in Drive.
 *
 * Auth: the stored `tracker-weekly` job secret or MONITOR_WEBHOOK_SECRET,
 * compared in constant time. Single-flight through public.webhook_runs so a
 * duplicate schedule cannot double-apply.
 */
export const Route = createFileRoute("/api/public/hooks/tracker-weekly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authorizeHook(request, { jobName: JOB_NAME });
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const now = new Date().toISOString();
        const cutoff = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();

        const { data: claimed, error: claimError } = await supabaseAdmin
          .from("webhook_runs")
          .update({ last_run_at: now })
          .eq("name", JOB_NAME)
          .lt("last_run_at", cutoff)
          .select("name");
        if (claimError) return json({ success: false, error: "Rate limit check failed" }, 500);
        if (!claimed || claimed.length === 0) {
          const { error: insertError } = await supabaseAdmin
            .from("webhook_runs")
            .insert({ name: JOB_NAME, last_run_at: now });
          if (insertError) return json({ success: false, error: "Already synced this week" }, 429);
        }

        try {
          const { syncTrackerGrid } = await import("@/lib/tracker-sync.server");
          const result = await syncTrackerGrid({});
          return json({
            success: true,
            rowsRead: result.rowsRead,
            created: result.created,
            updated: result.updated,
            unchanged: result.unchanged,
            unmappedStatuses: result.unmappedStatuses,
          });
        } catch (e) {
          console.error("tracker-weekly failed", e);
          return json({ success: false, error: e instanceof Error ? e.message : "failed" }, 500);
        }
      },
    },
  },
});
