import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TrackerSyncResult } from "./tracker-sync.server";

/**
 * Cross-checks the master Drive grid against the opportunities database.
 * Pass `dryRun` to see the differences without writing anything.
 */
export const syncTracker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dryRun?: boolean } | undefined) => ({
    dryRun: input?.dryRun === true,
  }))
  .handler(async ({ data, context }): Promise<TrackerSyncResult> => {
    const { syncTrackerGrid } = await import("./tracker-sync.server");
    return syncTrackerGrid({ dryRun: data.dryRun, db: context.supabase });
  });
