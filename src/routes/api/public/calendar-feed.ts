import { createFileRoute } from "@tanstack/react-router";

/**
 * Subscribable ICS feed of every program date.
 *
 * Auth: a private token stored in public.job_secrets ('calendar-feed'), passed
 * as ?token=... because calendar clients cannot send custom headers. The
 * publishable key is NOT accepted.
 */
export const Route = createFileRoute("/api/public/calendar-feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const { readFeedToken, safeEqual, buildProgramCalendar } =
          await import("@/lib/calendar-feed.server");
        const secret = await readFeedToken();
        if (!secret) return new Response("Not configured", { status: 503 });
        if (!token || !safeEqual(token, secret)) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const ics = await buildProgramCalendar();
          return new Response(ics, {
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
              "Content-Disposition": 'inline; filename="thyme-care-program.ics"',
              "Cache-Control": "public, max-age=1800",
            },
          });
        } catch (e) {
          console.error("calendar-feed failed", e);
          return new Response("Feed unavailable", { status: 500 });
        }
      },
    },
  },
});
