/**
 * Server-only deadline monitoring engine.
 *
 * For each monitored opportunity we fetch its official page, ask the model to
 * extract application-cycle facts, diff those against the stored record and
 * write *proposed* change records. Nothing on the opportunity row is ever
 * silently overwritten — only monitoring metadata is updated automatically.
 */

export const APPLICATION_STATES = [
  "not_announced",
  "not_yet_open",
  "open",
  "rolling",
  "closed",
  "unknown",
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

/** Fields the monitor is allowed to propose changes for. */
export const MONITORED_FIELDS: { field: string; label: string; kind: "date" | "text" }[] = [
  { field: "open_date", label: "Application open date", kind: "date" },
  { field: "early_deadline", label: "Early deadline", kind: "date" },
  { field: "final_deadline", label: "Final submission deadline", kind: "date" },
  { field: "event_date", label: "Event date", kind: "date" },
  { field: "announcement_date", label: "Publication / announcement date", kind: "date" },
  { field: "category", label: "Award categories", kind: "text" },
  { field: "audience", label: "Eligibility / audience", kind: "text" },
  { field: "application_url", label: "Application URL", kind: "text" },
  { field: "deadline_type", label: "Deadline type", kind: "text" },
];

const extractionSchema = {
  type: "object",
  properties: {
    application_state: { type: "string", enum: [...APPLICATION_STATES] },
    open_date: { type: "string", description: "YYYY-MM-DD or empty if unknown" },
    early_deadline: { type: "string", description: "YYYY-MM-DD or empty" },
    final_deadline: { type: "string", description: "YYYY-MM-DD or empty" },
    event_date: { type: "string", description: "YYYY-MM-DD or empty" },
    announcement_date: { type: "string", description: "YYYY-MM-DD or empty" },
    deadline_type: {
      type: "string",
      enum: ["confirmed", "estimated", "rolling", "tbd", "invitation_only", ""],
    },
    category: { type: "string", description: "Award categories or tracks, comma separated" },
    audience: { type: "string", description: "Eligibility criteria / who may apply" },
    application_url: { type: "string" },
    speaker_nomination: { type: "string", description: "Speaker nomination / CFP details" },
    confidence: { type: "string", enum: ["confirmed", "likely", "uncertain"] },
    summary: { type: "string", description: "Two sentences on what the page says right now" },
    notes: { type: "string", description: "Anything ambiguous a human should verify" },
  },
  required: ["application_state", "confidence", "summary"],
};

export type Extraction = {
  application_state: ApplicationState;
  open_date?: string;
  early_deadline?: string;
  final_deadline?: string;
  event_date?: string;
  announcement_date?: string;
  deadline_type?: string;
  category?: string;
  audience?: string;
  application_url?: string;
  speaker_nomination?: string;
  confidence: "confirmed" | "likely" | "uncertain";
  summary: string;
  notes?: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(url: string): Promise<string> {
  const { safeFetch } = await import("@/lib/safe-url.server");
  // Only public http(s) targets; private/internal addresses are refused,
  // and each redirect hop is re-checked.
  const res = await safeFetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ThymeCareProgramMonitor/1.0; +https://lovable.dev) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Source page returned HTTP ${res.status}`);
  const html = await res.text();
  const text = stripHtml(html);
  if (text.length < 120) throw new Error("Source page returned no readable content");
  return text.slice(0, 24_000);
}

async function extract(pageText: string, opp: OpportunityLike): Promise<Extraction> {
  const { callAI } = await import("@/lib/ai-gateway.server");
  return (await callAI(
    [
      {
        role: "system",
        content:
          "You monitor awards and speaking-opportunity websites for a healthcare technology company's communications team. Extract only facts stated on the page. Never guess or infer a date that is not written there — leave the field empty instead. Use confidence 'confirmed' only when the page states the fact explicitly and unambiguously for the current cycle; use 'likely' when it is implied or refers to a prior cycle; otherwise 'uncertain'. Today's date is " +
          new Date().toISOString().slice(0, 10) +
          ".",
      },
      {
        role: "user",
        content: `Opportunity: ${opp.name} (${opp.type})${
          opp.organizer ? ` — organizer: ${opp.organizer}` : ""
        }\nCurrently recorded: open ${opp.open_date ?? "—"}, early deadline ${
          opp.early_deadline ?? "—"
        }, final deadline ${opp.final_deadline ?? "—"}, event ${opp.event_date ?? "—"}, announcement ${
          opp.announcement_date ?? "—"
        }, deadline type ${opp.deadline_type ?? "—"}.\n\nPage content:\n${pageText}`,
      },
    ],
    extractionSchema,
  )) as Extraction;
}

export type OpportunityLike = {
  id: string;
  name: string;
  type: string;
  organizer: string | null;
  url: string | null;
  application_url: string | null;
  deadline_source_url: string | null;
  open_date: string | null;
  early_deadline: string | null;
  final_deadline: string | null;
  event_date: string | null;
  announcement_date: string | null;
  deadline_type: string | null;
  category: string | null;
  audience: string | null;
  monitoring_notes: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function normalize(field: string, value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const meta = MONITORED_FIELDS.find((f) => f.field === field);
  if (meta?.kind === "date") return ISO.test(v) ? v : null;
  return v;
}

export type CheckResult = {
  ok: boolean;
  checkId?: string;
  error?: string;
  changes: number;
  applicationState?: ApplicationState;
  confidence?: string;
  summary?: string;
};

/** Runs one monitoring check and persists the check + any proposed changes. */
export async function runCheck(
  opportunityId: string,
  options: { triggeredBy: "manual" | "schedule"; actorId?: string | null } = {
    triggeredBy: "manual",
  },
): Promise<CheckResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: opp, error: oppError } = await supabaseAdmin
    .from("opportunities")
    .select(
      "id,name,type,organizer,url,application_url,deadline_source_url,open_date,early_deadline,final_deadline,event_date,announcement_date,deadline_type,category,audience,monitoring_notes",
    )
    .eq("id", opportunityId)
    .maybeSingle();
  if (oppError) throw new Error(oppError.message);
  if (!opp) throw new Error("Opportunity not found");

  const record = opp as OpportunityLike;
  const sourceUrl = record.deadline_source_url || record.application_url || record.url;

  async function logCheck(fields: Record<string, unknown>) {
    const { data } = await supabaseAdmin
      .from("monitoring_checks")
      .insert({
        opportunity_id: opportunityId,
        source_url: sourceUrl,
        triggered_by: options.triggeredBy,
        actor_id: options.actorId ?? null,
        ...fields,
      } as never)
      .select("id")
      .single();
    return (data as { id: string } | null)?.id;
  }

  if (!sourceUrl) {
    const id = await logCheck({
      ok: false,
      confidence: "uncertain",
      error: "No source website or application URL is set for this opportunity.",
    });
    await supabaseAdmin
      .from("opportunities")
      .update({ last_checked_at: new Date().toISOString() } as never)
      .eq("id", opportunityId);
    return {
      ok: false,
      checkId: id ?? "",
      error: "No source website or application URL is set for this opportunity.",
      changes: 0,
    };
  }

  let finding: Extraction;
  try {
    const text = await fetchPageText(sourceUrl);
    finding = await extract(text, record);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Check failed";
    const id = await logCheck({ ok: false, confidence: "uncertain", error: message });
    await supabaseAdmin
      .from("opportunities")
      .update({ last_checked_at: new Date().toISOString() } as never)
      .eq("id", opportunityId);
    return { ok: false, checkId: id ?? "", error: message, changes: 0 };
  }

  const checkId = await logCheck({
    ok: true,
    application_state: finding.application_state,
    confidence: finding.confidence,
    summary: finding.summary,
    raw: finding as unknown as Record<string, unknown>,
  });

  // Diff — proposals only, never a direct write to the opportunity fields.
  const current = record as unknown as Record<string, string | null>;
  const proposals: Record<string, unknown>[] = [];

  for (const meta of MONITORED_FIELDS) {
    const next = normalize(meta.field, (finding as unknown as Record<string, string>)[meta.field]);
    if (!next) continue;
    const old = current[meta.field] ?? null;
    if (old === next) continue;

    proposals.push({
      opportunity_id: opportunityId,
      check_id: checkId ?? null,
      field: meta.field,
      label: meta.label,
      old_value: old,
      new_value: next,
      source_url: sourceUrl,
      confidence: finding.confidence,
      evidence: finding.summary,
      review_status: "pending",
    });
  }

  // Speaker nomination / CFP information is informational, never overwritten.
  if (finding.speaker_nomination?.trim()) {
    const note = finding.speaker_nomination.trim();
    if (!(record.monitoring_notes ?? "").includes(note.slice(0, 60))) {
      proposals.push({
        opportunity_id: opportunityId,
        check_id: checkId ?? null,
        field: "monitoring_notes",
        label: "Speaker nomination / CFP information",
        old_value: record.monitoring_notes,
        new_value: note,
        source_url: sourceUrl,
        confidence: finding.confidence === "confirmed" ? "likely" : finding.confidence,
        evidence: finding.notes ?? finding.summary,
        review_status: "pending",
      });
    }
  }

  // Drop proposals identical to a pending one so weekly runs do not pile up.
  const { data: existingPending } = await supabaseAdmin
    .from("opportunity_changes")
    .select("field,new_value")
    .eq("opportunity_id", opportunityId)
    .eq("review_status", "pending");
  const seen = new Set(
    ((existingPending ?? []) as { field: string; new_value: string | null }[]).map(
      (r) => `${r.field}::${r.new_value}`,
    ),
  );
  const fresh = proposals.filter((p) => !seen.has(`${p["field"]}::${p["new_value"]}`));

  if (fresh.length) {
    const { error } = await supabaseAdmin.from("opportunity_changes").insert(fresh as never);
    if (error) throw new Error(error.message);
  }

  if (checkId) {
    await supabaseAdmin
      .from("monitoring_checks")
      .update({ changes_found: fresh.length } as never)
      .eq("id", checkId);
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("opportunities")
    .update({
      last_checked_at: now,
      last_verified_at: now,
      application_state: finding.application_state,
      change_detected: fresh.length > 0,
      deadline_verified_at:
        finding.confidence === "confirmed" ? now.slice(0, 10) : (undefined as never),
    } as never)
    .eq("id", opportunityId);

  return {
    ok: true,
    checkId: checkId ?? "",
    changes: fresh.length,
    applicationState: finding.application_state,
    confidence: finding.confidence,
    summary: finding.summary,
  };
}

/** Weekly sweep across every monitoring-enabled opportunity. */
export async function runSweep(limit = 40) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("opportunities")
    .select("id")
    .eq("monitoring_enabled", true)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  let checked = 0;
  let failed = 0;
  let changes = 0;

  for (const id of ids) {
    try {
      const result = await runCheck(id, { triggeredBy: "schedule" });
      checked += 1;
      if (!result.ok) failed += 1;
      changes += result.changes;
    } catch {
      failed += 1;
    }
  }

  return { total: ids.length, checked, failed, changes };
}
