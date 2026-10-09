/**
 * Server-only Content Library retrieval shared by AI features.
 *
 * Ranks Drive assets, approved snippets and answers from previous submissions
 * against a subject (an opportunity, or a single application question) and
 * returns both the citable source records and the prompt block the model is
 * allowed to reason over. Nothing outside this shortlist may be used.
 */

import { matchContent } from "@/lib/content-match";
import { MASTER_MESSAGING_TAG } from "@/lib/messaging";
import { isCitable } from "@/lib/proof-points";
import type { MatchSubject } from "@/lib/content-match";
import type { BriefSource } from "@/lib/strategy";

type AssetRow = {
  id: string;
  name: string;
  category: string;
  summary: string | null;
  extracted_text: string | null;
  tags: string[] | null;
  web_view_link: string | null;
  last_synced_at: string | null;
  updated_at: string;
};
type SnippetRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[] | null;
  updated_at: string;
};
type ProofRow = {
  id: string;
  title: string;
  kind: string;
  content: string;
  theme: string | null;
  executive_name: string | null;
  tags: string[] | null;
  source: string | null;
  source_url: string | null;
  source_date: string | null;
  last_verified_at: string | null;
  expires_on: string | null;
  approved: boolean;
  updated_at: string;
};
type FieldRow = {
  id: string;
  prompt: string;
  answer: string;
  submission_id: string;
  updated_at: string;
  submissions: { title: string; opportunities: { name: string; type: string } | null } | null;
};

import type { AppDb } from "@/integrations/supabase/firestore/builder";

// The server-side client from the auth middleware (admin Firestore).
type Client = AppDb;

export async function gatherLibrarySources(
  supabase: Client,
  subject: MatchSubject,
  excludeSubmissionId: string | null,
  limit = 12,
): Promise<{ sources: BriefSource[]; sourceBlock: string }> {
  const fieldQuery = supabase
    .from("submission_fields")
    .select(
      "id, prompt, answer, submission_id, updated_at, submissions(title, opportunities(name, type))",
    )
    .neq("answer", "")
    .order("updated_at", { ascending: false })
    .limit(300);

  const [proofRes, assetsRes, snippetsRes, fieldsRes, messagingRes] = await Promise.all([
    supabase
      .from("proof_points")
      .select(
        "id, title, kind, content, theme, executive_name, tags, source, source_url, source_date, last_verified_at, expires_on, approved, updated_at",
      )
      .eq("approved", true)
      .limit(400),
    supabase
      .from("content_assets")
      .select(
        "id, name, category, summary, extracted_text, tags, web_view_link, last_synced_at, updated_at",
      )
      .limit(400),
    supabase
      .from("content_snippets")
      .select("id, title, body, category, tags, updated_at")
      .limit(300),
    excludeSubmissionId ? fieldQuery.neq("submission_id", excludeSubmissionId) : fieldQuery,
    // The master messaging document is always in scope, never ranked out.
    supabase
      .from("content_snippets")
      .select("id, title, body, category, tags, updated_at")
      .contains("tags", [MASTER_MESSAGING_TAG])
      .limit(24),
  ]);

  const messaging = (messagingRes.data ?? []) as SnippetRow[];
  const messagingIds = new Set(messaging.map((m) => m.id));

  // Only approved, unexpired bank entries count as canonical current fact.
  const proofPoints = ((proofRes.data ?? []) as ProofRow[]).filter((p) => isCitable(p));
  const assets = (assetsRes.data ?? []) as AssetRow[];
  const snippets = (snippetsRes.data ?? []) as SnippetRow[];
  const fieldRows = (fieldsRes.data ?? []) as FieldRow[];

  const matches = matchContent(
    subject,
    {
      proofPoints,
      assets,
      snippets: snippets.filter((s) => !messagingIds.has(s.id)),
      submissionFields: fieldRows.map((f) => ({
        id: f.id,
        prompt: f.prompt,
        answer: f.answer,
        submissionId: f.submission_id,
        submissionTitle: f.submissions?.title ?? "Untitled submission",
        opportunityName: f.submissions?.opportunities?.name ?? null,
        opportunityType: f.submissions?.opportunities?.type ?? null,
      })),
    },
    limit,
  );

  const proofById = new Map(proofPoints.map((p) => [p.id, p]));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const snippetById = new Map([...snippets, ...messaging].map((s) => [s.id, s]));
  const fieldById = new Map(fieldRows.map((f) => [f.id, f]));

  const pinned: BriefSource[] = messaging.map((m) => ({
    ref: "",
    kind: "snippet" as const,
    id: m.id,
    title: `Master messaging — ${m.title}`,
    subtitle: "Approved company messaging",
    category: m.category,
    url: null,
    sourceDate: m.updated_at,
    preview: m.body.slice(0, 240),
    score: 1,
    reasons: ["Master messaging document"],
  }));

  const ranked: BriefSource[] = matches.map((m, i) => ({
    ref: `S${pinned.length + i + 1}`,
    kind: m.kind,
    id: m.id,
    title: m.title,
    subtitle: m.subtitle ?? null,
    category: m.category,
    url: m.kind === "proof_point" ? (proofById.get(m.id)?.source_url ?? null) : (m.url ?? null),
    sourceDate:
      m.kind === "proof_point"
        ? (proofById.get(m.id)?.last_verified_at ??
          proofById.get(m.id)?.source_date ??
          proofById.get(m.id)?.updated_at ??
          null)
        : m.kind === "asset"
          ? (assetById.get(m.id)?.last_synced_at ?? assetById.get(m.id)?.updated_at ?? null)
          : m.kind === "snippet"
            ? (snippetById.get(m.id)?.updated_at ?? null)
            : (fieldById.get(m.id)?.updated_at ?? null),
    preview: m.preview,
    score: Math.round(m.score * 100) / 100,
    reasons: m.reasons,
  }));

  const sources: BriefSource[] = [...pinned.map((p, i) => ({ ...p, ref: `S${i + 1}` })), ...ranked];

  const sourceBlock = sources.length
    ? sources
        .map((s) => {
          if (s.kind === "proof_point") {
            const p = proofById.get(s.id)!;
            return [
              `[${s.ref}] kind=proof_point CANONICAL APPROVED FACT category=${p.kind} title="${p.title}"`,
              `theme=${p.theme ?? "none"} executive=${p.executive_name ?? "n/a"} source="${p.source ?? "unstated"}" source_date=${p.source_date ?? "unknown"} last_verified=${p.last_verified_at ?? "never"} expires=${p.expires_on ?? "n/a"}`,
              p.content.slice(0, 2500),
            ].join("\n");
          }
          const body =
            s.kind === "asset"
              ? (assetById.get(s.id)?.summary ??
                assetById.get(s.id)?.extracted_text ??
                "No indexed text.")
              : s.kind === "snippet"
                ? (snippetById.get(s.id)?.body ?? "")
                : `Q: ${fieldById.get(s.id)?.prompt ?? ""}\nA: ${fieldById.get(s.id)?.answer ?? ""}`;
          return `[${s.ref}] kind=${s.kind} category=${s.category} title="${s.title}" last_updated=${
            s.sourceDate ?? "unknown"
          }\n${String(body).slice(0, 2500)}`;
        })
        .join("\n\n")
    : "(the approved Content Library is empty — there is no source material to draw on)";

  return { sources, sourceBlock };
}
