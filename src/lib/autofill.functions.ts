import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Per-user cap: each call fetches a page and spends a model call. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const recent = new Map<string, number[]>();

function rateLimit(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    throw new Error("Too many autofill requests. Wait a minute and try again.");
  }
  hits.push(now);
  recent.set(userId, hits);
}

export const autofillOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ url: z.string().url().max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    rateLimit(context.userId);
    const { autofillFromUrl } = await import("@/lib/autofill.server");
    return await autofillFromUrl(data.url);
  });
