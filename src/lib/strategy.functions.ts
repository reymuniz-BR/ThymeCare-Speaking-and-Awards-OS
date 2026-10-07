import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { matchContent } from "@/lib/content-match";
import type { BriefSource } from "@/lib/strategy";

const briefSchema = {
  type: "object",
  properties: {
    pursue: {
      type: "object",
      properties: {
        verdict: { type: "string", description: "Short call: Pursue, Pursue if capacity, or Pass" },
        rationale: { type: "string", description: "2-4 sentences on strategic value and fit" },
      },
      required: ["verdict", "rationale"],
    },
    narrative: {
      type: "object",
      properties: {
        headline: { type: "string", description: "One line positioning for this application" },
        summary: { type: "string", description: "Recommended narrative arc, 3-5 sentences" },
      },
      required: ["headline", "summary"],
    },
    best_matches: {
      type: "array",
      description: "Best matching past submissions, strongest first",
      items: {
        type: "object",
        properties: {
          refs: { type: "array", items: { type: "string" } },
          why: {
            type: "string",
            description: "Criteria, topic, executive or narrative similarity",
          },
          criteria_similarity: { type: "number", description: "0-100" },
        },
        required: ["refs", "why"],
      },
    },
    reusable: {
      type: "array",
      description: "Specific passages or themes worth reusing, quoted from the source",
      items: {
        type: "object",
        properties: {
          passage: { type: "string" },
          refs: { type: "array", items: { type: "string" } },
          how_to_use: { type: "string" },
        },
        required: ["passage", "refs", "how_to_use"],
      },
    },
    proof_points: {
      type: "array",
      description: "Metrics, customer examples, company facts and outcomes from the library",
      items: {
        type: "object",
        properties: {
          point: { type: "string" },
          refs: { type: "array", items: { type: "string" } },
          as_of: { type: "string", description: "Period the figure refers to, if stated" },
          needs_verification: { type: "boolean" },
        },
        required: ["point", "refs"],
      },
    },
    judge_signals: {
      type: "array",
      description:
        "What judges/reviewers for this kind of award or speaking program typically look for, and what makes a submission stand out. 4-6 items.",
      items: {
        type: "object",
        properties: {
          signal: { type: "string", description: "What judges look for, short phrase" },
          stands_out: {
            type: "string",
            description: "One sentence on what makes a submission stand out on this signal",
          },
        },
        required: ["signal", "stands_out"],
      },
    },
    gaps: {
      type: "array",
      description: "Requirements the library has no strong answer for",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string" },
          why: { type: "string" },
          needed_from: { type: "string", description: "Who or what could close it" },
        },
        required: ["requirement", "why"],
      },
    },
    evidence: {
      type: "array",
      description: "Strongest supporting evidence for this specific application",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          refs: { type: "array", items: { type: "string" } },
          needs_verification: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["claim", "refs"],
      },
    },
    weaknesses: {
      type: "array",
      description: "Potential weaknesses in the application",
      items: { type: "string" },
    },
  },
  required: ["pursue", "narrative", "gaps", "weaknesses", "judge_signals"],
};

/**
 * Builds the Submission Strategy Brief for a submission: ranks the approved
 * Content Library against the opportunity's requirements, then asks the model
 * to reason only over that shortlist, citing each recommendation back to a
 * source. It never drafts answers — drafting stays an explicit user action.
 */
export const generateSubmissionBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ submissionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { callAI, activeModel } = await import("@/lib/ai-gateway.server");

    const { data: submission, error: subErr } = await supabase
      .from("submissions")
      .select("id, title, opportunity_id, opportunities(*)")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!submission) throw new Error("Submission not found.");

    const opp = (submission as unknown as { opportunities: Record<string, unknown> | null })
      .opportunities;
    if (!opp) throw new Error("Link this submission to an opportunity before building a brief.");

    const { gatherLibrarySources } = await import("@/lib/library-context.server");
    const { sources, sourceBlock } = await gatherLibrarySources(
      supabase as never,
      {
        name: String(opp["name"] ?? ""),
        description: (opp["description"] as string | null) ?? null,
        organizer: (opp["organizer"] as string | null) ?? null,
        region: (opp["region"] as string | null) ?? null,
        type: (opp["type"] as string | null) ?? null,
        categories: opp["category"] ? [String(opp["category"])] : [],
        rationale: (opp["notes"] as string | null) ?? null,
      },
      data.submissionId,
      16,
    );

    const oppBlock = [
      `Name: ${opp["name"]}`,
      `Type: ${opp["type"]}`,
      `Organizer: ${opp["organizer"] ?? "unknown"}`,
      `Category: ${opp["category"] ?? "unknown"}`,
      `Audience: ${opp["audience"] ?? "unknown"}`,
      `Region / location: ${opp["region"] ?? "—"} / ${opp["location"] ?? "—"}`,
      `Tier: ${opp["tier"]} · Priority: ${opp["priority"]} · Fit score: ${opp["fit_score"] ?? "unscored"}`,
      `Recommendation on file: ${opp["recommendation"]}`,
      `Final deadline: ${opp["final_deadline"] ?? "unknown"} (${opp["deadline_type"]})`,
      `Event date: ${opp["event_date"] ?? "unknown"}`,
      `Application URL: ${opp["application_url"] ?? opp["url"] ?? "unknown"}`,
      `Description / requirements: ${opp["description"] ?? "not captured"}`,
      `Internal notes: ${opp["notes"] ?? "none"}`,
    ].join("\n");

    const result = (await callAI(
      [
        {
          role: "system",
          content: [
            "You are a senior awards and speaking strategist at a communications agency, briefing a healthcare technology client's PR team.",
            "You produce a Submission Strategy Brief before anyone drafts anything. Do NOT draft the submission or write finished application answers.",
            "You may only rely on the numbered source material provided. Cite sources by their ref (e.g. S2) in the refs array of every item.",
            "Quote reusable passages close to the original wording; do not invent metrics, customers, executives, dates or awards.",
            "Set needs_verification=true for any claim containing a figure, percentage, currency amount, ranking or year, or drawn from material older than a year.",
            "If the library cannot answer a requirement, say so in gaps rather than filling it in from general knowledge.",
            "For judge_signals, use your general knowledge of how this specific award or speaking program is evaluated: list what reviewers weight most and what separates a standout submission from an average one. This section is judging guidance, not a library claim, so it needs no refs and must not include invented Thyme Care metrics.",
            "Be specific and terse — this is an internal working document, not marketing copy.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Today is ${new Date().toISOString().slice(0, 10)}.\n\nOPPORTUNITY\n${oppBlock}\n\nAPPROVED CONTENT LIBRARY (ranked shortlist)\n${sourceBlock}\n\nProduce the Submission Strategy Brief.`,
        },
      ],
      briefSchema,
    )) as Record<string, unknown>;

    const payload = {
      submission_id: data.submissionId,
      opportunity_id: (submission as unknown as { opportunity_id: string | null }).opportunity_id,
      model: activeModel(),
      brief: result as never,
      sources: sources as never,
      generated_by: userId,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error } = await supabase
      .from("submission_briefs")
      .upsert(payload as never, { onConflict: "submission_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return saved as unknown as { id: string };
  });
