import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BriefSource } from "@/lib/strategy";

/** A ranked library match plus the full text needed to insert it. */
export type RecommendedSource = BriefSource & { body: string };

/**
 * Ranked reusable material for ONE application question.
 *
 * Retrieval is the same deterministic Content Library shortlist the drafting
 * feature uses, but the subject is the individual prompt rather than the whole
 * opportunity — so each question gets its own recommendations instead of one
 * generic list for the submission.
 */
export const recommendForField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ fieldId: z.string().uuid(), limit: z.number().min(1).max(20).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ sources: RecommendedSource[] }> => {
    const { supabase } = context;
    // Loose handle for the small dynamic-table reads below.
    const db = supabase as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          in: (col: string, ids: string[]) => Promise<{ data: unknown }>;
        };
      };
    };
    const { gatherLibrarySources } = await import("@/lib/library-context.server");

    const { data: field, error } = await supabase
      .from("submission_fields")
      .select(
        "id, prompt, submission_id, submissions(title, opportunities(name, type, description, organizer, region, category))",
      )
      .eq("id", data.fieldId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!field) throw new Error("That question no longer exists.");

    const row = field as unknown as {
      prompt: string;
      submission_id: string;
      submissions: {
        opportunities: {
          name: string;
          type: string;
          description: string | null;
          organizer: string | null;
          region: string | null;
          category: string | null;
        } | null;
      } | null;
    };
    const o = row.submissions?.opportunities ?? null;

    const { sources } = await gatherLibrarySources(
      supabase,
      {
        // The question itself carries the retrieval signal; the opportunity
        // supplies context so program-specific language still ranks.
        name: row.prompt,
        description: [row.prompt, o?.description].filter(Boolean).join(" "),
        organizer: o?.organizer ?? null,
        region: o?.region ?? null,
        type: o?.type ?? null,
        categories: [o?.category, o?.name].filter(Boolean) as string[],
      },
      row.submission_id,
      data.limit ?? 8,
    );

    // The shortlist only carries a preview; the drafting rail needs the full
    // text so "Insert" and "Use as starting point" produce real language.
    const idsOf = (kind: string) => sources.filter((s) => s.kind === kind).map((s) => s.id);
    const bodies = new Map<string, string>();

    async function load(
      table: string,
      column: string,
      kind: string,
      textColumn: string,
    ): Promise<void> {
      const ids = idsOf(kind);
      if (!ids.length) return;
      const { data: rows } = await db.from(table).select(`id, ${textColumn}`).in("id", ids);
      for (const r of (rows ?? []) as unknown as Record<string, string>[]) {
        const value = r[textColumn];
        if (value) bodies.set(`${kind}:${r["id"]}`, value);
      }
      void column;
    }

    await Promise.all([
      load("proof_points", "id", "proof_point", "content"),
      load("content_snippets", "id", "snippet", "body"),
      load("submission_fields", "id", "submission_field", "answer"),
      load("content_assets", "id", "asset", "extracted_text"),
    ]);

    return {
      sources: sources.map((s) => ({
        ...s,
        body: bodies.get(`${s.kind}:${s.id}`) ?? s.preview,
      })),
    };
  });
