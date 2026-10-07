import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkOpportunityNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { runCheck } = await import("@/lib/monitoring.server");
    return runCheck(data.id, { triggeredBy: "manual", actorId: context.userId });
  });

export const runMonitoringSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(40) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { runSweep } = await import("@/lib/monitoring.server");
    return runSweep(data.limit);
  });
