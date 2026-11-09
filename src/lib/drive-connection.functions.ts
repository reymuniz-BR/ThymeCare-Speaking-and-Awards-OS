import { createServerFn } from "@tanstack/react-start";
import { requireManagerAuth, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ROOT_FOLDER_ID } from "@/lib/drive-targets";
import { MASTER_MESSAGING_DOC_ID } from "@/lib/messaging";

/** Any team member can see whether Drive is connected; only managers change it. */
export const getDriveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { connectionStatus } = await import("@/lib/drive-connection.server");
    return {
      ...(await connectionStatus()),
      canManage: context.role === "admin" || context.role === "manager",
    };
  });

export const startDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireManagerAuth])
  .handler(async ({ context }) => {
    const { startAuthorization } = await import("@/lib/drive-connection.server");
    return { url: await startAuthorization(context.supabase, context.userId, context.email) };
  });

export const checkDriveAccess = createServerFn({ method: "POST" })
  .middleware([requireManagerAuth])
  .handler(async () => {
    const { driveClient } = await import("@/lib/drive-connection.server");
    const { TRACKER_FILE_ID } = await import("@/lib/tracker-sync.server");
    return driveClient().checkAccess([
      { label: "Content library folder", fileId: ROOT_FOLDER_ID },
      { label: "Master messaging doc", fileId: MASTER_MESSAGING_DOC_ID },
      { label: "Master tracker", fileId: TRACKER_FILE_ID },
    ]);
  });

export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireManagerAuth])
  .handler(async () => {
    const { driveClient } = await import("@/lib/drive-connection.server");
    await driveClient().disconnect();
    return { ok: true };
  });
