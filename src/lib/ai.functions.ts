import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function callAI(messages: { role: string; content: string }[], schema?: object) {
  const { callAI: run } = await import("@/lib/ai-gateway.server");
  return run(messages, schema);
}

const ExistingRecordInput = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().nullable().default(null),
  application_url: z.string().nullable().default(null),
  organizer: z.string().nullable().default(null),
});

export const discoverOpportunities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        brief: z.string().min(3).max(2000),
        existing: z.array(ExistingRecordInput).max(600).default([]),
        focus: z.array(z.string().max(80)).max(30).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { findDuplicate, DUPLICATE_CONFIRMED, DUPLICATE_SUSPECTED, FOCUS_AREAS } =
      await import("@/lib/discovery");
    const focus = data.focus.length ? data.focus : FOCUS_AREAS;
    const today = new Date().toISOString().slice(0, 10);

    const { runDiscoverySwarm } = await import("@/lib/discovery-agents.server");
    const { candidates, agentsRun } = await runDiscoverySwarm({
      brief: data.brief,
      focus,
      existingNames: data.existing.slice(0, 400).map((e) => e.name),
    });

    const { activeModel } = await import("@/lib/ai-gateway.server");
    const aiModel = activeModel();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Existing discoveries count as "already known" too, so repeat runs stay clean.
    const { data: priorDiscoveries } = await supabaseAdmin
      .from("discoveries")
      .select("id, name, source_url, application_url")
      .neq("status", "dismissed");

    const knownDiscoveries = (priorDiscoveries ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      url: (d.source_url as string | null) ?? null,
      application_url: (d.application_url as string | null) ?? null,
    }));

    const date = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : null);
    const rows: Record<string, unknown>[] = [];
    // Agents overlap at the edges of their beats, so merge their findings too.
    const accepted: {
      id: string;
      name: string;
      url: string | null;
      application_url: string | null;
    }[] = [];
    let suppressed = 0;
    let flagged = 0;

    for (const o of candidates) {
      if (!o.name?.trim()) continue;
      const candidate = {
        name: o.name,
        source_url: o.source_url ?? null,
        application_url: o.application_url ?? null,
      };

      // Another agent already surfaced this one in the same run.
      const dupPeer = findDuplicate(candidate, accepted);
      if (dupPeer && dupPeer.score >= DUPLICATE_CONFIRMED) {
        suppressed += 1;
        continue;
      }

      // Already in the inbox from an earlier run — never show it twice.
      const dupDiscovery = findDuplicate(candidate, knownDiscoveries);
      if (dupDiscovery && dupDiscovery.score >= DUPLICATE_CONFIRMED) {
        suppressed += 1;
        continue;
      }

      const dupExisting = findDuplicate(candidate, data.existing);
      if (dupExisting && dupExisting.score >= DUPLICATE_CONFIRMED) {
        suppressed += 1;
        continue;
      }
      const suspected =
        dupExisting && dupExisting.score >= DUPLICATE_SUSPECTED ? dupExisting : null;
      // Near-miss against a peer from this same run: keep it, but flag it so a
      // human can merge instead of letting two near-identical rows land silently.
      const suspectedPeer =
        !suspected && dupPeer && dupPeer.score >= DUPLICATE_SUSPECTED ? dupPeer : null;
      if (suspected || suspectedPeer) flagged += 1;

      accepted.push({
        id: `run-${accepted.length}`,
        name: o.name,
        url: o.source_url ?? null,
        application_url: o.application_url ?? null,
      });

      rows.push({
        name: o.name.trim(),
        organizer: o.organizer || null,
        type: o.type as never,
        region: o.region || null,
        description: o.description,
        event_date: date(o.event_date),
        estimated_deadline: date(o.estimated_deadline),
        application_url: o.application_url || null,
        source_url: o.source_url || null,
        categories: (o.categories ?? []).slice(0, 8),
        relevance_score: Math.max(0, Math.min(100, Math.round(o.relevance_score))),
        rationale: o.rationale,
        confidence: ["high", "medium", "low"].includes(o.confidence ?? "")
          ? o.confidence!
          : "medium",
        duplicate_of: suspected?.id ?? null,
        research_notes: suspected
          ? `Possible duplicate of "${suspected.name}" — ${suspected.reason}.`
          : suspectedPeer
            ? `Possible duplicate of "${suspectedPeer.name}" found in the same scan — ${suspectedPeer.reason}.`
            : null,
        raw_extract: { brief: data.brief, model: aiModel, agent: o.agent ?? null },
        source: "ai_search",
        status: "new" as const,
      });
    }

    if (rows.length) {
      const { error } = await supabaseAdmin.from("discoveries").insert(rows as never);
      if (error) throw new Error(error.message);
    }
    return { added: rows.length, suppressed, flagged, agents: agentsRun };
  });

export const repurposeAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        prompt: z.string().min(3).max(2000),
        wordLimit: z.number().int().positive().max(5000).nullable().default(null),
        opportunity: z.string().max(500).default(""),
        sources: z.array(z.object({ title: z.string(), body: z.string().max(6000) })).max(6),
        instruction: z.string().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sourceBlock = data.sources
      .map((s, i) => `--- SOURCE ${i + 1}: ${s.title} ---\n${s.body}`)
      .join("\n\n");

    const draft = (await callAI([
      {
        role: "system",
        content:
          "You are a senior communications writer at a healthcare technology company. You adapt previously approved submission content to new award and speaking applications. Preserve factual claims, metrics and executive voice exactly as written in the source material; never invent statistics, customers or dates. Write in a confident, specific, jargon-light professional register.",
      },
      {
        role: "user",
        content: `Opportunity context: ${data.opportunity || "Not specified"}\n\nApplication question: ${
          data.prompt
        }\n${data.wordLimit ? `Word limit: ${data.wordLimit} words. Stay under it.` : ""}\n${
          data.instruction ? `Extra instruction: ${data.instruction}` : ""
        }\n\nApproved source material to repurpose:\n${sourceBlock || "(none provided — write a strong outline and flag gaps with [NEEDS INPUT])"}\n\nReturn only the answer text.`,
      },
    ])) as string;

    return { draft };
  });
