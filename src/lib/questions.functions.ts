import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExtractedQuestion } from "@/lib/questions.server";

/** Read a call-for-entries page or pasted application text into questions. */
export const extractQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        url: z.string().url().max(2000).optional(),
        text: z.string().max(60_000).optional(),
      })
      .refine((v) => Boolean(v.url || v.text), "Paste the application text or give a source URL.")
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ questions: ExtractedQuestion[] }> => {
    const { extractQuestionsFrom } = await import("@/lib/questions.server");
    const questions = await extractQuestionsFrom({
      ...(data.url ? { url: data.url } : {}),
      ...(data.text ? { text: data.text } : {}),
    });
    return { questions };
  });
