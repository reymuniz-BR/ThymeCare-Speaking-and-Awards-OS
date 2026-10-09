import { createFileRoute } from "@tanstack/react-router";
import { authorizeHook, json } from "@/lib/hook-auth.server";

const JOB_NAME = "email-digest";
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // at most one digest run per 6 hours

/**
 * Monday-morning email digest endpoint, called by the scheduled job.
 *
 * Auth: a private per-job secret stored in public.job_secrets and read only by the
 * scheduler and this handler,
 * sent as `x-job-secret` (or `Authorization: Bearer <secret>`) and compared
 * in constant time. The publishable/anon key is public and is NOT accepted.
 *
 * Duplicate protection is two-layered: this endpoint is rate limited through
 * public.webhook_runs, and every individual email is claimed in
 * public.email_digest_log before it is sent.
 */
export const Route = createFileRoute("/api/public/hooks/email-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authorizeHook(request, { jobName: JOB_NAME });
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const cutoff = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();
        const now = new Date().toISOString();

        const { data: claimed, error: claimError } = await supabaseAdmin
          .from("webhook_runs")
          .update({ last_run_at: now })
          .eq("name", JOB_NAME)
          .lt("last_run_at", cutoff)
          .select("name");

        if (claimError) {
          console.error("email-digest: rate-limit check failed", claimError);
          return json({ success: false, error: "Rate limit check failed" }, 500);
        }

        if (!claimed || claimed.length === 0) {
          const { error: insertError } = await supabaseAdmin
            .from("webhook_runs")
            .insert({ name: JOB_NAME, last_run_at: now });
          if (insertError) {
            return json({ success: false, error: "Digest already ran recently" }, 429);
          }
        }

        try {
          const { runEmailDigests } = await import("@/lib/digest.server");
          const result = await runEmailDigests();
          return json({ success: result.failed === 0, ...result });
        } catch (e) {
          console.error("email-digest failed", e);
          return json({ success: false, error: e instanceof Error ? e.message : "failed" }, 500);
        }
      },
    },
  },
});
