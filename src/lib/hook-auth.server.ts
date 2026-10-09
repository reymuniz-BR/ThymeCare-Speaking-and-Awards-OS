/**
 * Shared authentication for the scheduled-job endpoints under
 * src/routes/api/public/hooks. Those routes are public URLs, so a shared
 * secret is the only thing between the internet and an AI-credit-spending,
 * email-sending job.
 *
 * Rules (the originals' behaviour, restored):
 *  - Accepted secrets: the stored per-job secret (`job_secrets/<name>`, written
 *    by an operator with the admin SDK; clients cannot read it) and, where the
 *    route allows it, the MONITOR_WEBHOOK_SECRET environment variable.
 *  - No secret configured anywhere: 503. The route cannot be authenticated, so
 *    it refuses to run rather than falling open.
 *  - Missing or wrong secret: 401. Compared in constant time.
 *  - Request headers such as `x-cloudscheduler` or a Google-Cloud-Scheduler
 *    User-Agent are attacker-controlled and are NEVER treated as credentials.
 *    Cloud Scheduler must send the secret like any other caller.
 */

export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  let diff = av.length ^ bv.length;
  const max = Math.max(av.length, bv.length);
  for (let i = 0; i < max; i++) diff |= (av[i] ?? 0) ^ (bv[i] ?? 0);
  return diff === 0;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The secret the caller presented: `x-job-secret`, `x-monitor-secret`, or a bearer token. */
export function presentedSecret(request: Request): string {
  const header = request.headers.get("x-job-secret") ?? request.headers.get("x-monitor-secret");
  if (header) return header;
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

/**
 * Returns a Response to send back when the request must not proceed, or null
 * when it is authorised.
 */
export async function authorizeHook(
  request: Request,
  options: {
    /** Name of the stored secret in `job_secrets`; omit for env-secret-only routes. */
    jobName?: string;
    /** Also accept MONITOR_WEBHOOK_SECRET (default true). */
    acceptEnvSecret?: boolean;
  },
): Promise<Response | null> {
  const candidates: string[] = [];

  if (options.jobName) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("job_secrets")
        .select("secret")
        .eq("name", options.jobName)
        .maybeSingle();
      if (error) throw error;
      if (data?.secret) candidates.push(data.secret);
    } catch (e) {
      console.error(`hook auth: could not read the ${options.jobName} job secret`, e);
      return json({ error: "Not configured" }, 503);
    }
  }
  if (options.acceptEnvSecret !== false) {
    const env = process.env["MONITOR_WEBHOOK_SECRET"];
    if (env) candidates.push(env);
  }

  if (candidates.length === 0) {
    console.error(
      `hook auth: no secret configured${options.jobName ? ` for ${options.jobName}` : ""}; refusing to run`,
    );
    return json({ error: "Not configured" }, 503);
  }

  const provided = presentedSecret(request);
  if (!provided || !candidates.some((c) => safeEqual(provided, c))) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}
