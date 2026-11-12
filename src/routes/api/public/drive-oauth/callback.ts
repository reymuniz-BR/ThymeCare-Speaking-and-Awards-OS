import { createFileRoute } from "@tanstack/react-router";

/**
 * Where Google sends a manager back after the Drive consent screen. Public by
 * necessity, so nothing happens without a valid signed `state`, and the outcome
 * is only ever a short code in the redirect back to Settings.
 */
export const Route = createFileRoute("/api/public/drive-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (outcome: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: `/settings?drive=${outcome}`, "Cache-Control": "no-store" },
          });

        if (url.searchParams.get("error")) return back("denied");

        try {
          const { driveClient } = await import("@/lib/drive-connection.server");
          const { supabaseAdmin, adminDb } = await import("@/integrations/supabase/client.server");
          const outcome = await driveClient().completeAuthorization({
            db: supabaseAdmin,
            state: url.searchParams.get("state"),
            code: url.searchParams.get("code"),
            isManager: async (uid) => {
              const role = (await adminDb.collection("user_roles").doc(uid).get()).data()?.["role"];
              return role === "admin" || role === "manager";
            },
          });
          return back(outcome);
        } catch (e) {
          console.error("drive-oauth callback failed", e instanceof Error ? e.message : "unknown");
          return back("failed");
        }
      },
    },
  },
});
