import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MessagingSyncResult = {
  sections: number;
  syncedAt: string;
};

/**
 * Pulls the master messaging document out of Google Drive and stores each
 * section as a tagged Content Library snippet, replacing the previous pull.
 */
export const syncMasterMessaging = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<MessagingSyncResult> => {
    const { pullMasterMessaging } = await import("@/lib/messaging.server");
    return pullMasterMessaging();
  });
