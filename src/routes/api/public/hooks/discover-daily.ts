import { createFileRoute } from "@tanstack/react-router";

const JOB_NAME = "discover-daily";
const PAUSE_NAME = "discover-daily-paused";
const MIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // at most one scan per ~week

/** Relevance floor — an automated run only queues candidates that look like a fit. */
const MIN_RELEVANCE = 70;
/** Hard cap on rows added per run. */
const MAX_ROWS = 12;

/**
 * Rotating weekly briefs: each Monday covers one slice of the landscape, so the
 * automated scan stays cheap and specific instead of re-running everything.
 */
const WEEKLY_BRIEFS: string[] = [
  "Healthcare, digital health and health technology company awards, innovation awards and industry rankings with submission deadlines in the next 9 months.",
  "Open calls for speakers, speaker nominations and conference programming opportunities at US healthcare, payer, provider and digital health conferences.",
  "Executive awards, healthcare leadership lists and 'most influential' rankings recognizing individual healthcare technology executives.",
  "Fast-growth, workplace and high-performing company lists open to venture-backed healthcare technology and value-based care companies.",
  "Awards, rankings and speaking opportunities focused on oncology and cancer care, value-based care and employer healthcare innovation.",
  "Regional business journal, state healthcare association and niche trade-media award and speaking programs relevant to a US healthcare technology company.",
  "Association, payer, provider and policy-body recognition programs, quality awards and member-meeting speaking slots in healthcare.",
];

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  let diff = av.length ^ bv.length;
  const max = Math.max(av.length, bv.length);
  for (let i = 0; i < max; i++) diff |= (av[i] ?? 0) ^ (bv[i] ?? 0);
  return diff === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Terminal AI-gateway states that must park the job instead of retrying. */
function isBlocked(message: string): boolean {
  return /credits exhausted|rejected|disabled|forbidden|402|403/i.test(message);
}

/**
 * Weekly discovery scan, called by the Monday scheduled job.
 *
 * Auth: MONITOR_WEBHOOK_SECRET as `x-monitor-secret` (or a bearer token),
 * compared in constant time. The publishable key is NOT accepted.
 *
 * Safety: one scan per ~6 days claimed atomically in public.webhook_runs, a hard
 * row cap, a relevance floor, and a persisted pause on AI credit/policy blocks
 * that later runs probe with a single reduced scan before resuming.
 */
export const Route = createFileRoute("/api/public/hooks/discover-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header = request.headers.get("x-job-secret") ?? request.headers.get("x-monitor-secret");
        const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        const provided = header ?? bearer;
        if (!provided) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Accepted secrets: the stored job secret, or the monitoring webhook secret.
        const { data: secretRow } = await supabaseAdmin
          .from("job_secrets")
          .select("secret")
          .eq("name", JOB_NAME)
          .maybeSingle();
        const candidates = [secretRow?.secret ?? "", process.env["MONITOR_WEBHOOK_SECRET"] ?? ""];
        if (!candidates.some((s) => s && safeEqual(provided, s)))
          return json({ error: "Unauthorized" }, 401);

        const now = new Date().toISOString();
        const cutoff = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();


        // Single-flight: the update only lands when the last run is old enough.
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
          if (insertError) return json({ success: false, error: "Already scanned this week" }, 429);
        }

        // Paused-state guard: while parked, do one reduced probe scan only.
        const { data: pauseRow } = await supabaseAdmin
          .from("webhook_runs")
          .select("name")
          .eq("name", PAUSE_NAME)
          .maybeSingle();
        const paused = Boolean(pauseRow);

        // Rotate one lane per week (weeks since epoch), not per day.
        const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
        const brief = WEEKLY_BRIEFS[weekIndex % WEEKLY_BRIEFS.length]!;
        const since = new Date().toISOString();

        try {
          const { runDiscoveryScan } = await import("@/lib/discovery-scan.server");
          const result = await runDiscoveryScan({
            brief,
            minRelevance: MIN_RELEVANCE,
            maxRows: paused ? 2 : MAX_ROWS,
            source: "weekly_scan",
          });

          if (paused) {
            await supabaseAdmin.from("webhook_runs").delete().eq("name", PAUSE_NAME);
          }

          // Mail the week's finds. A send failure must not fail the scan.
          let email: unknown = null;
          try {
            const { sendDiscoverEmail } = await import("@/lib/discovery-email.server");
            email = await sendDiscoverEmail({ brief, since, suppressed: result.suppressed });
          } catch (e) {
            email = { error: e instanceof Error ? e.message : "Email failed" };
          }

          return json({ success: true, brief, resumed: paused, ...result, email });
        } catch (e) {
          const message = e instanceof Error ? e.message : "failed";
          if (isBlocked(message)) {
            await supabaseAdmin
              .from("webhook_runs")
              .upsert({ name: PAUSE_NAME, last_run_at: now }, { onConflict: "name" });
            console.error("discover-daily paused:", message);
            return json({ success: false, paused: true, error: message }, 200);
          }
          console.error("discover-daily failed", e);
          return json({ success: false, error: message }, 500);
        }
      },
    },
  },
});
