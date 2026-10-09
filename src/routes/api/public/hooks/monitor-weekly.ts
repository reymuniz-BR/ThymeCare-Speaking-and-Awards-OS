import { createFileRoute } from "@tanstack/react-router";
import { authorizeHook, json } from "@/lib/hook-auth.server";

const JOB_NAME = "monitor-weekly";
const MIN_INTERVAL_MS = 60 * 60 * 1000; // at most one sweep per hour

/**
 * Weekly monitoring sweep endpoint, called by the scheduled job.
 *
 * Auth: a dedicated MONITOR_WEBHOOK_SECRET sent as `x-monitor-secret`
 * (or `Authorization: Bearer <secret>`), compared in constant time.
 * The publishable/anon key is public and is NOT accepted.
 *
 * Rate limit: the sweep runs at most once per hour, tracked in
 * public.webhook_runs so it holds across stateless workers.
 */
export const Route = createFileRoute("/api/public/hooks/monitor-weekly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Env-secret only: there is no stored job secret for this route.
        const denied = await authorizeHook(request, { acceptEnvSecret: true });
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Claim the hourly slot atomically: the update only lands when the
        // recorded run is older than the window, so concurrent calls lose.
        const cutoff = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();
        const now = new Date().toISOString();

        const { data: claimed, error: claimError } = await supabaseAdmin
          .from("webhook_runs")
          .update({ last_run_at: now })
          .eq("name", JOB_NAME)
          .lt("last_run_at", cutoff)
          .select("name");

        if (claimError) {
          console.error("monitor-weekly: rate-limit check failed", claimError);
          return json({ success: false, error: "Rate limit check failed" }, 500);
        }

        if (!claimed || claimed.length === 0) {
          // Either the row does not exist yet (first ever run) or we are inside the window.
          const { error: insertError } = await supabaseAdmin
            .from("webhook_runs")
            .insert({ name: JOB_NAME, last_run_at: now });
          if (insertError) {
            return json({ success: false, error: "Sweep already ran within the last hour" }, 429);
          }
        }

        try {
          const { runSweep } = await import("@/lib/monitoring.server");
          const result = await runSweep(40);
          return json({ success: true, ...result });
        } catch (e) {
          console.error("monitor-weekly failed", e);
          return json({ success: false, error: e instanceof Error ? e.message : "failed" }, 500);
        }
      },
    },
  },
});
