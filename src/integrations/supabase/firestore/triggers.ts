/**
 * Ports of the Postgres triggers that application behaviour depended on
 * (supabase/migrations): answer version numbering, the opportunity -> timeline
 * date sync, and the activity log. They run inside the query builder, so every
 * write path (browser or server) triggers them exactly once, as before.
 *
 * `updated_at` stamping lives in the builder itself.
 */
import type { TableApi } from "./builder.ts";
import type { Json } from "./filters.ts";
import type { TableName } from "./schema.generated.ts";

export type TriggerContext = {
  from: <T extends TableName>(table: T) => TableApi<T>;
  /** auth.uid() for browser writes; null for server-side jobs. */
  actorId: string | null;
};

export type TableTriggers = {
  beforeInsert?: (ctx: TriggerContext, row: Json, attempt: number) => Promise<void>;
  afterInsert?: (ctx: TriggerContext, row: Json) => Promise<void>;
  afterUpdate?: (ctx: TriggerContext, before: Json, after: Json) => Promise<void>;
};

type ActivityEntry = {
  entity_type: string;
  entity_id: string | null;
  opportunity_id: string | null;
  action: string;
  field?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  summary?: string | null;
};

const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const differs = (a: unknown, b: unknown) => (a ?? null) !== (b ?? null);

/** Audit rows are best effort: a logging failure must not fail the edit that caused it. */
async function logActivity(ctx: TriggerContext, entry: ActivityEntry): Promise<void> {
  const { error } = await ctx.from("activity_log").insert({
    actor_id: ctx.actorId,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    opportunity_id: entry.opportunity_id,
    action: entry.action,
    field: entry.field ?? null,
    old_value: entry.old_value ?? null,
    new_value: entry.new_value ?? null,
    summary: entry.summary ?? null,
  });
  if (error) console.warn("activity_log write failed:", error.message);
}

/** opportunities.<column> -> opportunity_dates.kind (public.sync_opportunity_dates). */
const DATE_SYNC = [
  ["opens", "open_date"],
  ["extended_deadline", "early_deadline"],
  ["deadline", "final_deadline"],
  ["notification", "announcement_date"],
  ["event_start", "event_date"],
] as const;

async function syncOpportunityDates(ctx: TriggerContext, opp: Json): Promise<void> {
  const opportunityId = String(opp["id"]);
  const { data: rows, error } = await ctx
    .from("opportunity_dates")
    .select("id, kind, date, note")
    .eq("opportunity_id", opportunityId);
  if (error) throw error;
  const auto = new Map<string, { id: string; date: string }>();
  for (const r of rows ?? []) if (r.note === "auto") auto.set(r.kind, { id: r.id, date: r.date });

  for (const [kind, column] of DATE_SYNC) {
    const value = text(opp[column]);
    const current = auto.get(kind);
    if (value === null) {
      if (current) await ctx.from("opportunity_dates").delete().eq("id", current.id);
    } else if (current) {
      if (current.date !== value) {
        await ctx.from("opportunity_dates").update({ date: value }).eq("id", current.id);
      }
    } else {
      await ctx
        .from("opportunity_dates")
        .insert({ opportunity_id: opportunityId, kind, date: value, note: "auto" });
    }
  }
}

export const TRIGGERS: { [T in TableName]?: TableTriggers } = {
  // assign_answer_version: number versions per field, 1-based.
  submission_answer_versions: {
    beforeInsert: async (ctx, row) => {
      const given = typeof row["version"] === "number" ? row["version"] : 0;
      if (given > 0) return;
      const { data, error } = await ctx
        .from("submission_answer_versions")
        .select("version")
        .eq("field_id", String(row["field_id"]));
      if (error) throw error;
      row["version"] = Math.max(0, ...(data ?? []).map((r) => r.version)) + 1;
    },
  },

  opportunities: {
    afterInsert: async (ctx, row) => {
      await logActivity(ctx, {
        entity_type: "opportunity",
        entity_id: text(row["id"]),
        opportunity_id: text(row["id"]),
        action: "created",
        summary: text(row["name"]),
      });
      await syncOpportunityDates(ctx, row);
    },
    afterUpdate: async (ctx, before, after) => {
      const base = {
        entity_type: "opportunity",
        entity_id: text(after["id"]),
        opportunity_id: text(after["id"]),
        summary: text(after["name"]),
      };
      if (differs(before["status"], after["status"])) {
        await logActivity(ctx, {
          ...base,
          action: "status_changed",
          field: "status",
          old_value: text(before["status"]),
          new_value: text(after["status"]),
        });
      }
      if (differs(before["owner_id"], after["owner_id"])) {
        await logActivity(ctx, {
          ...base,
          action: "owner_changed",
          field: "owner_id",
          old_value: text(before["owner_id"]),
          new_value: text(after["owner_id"]),
        });
      }
      if (differs(before["tier"], after["tier"])) {
        await logActivity(ctx, {
          ...base,
          action: "updated",
          field: "tier",
          old_value: text(before["tier"]),
          new_value: text(after["tier"]),
        });
      }
      if (DATE_SYNC.some(([, column]) => differs(before[column], after[column]))) {
        await syncOpportunityDates(ctx, after);
      }
    },
  },

  opportunity_dates: {
    afterInsert: async (ctx, row) => {
      await logActivity(ctx, {
        entity_type: "opportunity_date",
        entity_id: text(row["id"]),
        opportunity_id: text(row["opportunity_id"]),
        action: "date_added",
        field: text(row["kind"]),
        new_value: text(row["date"]),
      });
    },
    afterUpdate: async (ctx, before, after) => {
      if (!differs(before["date"], after["date"])) return;
      await logActivity(ctx, {
        entity_type: "opportunity_date",
        entity_id: text(after["id"]),
        opportunity_id: text(after["opportunity_id"]),
        action: "date_changed",
        field: text(after["kind"]),
        old_value: text(before["date"]),
        new_value: text(after["date"]),
      });
    },
  },

  submissions: {
    afterInsert: async (ctx, row) => {
      await logActivity(ctx, {
        entity_type: "submission",
        entity_id: text(row["id"]),
        opportunity_id: text(row["opportunity_id"]),
        action: "created",
        summary: text(row["title"]),
      });
    },
    afterUpdate: async (ctx, before, after) => {
      if (!differs(before["stage"], after["stage"])) return;
      await logActivity(ctx, {
        entity_type: "submission",
        entity_id: text(after["id"]),
        opportunity_id: text(after["opportunity_id"]),
        action: "stage_changed",
        field: "stage",
        old_value: text(before["stage"]),
        new_value: text(after["stage"]),
        summary: text(after["title"]),
      });
    },
  },
};
