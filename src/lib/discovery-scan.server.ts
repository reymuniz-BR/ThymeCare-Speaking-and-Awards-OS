/**
 * Shared discovery scan used by both the manual "Run discovery" action and the
 * daily scheduled scan.
 *
 * The daily scan is deliberately conservative: candidates below a relevance
 * floor are discarded rather than parked in the inbox, so an automated run only
 * ever adds programs that actually look like a fit for this client.
 */

import {
  findDuplicate,
  DUPLICATE_CONFIRMED,
  DUPLICATE_SUSPECTED,
  FOCUS_AREAS,
} from "@/lib/discovery";
import { runDiscoverySwarm } from "@/lib/discovery-agents.server";
import { activeModel } from "@/lib/ai-gateway.server";

export type ScanArgs = {
  brief: string;
  focus?: string[];
  /** Candidates scoring below this are dropped instead of being queued. */
  minRelevance?: number;
  /** Hard cap on rows inserted in one run. */
  maxRows?: number;
  source?: string;
};

export type ScanResult = {
  added: number;
  suppressed: number;
  flagged: number;
  belowThreshold: number;
  agents: number;
};

const dateOnly = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : null);

export async function runDiscoveryScan(args: ScanArgs): Promise<ScanResult> {
  const focus = args.focus?.length ? args.focus : FOCUS_AREAS;
  const minRelevance = args.minRelevance ?? 0;
  const maxRows = args.maxRows ?? 40;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existingRows } = await supabaseAdmin
    .from("opportunities")
    .select("id, name, url, application_url, organizer")
    .limit(600);
  const existing = (existingRows ?? []).map((o) => ({
    id: o.id as string,
    name: o.name as string,
    url: (o.url as string | null) ?? null,
    application_url: (o.application_url as string | null) ?? null,
  }));

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

  const { candidates, agentsRun } = await runDiscoverySwarm({
    brief: args.brief,
    focus,
    existingNames: existing.slice(0, 400).map((e) => e.name),
  });

  const aiModel = activeModel();
  const rows: Record<string, unknown>[] = [];
  const accepted: { id: string; name: string; url: string | null; application_url: string | null }[] =
    [];
  let suppressed = 0;
  let flagged = 0;
  let belowThreshold = 0;

  for (const o of candidates) {
    if (rows.length >= maxRows) break;
    if (!o.name?.trim()) continue;

    const score = Math.max(0, Math.min(100, Math.round(o.relevance_score ?? 0)));
    if (score < minRelevance) {
      belowThreshold += 1;
      continue;
    }

    const candidate = {
      name: o.name,
      source_url: o.source_url ?? null,
      application_url: o.application_url ?? null,
    };

    const dupPeer = findDuplicate(candidate, accepted);
    if (dupPeer && dupPeer.score >= DUPLICATE_CONFIRMED) {
      suppressed += 1;
      continue;
    }
    const dupDiscovery = findDuplicate(candidate, knownDiscoveries);
    if (dupDiscovery && dupDiscovery.score >= DUPLICATE_CONFIRMED) {
      suppressed += 1;
      continue;
    }
    const dupExisting = findDuplicate(candidate, existing);
    if (dupExisting && dupExisting.score >= DUPLICATE_CONFIRMED) {
      suppressed += 1;
      continue;
    }

    const suspected = dupExisting && dupExisting.score >= DUPLICATE_SUSPECTED ? dupExisting : null;
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
      event_date: dateOnly(o.event_date),
      estimated_deadline: dateOnly(o.estimated_deadline),
      application_url: o.application_url || null,
      source_url: o.source_url || null,
      categories: (o.categories ?? []).slice(0, 8),
      relevance_score: score,
      rationale: o.rationale,
      confidence: ["high", "medium", "low"].includes(o.confidence ?? "") ? o.confidence! : "medium",
      duplicate_of: suspected?.id ?? null,
      research_notes: suspected
        ? `Possible duplicate of "${suspected.name}" — ${suspected.reason}.`
        : suspectedPeer
          ? `Possible duplicate of "${suspectedPeer.name}" found in the same scan — ${suspectedPeer.reason}.`
          : null,
      raw_extract: { brief: args.brief, model: aiModel, agent: o.agent ?? null },
      source: args.source ?? "ai_search",
      status: "new" as const,
    });
  }

  if (rows.length) {
    const { error } = await supabaseAdmin.from("discoveries").insert(rows as never);
    if (error) throw new Error(error.message);
  }

  return { added: rows.length, suppressed, flagged, belowThreshold, agents: agentsRun };
}
