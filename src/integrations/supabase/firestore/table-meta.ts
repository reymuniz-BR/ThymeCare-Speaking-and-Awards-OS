/**
 * Facts the Postgres schema used to enforce for us and Firestore does not:
 * natural keys, column defaults and per-user tables. Ported from
 * supabase/migrations (see the notes beside each entry).
 */
import type { Row } from "./select-types.ts";
import type { TableName } from "./schema.generated.ts";

/**
 * Tables whose rows are addressed by a natural/unique key. The document ID is
 * derived from those columns, which gives us the two things the app depends on:
 * `insert` of a duplicate fails with 23505 (claim-before-send digests, single
 * flight webhook runs) and `upsert(onConflict)` is a direct document hit.
 *
 * Everything else uses its `id` column (random UUID unless supplied).
 */
export const DOC_KEY: { [T in TableName]?: ReadonlyArray<keyof Row<T> & string> } = {
  // PRIMARY KEY (name)
  webhook_runs: ["name"],
  job_secrets: ["name"],
  // PRIMARY KEY (submission_id, speaker_id)
  submission_speakers: ["submission_id", "speaker_id"],
  // UNIQUE INDEX (digest_key, coalesce(recipient, ''))
  email_digest_log: ["digest_key", "recipient"],
  // UNIQUE (week_start, item_key)
  brief_items: ["week_start", "item_key"],
  // UNIQUE (submission_id)
  submission_briefs: ["submission_id"],
  // UNIQUE (opportunity_id, year)
  opportunity_cycles: ["opportunity_id", "year"],
  // UNIQUE (field_id, version)
  submission_answer_versions: ["field_id", "version"],
  // UNIQUE INDEX (kind, coalesce(applies_to, '*'), value)
  taxonomy_options: ["kind", "applies_to", "value"],
  // UNIQUE (email); the doc ID is the lowercase email (firestore.rules checks it)
  allowed_emails: ["email"],
  // One role document per user, keyed by uid (firestore.rules reads user_roles/{uid})
  user_roles: ["user_id"],
};

/** Tables where every row is private to `user_id` (policy "own ..."). */
export const OWNER_SCOPED: ReadonlySet<TableName> = new Set<TableName>([
  "notifications",
  "saved_views",
]);

const now = () => new Date().toISOString();

type Defaults = { [T in TableName]?: { [C in keyof Row<T> & string]?: () => unknown } };

/** Column defaults for NOT NULL columns, from the original migrations. */
export const COLUMN_DEFAULTS: Defaults = {
  brief_items: { follow_up_done: () => false, reviewed: () => false },
  content_assets: { category: () => "other", tags: () => [] },
  content_snippets: { category: () => "boilerplate", tags: () => [], usage_count: () => 0 },
  discoveries: {
    categories: () => [],
    confidence: () => "medium",
    source: () => "ai",
    status: () => "new",
  },
  email_digest_log: { item_count: () => 0, sent_at: now, status: () => "sent" },
  monitoring_checks: {
    changes_found: () => 0,
    checked_at: now,
    confidence: () => "uncertain",
    ok: () => false,
    triggered_by: () => "manual",
  },
  opportunities: {
    change_detected: () => false,
    client_approval: () => "needs_approval",
    deadline_type: () => "tbd",
    monitoring_enabled: () => true,
    priority: () => "medium",
    recommendation: () => "needs_review",
    status: () => "monitoring",
    tags: () => [],
    tier: () => 2,
    type: () => "award",
  },
  opportunity_changes: {
    confidence: () => "uncertain",
    detected_at: now,
    review_status: () => "pending",
  },
  opportunity_cycles: { is_current: () => true },
  opportunity_dates: { confidence: () => "confirmed" },
  proof_points: {
    approved: () => false,
    content: () => "",
    tags: () => [],
    usage_count: () => 0,
  },
  saved_views: { filters: () => ({}) },
  speakers: { is_external: () => false, topics: () => [] },
  submission_answer_versions: {
    answer: () => "",
    char_count: () => 0,
    is_final: () => false,
    origin: () => "human",
    reusable: () => false,
    sources: () => [],
    verifications: () => [],
    word_count: () => 0,
  },
  submission_briefs: { brief: () => ({}), sources: () => [] },
  submission_fields: { answer: () => "", position: () => 0 },
  submissions: { stage: () => "draft" },
  taxonomy_options: { is_active: () => true, sort_order: () => 0, tone: () => "neutral" },
  webhook_runs: { last_run_at: now },
};

export type ReferentialAction = {
  /** Referencing table and column (the parent's `id` is what it points at). */
  table: TableName;
  column: string;
  action: "cascade" | "set_null";
};

/**
 * ON DELETE rules from the migrations (profiles excluded: users are never
 * deleted through the app). Applied by the builder after a parent row is
 * deleted, recursively, since Firestore has no foreign keys.
 */
export const REFERENTIAL_ACTIONS: { [T in TableName]?: readonly ReferentialAction[] } = {
  content_assets: [{ table: "content_snippets", column: "source_asset_id", action: "set_null" }],
  discoveries: [
    { table: "brief_items", column: "discovery_id", action: "cascade" },
    { table: "opportunities", column: "created_from_discovery_id", action: "set_null" },
  ],
  monitoring_checks: [{ table: "opportunity_changes", column: "check_id", action: "set_null" }],
  opportunities: [
    { table: "activity_log", column: "opportunity_id", action: "cascade" },
    { table: "brief_items", column: "opportunity_id", action: "cascade" },
    { table: "discoveries", column: "duplicate_of", action: "set_null" },
    { table: "discoveries", column: "promoted_opportunity_id", action: "set_null" },
    { table: "monitoring_checks", column: "opportunity_id", action: "cascade" },
    { table: "notifications", column: "opportunity_id", action: "cascade" },
    { table: "opportunity_changes", column: "opportunity_id", action: "cascade" },
    { table: "opportunity_cycles", column: "opportunity_id", action: "cascade" },
    { table: "opportunity_dates", column: "opportunity_id", action: "cascade" },
    { table: "submission_briefs", column: "opportunity_id", action: "set_null" },
    { table: "submissions", column: "opportunity_id", action: "cascade" },
  ],
  opportunity_cycles: [
    { table: "opportunity_dates", column: "cycle_id", action: "cascade" },
    { table: "submissions", column: "cycle_id", action: "set_null" },
  ],
  speakers: [
    { table: "proof_points", column: "speaker_id", action: "set_null" },
    { table: "submission_speakers", column: "speaker_id", action: "cascade" },
  ],
  submission_fields: [
    { table: "submission_answer_versions", column: "field_id", action: "cascade" },
    { table: "submission_fields", column: "reused_from_field_id", action: "set_null" },
  ],
  submissions: [
    { table: "brief_items", column: "submission_id", action: "cascade" },
    { table: "submission_answer_versions", column: "submission_id", action: "cascade" },
    { table: "submission_briefs", column: "submission_id", action: "cascade" },
    { table: "submission_fields", column: "submission_id", action: "cascade" },
    { table: "submission_speakers", column: "submission_id", action: "cascade" },
  ],
};
