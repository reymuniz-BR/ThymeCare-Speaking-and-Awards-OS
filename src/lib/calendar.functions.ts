import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Returns the private subscription URL for the program calendar feed. */
export const getCalendarFeedUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { readFeedToken } = await import("@/lib/calendar-feed.server");
    const token = await readFeedToken();
    return { token };
  });
