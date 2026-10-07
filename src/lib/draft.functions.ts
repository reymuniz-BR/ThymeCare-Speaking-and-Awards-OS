import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { looksNumeric, isStale } from "@/lib/strategy";
import type { DraftResult } from "@/lib/draft";

const draftSchema = {
  type: "object",
  properties: {
    draft: {
      type: "string",
      description:
        "The proposed answer, written to the stated limit, using only the source material",
    },
    sources_used: {
      type: "array",
      description: "Every source the draft draws on, strongest first",
      items: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Source ref, e.g. S2" },
          how_used: { type: "string", description: "What this source contributed" },
        },
        required: ["ref", "how_used"],
      },
    },
    verifications: {
      type: "array",
      description: "Facts, metrics, dates and named claims in the draft that a human must verify",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          refs: { type: "array", items: { type: "string" } },
          why: {
            type: "string",
            description: "Why it needs checking, e.g. figure from a 2024 file",
          },
        },
        required: ["claim", "why"],
      },
    },
    gaps: {
      type: "array",
      description: "Information the question asks for that the library cannot supply",
      items: { type: "string" },
    },
    alternate: {
      type: "object",
      description: "Optional alternate angle on the same question",
      properties: {
        angle: { type: "string", description: "One line describing the different framing" },
        draft: { type: "string", description: "The alternate answer, same limit" },
      },
      required: ["angle", "draft"],
    },
  },
  required: ["draft", "sources_used", "verifications"],
};

/**
 * Drafts a proposed answer for a single application question.
 *
 * Retrieval is deterministic (the ranked Content Library shortlist); the model
 * may only compose from that shortlist, must respect the stated word or
 * character limit, and must cite what it used. Metrics, customer results,
 * quotes, awards and partnerships that are not in the sources are forbidden —
 * anything missing has to come back as a gap.
 */
export const draftAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        fieldId: z.string().uuid(),
        instruction: z.string().max(2000).optional(),
        angle: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<DraftResult> => {
    const { supabase } = context;
    const { callAI, activeModel } = await import("@/lib/ai-gateway.server");
    const { gatherLibrarySources } = await import("@/lib/library-context.server");

    const { data: field, error: fieldErr } = await supabase
      .from("submission_fields")
      .select(
        "id, prompt, answer, word_limit, char_limit, submission_id, submissions(title, opportunities(name, type, organizer, description, audience, region, category, notes))",
      )
      .eq("id", data.fieldId)
      .maybeSingle();
    if (fieldErr) throw new Error(fieldErr.message);
    if (!field) throw new Error("Question not found.");

    const row = field as unknown as {
      prompt: string;
      word_limit: number | null;
      char_limit: number | null;
      submission_id: string;
      submissions: {
        title: string;
        opportunities: {
          name: string;
          type: string | null;
          organizer: string | null;
          description: string | null;
          audience: string | null;
          region: string | null;
          category: string | null;
          notes: string | null;
        } | null;
      } | null;
    };
    const opp = row.submissions?.opportunities ?? null;

    const { sources, sourceBlock } = await gatherLibrarySources(
      supabase as never,
      {
        name: row.prompt,
        description: [row.prompt, opp?.description, data.instruction].filter(Boolean).join(" "),
        organizer: opp?.organizer ?? null,
        region: opp?.region ?? null,
        type: opp?.type ?? null,
        categories: opp?.category ? [opp.category] : [],
        rationale: opp?.name ?? null,
      },
      row.submission_id,
      12,
    );

    const limitLine = row.char_limit
      ? `Hard limit: ${row.char_limit} characters including spaces. Stay at or under it.`
      : row.word_limit
        ? `Hard limit: ${row.word_limit} words. Stay at or under it, ideally within 10% of it.`
        : "No stated limit — keep the answer tight and specific (roughly 150-250 words).";

    const result = (await callAI(
      [
        {
          role: "system",
          content: [
            "You draft award and speaking application answers for a healthcare technology company, working for its PR team.",
            "You may ONLY use facts contained in the numbered approved source material provided.",
            "Sources marked CANONICAL APPROVED FACT come from the Messaging & Proof Point Bank: they are the current, approved wording and figures. Prefer them over any older historical submission answer whenever both cover the same ground, and never contradict them. Historical submissions are precedent and narrative inspiration only.",
            "NEVER invent or estimate a metric, customer result, patient or member number, executive quote, job title, award, ranking, certification, partnership or company claim. If it is not in the sources, it does not exist — list it under gaps instead.",
            "Write in the client's own voice as it appears in the source material. Prefer reusing approved phrasing over inventing new phrasing.",
            "Cite every source you draw on in sources_used by ref.",
            "List every figure, percentage, currency amount, date, ranking, named customer and named executive that appears in your draft under verifications, with the ref it came from.",
            "Respect the stated limit exactly. Count before you answer.",
            "Where the question asks for something the sources cannot support, write around it and record it in gaps — do not fill the hole.",
            "Offer one alternate angle only when a genuinely different, defensible framing exists in the source material.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Today is ${new Date().toISOString().slice(0, 10)}.`,
            `OPPORTUNITY: ${opp?.name ?? "unlinked"} (${opp?.type ?? "unknown type"}) — organizer ${opp?.organizer ?? "unknown"}. Audience: ${opp?.audience ?? "unknown"}.`,
            `Program requirements on file: ${opp?.description ?? "not captured"}`,
            `SUBMISSION: ${row.submissions?.title ?? "untitled"}`,
            `APPLICATION QUESTION:\n${row.prompt}`,
            limitLine,
            data.angle ? `REQUESTED ANGLE: ${data.angle}` : "",
            data.instruction ? `EXTRA INSTRUCTION FROM THE TEAM: ${data.instruction}` : "",
            `\nAPPROVED SOURCE MATERIAL (the only material you may use)\n${sourceBlock}`,
            "\nDraft the answer.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      draftSchema,
    )) as {
      draft?: string;
      sources_used?: { ref: string; how_used: string }[];
      verifications?: { claim: string; refs?: string[]; why: string }[];
      gaps?: string[];
      alternate?: { angle: string; draft: string } | null;
    };

    const modelFlags = result.verifications ?? [];
    // Deterministic backstop: any sentence carrying a figure, or leaning on a
    // stale source, is flagged even when the model stayed quiet about it.
    const flagged = new Set(modelFlags.map((v) => v.claim.trim().toLowerCase()));
    const extra: DraftResult["verifications"] = [];
    for (const sentence of String(result.draft ?? "").split(/(?<=[.!?])\s+/)) {
      const text = sentence.trim();
      if (!text || flagged.has(text.toLowerCase())) continue;
      if (looksNumeric(text)) {
        extra.push({
          claim: text,
          refs: [],
          why: "Contains a figure or year — confirm it is current.",
        });
      }
    }
    const staleRefs = (result.sources_used ?? [])
      .map((u) => sources.find((s) => s.ref === u.ref))
      .filter((s) => s && isStale(s.sourceDate));
    for (const s of staleRefs) {
      if (!s) continue;
      extra.push({
        claim: `Material reused from “${s.title}”`,
        refs: [s.ref],
        why: "Source material is more than a year old — confirm it still holds.",
      });
    }

    return {
      draft: String(result.draft ?? "").trim(),
      alternate: result.alternate?.draft ? result.alternate : null,
      sources_used: result.sources_used ?? [],
      verifications: [
        ...modelFlags.map((v) => ({ claim: v.claim, refs: v.refs ?? [], why: v.why })),
        ...extra,
      ],
      gaps: result.gaps ?? [],
      sources,
      model: activeModel(),
    };
  });
