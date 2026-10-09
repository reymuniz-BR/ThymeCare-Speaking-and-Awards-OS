import { createServerFn } from "@tanstack/react-start";
import { requireManagerAuth } from "@/integrations/supabase/auth-middleware";

export type MessagingSyncResult = {
  sections: number;
  syncedAt: string;
};

/**
 * Pulls the master messaging document out of Google Drive and stores each
 * section as a tagged Content Library snippet, replacing the previous pull.
 */
export const syncMasterMessaging = createServerFn({ method: "POST" })
  // Replaces (deletes) the previous pull, which the original RLS reserved for managers.
  .middleware([requireManagerAuth])
  .handler(async ({ context }): Promise<MessagingSyncResult> => {
    const { pullMasterMessaging } = await import("@/lib/messaging.server");
    return pullMasterMessaging(context.supabase);
  });
