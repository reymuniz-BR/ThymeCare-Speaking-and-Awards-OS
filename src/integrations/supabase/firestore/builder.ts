/**
 * A typed, Supabase-style query builder over an injectable Firestore backend.
 *
 *   const { data, error } = await db.from("opportunities")
 *     .select("*, opportunity_dates(*)")
 *     .eq("status", "monitoring")
 *     .order("created_at", { ascending: false });
 *
 * Semantics follow PostgREST/Postgres, not Firestore: errors are returned
 * (never thrown), NULL never matches a comparison, nulls sort last ascending,
 * `.single()` fails unless exactly one row matched, inserts apply column
 * defaults and unique constraints, embedded relations resolve through the
 * schema's foreign keys.
 */
import type { Backend, Doc, PlannedWrite, StoredDoc, WriteOp } from "./backend.ts";
import { DbError, SINGLE_ROW_VIOLATION, UNIQUE_VIOLATION, toDbError } from "./errors.ts";
import {
  matchesAll,
  parseInList,
  sortRows,
  type Filter,
  type FilterOp,
  type Json,
  type Order,
} from "./filters.ts";
import { TABLE_SCHEMA, type TableName } from "./schema.generated.ts";
import { parseSelect, resolveRelation, type SelectNode } from "./select-parse.ts";
import type { ColumnOf, InsertRow, Row, SelectResult, UpdateRow } from "./select-types.ts";
import { COLUMN_DEFAULTS, DOC_KEY, OWNER_SCOPED, REFERENTIAL_ACTIONS } from "./table-meta.ts";
import { TRIGGERS, type TriggerContext } from "./triggers.ts";

export type DbResponse<R> =
  | { data: R; error: null; count: number | null }
  | { data: null; error: DbError; count: number | null };

type Mode = "select" | "insert" | "update" | "upsert" | "delete";
type Cardinality = "many" | "one" | "maybe";
type SelectOptions = { count?: "exact" | "planned" | "estimated" };
type UpsertOptions = { onConflict?: string; ignoreDuplicates?: boolean };
type Loaded = { id: string; row: Json };
type Outcome = { rows: Json[]; count: number | null };
type UpsertHit = { kind: "insert" | "skip"; row: Json } | { kind: "update"; row: Json; old: Json };

const MAX_INSERT_ATTEMPTS = 6;
/** Firestore's cap on `in` values per query. */
const IN_LIMIT = 30;

function chunk<V>(items: readonly V[], size: number): V[][] {
  const out: V[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
/** Tables whose BEFORE INSERT trigger numbers rows and may collide under concurrency. */
const RETRY_ON_CONFLICT: ReadonlySet<TableName> = new Set<TableName>([
  "submission_answer_versions",
]);

// ---------------------------------------------------------------- row codecs

const columnsOf = (table: TableName): readonly string[] => TABLE_SCHEMA[table].columns;
const nullableOf = (table: TableName): readonly string[] => TABLE_SCHEMA[table].nullable;
const hasColumn = (table: TableName, column: string) => columnsOf(table).includes(column);

/** Firestore Timestamps (web or admin) become ISO strings; everything else passes through. */
function revive(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return value;
}

/** Stored document -> the row the app sees (id filled in, absent nullable columns = null). */
function toRow(table: TableName, stored: StoredDoc): Json {
  const row: Json = {};
  for (const [key, value] of Object.entries(stored.data)) row[key] = revive(value);
  if (hasColumn(table, "id")) row["id"] = stored.id;
  for (const column of nullableOf(table)) if (row[column] === undefined) row[column] = null;
  return row;
}

/** Drop `undefined` (as JSON would) and normalise Dates, deeply. Firestore rejects undefined. */
function serialize<V>(value: V): V {
  if (value instanceof Date) return value.toISOString() as unknown as V;
  if (Array.isArray(value)) return value.map((v) => serialize(v)) as unknown as V;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = serialize(v);
    }
    return out as V;
  }
  return value;
}

function assertKnownColumns(table: TableName, data: Json): void {
  for (const key of Object.keys(data)) {
    if (!hasColumn(table, key)) {
      throw new DbError(
        `Could not find the '${key}' column of '${table}'`,
        "PGRST204",
        null,
        "Columns are defined in src/integrations/supabase/types.ts.",
      );
    }
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * One segment of a natural-key document ID. Characters outside [A-Za-z0-9_-]
 * are escaped (`~3a` for ':') so IDs satisfy firestore.rules' isValidId and the
 * mapping stays injective. Emails are the one exception: allowed_emails IDs are
 * the raw lowercase address, which the rules compare to the caller's token.
 */
function idPart(table: TableName, column: string, value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (table === "allowed_emails" && column === "email") return s.trim().toLowerCase();
  if (table === "taxonomy_options" && column === "applies_to" && s === "") s = "any";
  return s.replace(/[^A-Za-z0-9_-]/g, (c) => `~${c.charCodeAt(0).toString(16)}`);
}

/** Document ID from a row's natural key; null when a key column is not supplied. */
function docIdFromRow(table: TableName, row: Json): string | null {
  const key = DOC_KEY[table] as readonly string[] | undefined;
  if (!key) return typeof row["id"] === "string" && row["id"] ? row["id"] : null;
  if (key.some((c) => row[c] === undefined)) return null;
  const id = key.map((c) => idPart(table, c, row[c])).join("__");
  return /^__.*__$/.test(id) || id === "." || id === ".." ? `k${id}` : id;
}

/** The document ID is derived from the key columns, so they cannot be edited in place. */
function assertKeyUnchanged(table: TableName, before: Json, patch: Json): void {
  const key = DOC_KEY[table] as readonly string[] | undefined;
  for (const column of key ?? []) {
    if (
      column in patch &&
      idPart(table, column, before[column]) !== idPart(table, column, patch[column])
    ) {
      throw new DbError(
        `Cannot change '${column}' of a '${table}' row; delete it and insert a new one`,
        "23000",
        "The document ID is derived from this column.",
      );
    }
  }
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Defaults, nulls, ids and timestamps for a brand-new row. */
function buildInsertRow(table: TableName, input: Json): Json {
  assertKnownColumns(table, input);
  const row: Json = {};
  for (const column of nullableOf(table)) row[column] = null;
  const defaults = (COLUMN_DEFAULTS[table] ?? {}) as Record<string, (() => unknown) | undefined>;
  for (const [column, make] of Object.entries(defaults)) if (make) row[column] = make();
  for (const [key, value] of Object.entries(serialize(input)))
    if (value !== undefined) row[key] = value;

  const now = new Date().toISOString();
  if (hasColumn(table, "created_at") && !row["created_at"]) row["created_at"] = now;
  if (hasColumn(table, "updated_at") && !row["updated_at"]) row["updated_at"] = now;

  return row;
}

/**
 * Fix the row's identity: natural-key tables derive their document ID (and
 * `id`) from the key columns, everything else gets a random UUID. Runs after
 * BEFORE INSERT triggers because some keys (answer `version`) are assigned there.
 */
function assignId(table: TableName, row: Json): string {
  if (DOC_KEY[table]) {
    // Lower-case emails everywhere so rules and lookups agree.
    if (table === "allowed_emails" && typeof row["email"] === "string") {
      row["email"] = row["email"].trim().toLowerCase();
    }
    const id = docIdFromRow(table, row);
    if (id === null) {
      throw new DbError(
        `Missing key column(s) for '${table}': ${(DOC_KEY[table] as readonly string[]).join(", ")}`,
        "23502",
      );
    }
    if (hasColumn(table, "id")) row["id"] = id;
    return id;
  }
  if (hasColumn(table, "id") && !row["id"]) row["id"] = newId();
  return docIdOf(table, row);
}

function docIdOf(table: TableName, row: Json): string {
  const id = docIdFromRow(table, row);
  if (id === null) throw new DbError(`Cannot determine the document ID for '${table}'`, "23502");
  return id;
}

const isScalar = (v: unknown): v is string | number | boolean =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

// -------------------------------------------------------------------- reads

/** Document IDs the filters pin down exactly, or null when a scan is needed. */
function pinnedIds(table: TableName, filters: readonly Filter[]): string[] | null {
  const positive = filters.filter((f) => !f.negate);
  const key = DOC_KEY[table] as readonly string[] | undefined;
  if (key) {
    const parts: Json = {};
    for (const c of key) {
      const f = positive.find((x) => x.op === "eq" && x.column === c && x.value !== null);
      if (f) parts[c] = f.value;
    }
    const id = docIdFromRow(table, parts);
    if (id !== null) return [id];
  }
  if (hasColumn(table, "id")) {
    const eq = positive.find(
      (f) => f.op === "eq" && f.column === "id" && typeof f.value === "string",
    );
    if (eq) return [eq.value as string];
    const inn = positive.find((f) => f.op === "in" && f.column === "id" && Array.isArray(f.value));
    if (inn) return (inn.value as unknown[]).filter((v): v is string => typeof v === "string");
  }
  return null;
}

function scoped(backend: Backend, table: TableName, filters: readonly Filter[]): Filter[] {
  if (backend.scopeToOwner && OWNER_SCOPED.has(table)) {
    return [
      ...filters,
      { column: "user_id", op: "eq", value: backend.actorId ?? "__signed_out__" },
    ];
  }
  return [...filters];
}

async function fetchLoaded(
  backend: Backend,
  table: TableName,
  rawFilters: readonly Filter[],
): Promise<Loaded[]> {
  const filters = scoped(backend, table, rawFilters);
  if (filters.some((f) => f.op === "in" && !f.negate && (f.value as unknown[]).length === 0))
    return [];

  const ids = pinnedIds(table, filters);
  let stored: StoredDoc[];
  if (ids) {
    stored = ids.length ? await backend.getMany(table, ids) : [];
  } else {
    const eq = filters
      .filter((f) => f.op === "eq" && !f.negate && isScalar(f.value))
      .map((f) => [f.column, f.value] as const);
    const inFilter = filters.find((f) => f.op === "in" && !f.negate);
    if (inFilter) {
      // Firestore `in` takes at most 30 values: query in slices and merge.
      const merged = new Map<string, StoredDoc>();
      for (const part of chunk(inFilter.value as unknown[], IN_LIMIT)) {
        const found = await backend.list(table, {
          eq,
          in: { column: inFilter.column, values: part },
        });
        for (const d of found) merged.set(d.id, d);
      }
      stored = [...merged.values()];
    } else {
      stored = await backend.list(table, { eq });
    }
  }
  return stored
    .map((s) => ({ id: s.id, row: toRow(table, s) }))
    .filter((l) => matchesAll(l.row, filters));
}

async function shapeRows(
  backend: Backend,
  table: TableName,
  rows: readonly Json[],
  nodes: readonly SelectNode[],
): Promise<Json[]> {
  const relations = nodes.filter(
    (n): n is Extract<SelectNode, { kind: "relation" }> => n.kind === "relation",
  );
  const embedded = new Map<SelectNode, (row: Json) => unknown>();

  for (const node of relations) {
    const rel = resolveRelation(table, node);
    if (rel.kind === "to-one") {
      const keys = [...new Set(rows.map((r) => r[rel.localColumn]).filter((v) => v != null))];
      const targets: Loaded[] =
        rel.targetColumn === "id"
          ? (await (keys.length ? backend.getMany(rel.table, keys.map(String)) : [])).map((s) => ({
              id: s.id,
              row: toRow(rel.table, s),
            }))
          : await fetchLoaded(backend, rel.table, [
              { column: rel.targetColumn, op: "in", value: keys },
            ]);
      const shaped = await shapeRows(
        backend,
        rel.table,
        targets.map((t) => t.row),
        node.children,
      );
      const byKey = new Map<unknown, Json>();
      targets.forEach((t, i) => byKey.set(t.row[rel.targetColumn], shaped[i]!));
      embedded.set(node, (row) => byKey.get(row[rel.localColumn]) ?? null);
    } else {
      const keys = [...new Set(rows.map((r) => r[rel.localColumn]).filter((v) => v != null))];
      const children = await fetchLoaded(backend, rel.table, [
        { column: rel.foreignColumn, op: "in", value: keys },
      ]);
      const shaped = await shapeRows(
        backend,
        rel.table,
        children.map((c) => c.row),
        node.children,
      );
      const grouped = new Map<unknown, Json[]>();
      children.forEach((c, i) => {
        const k = c.row[rel.foreignColumn];
        const list = grouped.get(k);
        if (list) list.push(shaped[i]!);
        else grouped.set(k, [shaped[i]!]);
      });
      embedded.set(node, (row) => {
        const list = grouped.get(row[rel.localColumn]) ?? [];
        return rel.single ? (list[0] ?? null) : list;
      });
    }
  }

  const star = nodes.some((n) => n.kind === "star");
  return rows.map((row) => {
    const out: Json = star ? { ...row } : {};
    for (const node of nodes) {
      if (node.kind === "column") out[node.as] = row[node.column] ?? null;
      else if (node.kind === "relation") out[node.as] = embedded.get(node)!(row);
    }
    return out;
  });
}

/** ON DELETE CASCADE / SET NULL, since Firestore has no foreign keys. */
async function applyReferentialActions(
  ctx: TriggerContext,
  table: TableName,
  parent: Json,
): Promise<void> {
  const id = parent["id"];
  if (typeof id !== "string") return;
  for (const rule of REFERENTIAL_ACTIONS[table] ?? []) {
    const api = ctx.from(rule.table) as unknown as {
      delete(): FilterTarget;
      update(values: Json): FilterTarget;
    };
    const target = rule.action === "cascade" ? api.delete() : api.update({ [rule.column]: null });
    const { error } = await target.eq(rule.column, id);
    if (error) throw error;
  }
}

type FilterTarget = { eq(column: string, value: unknown): PromiseLike<DbResponse<null>> };

// ------------------------------------------------------------------ builder

export class QueryBuilder<T extends TableName, R> implements PromiseLike<DbResponse<R>> {
  private readonly filters: Filter[] = [];
  private readonly orders: Order[] = [];
  private limitN: number | null = null;
  private returning: string | null;
  private cardinality: Cardinality = "many";
  private head = false;
  private wantCount = false;

  private readonly backend: Backend;
  private readonly table: T;
  private readonly mode: Mode;
  private readonly payload: unknown;
  private readonly upsertOptions: UpsertOptions;

  // (Explicit fields, not parameter properties: this module is also run directly
  // by Node's type stripping from scripts/seed.mjs.)
  constructor(
    backend: Backend,
    table: T,
    mode: Mode,
    payload: unknown = undefined,
    upsertOptions: UpsertOptions = {},
  ) {
    this.backend = backend;
    this.table = table;
    this.mode = mode;
    this.payload = payload;
    this.upsertOptions = upsertOptions;
    this.returning = mode === "select" ? "*" : null;
  }

  // -- shaping

  select<S extends string = "*">(
    columns?: S,
    options?: SelectOptions & { head?: false },
  ): QueryBuilder<T, SelectResult<T, S>[]>;
  select(
    columns: string | undefined,
    options: SelectOptions & { head: true },
  ): QueryBuilder<T, null>;
  select(
    columns = "*",
    options: SelectOptions & { head?: boolean } = {},
  ): QueryBuilder<T, unknown> {
    this.returning = columns;
    this.wantCount = Boolean(options.count);
    this.head = Boolean(options.head);
    return this as unknown as QueryBuilder<T, unknown>;
  }

  order(column: ColumnOf<T>, options: { ascending?: boolean; nullsFirst?: boolean } = {}): this {
    const ascending = options.ascending ?? true;
    // Postgres default: NULLS LAST when ascending, NULLS FIRST when descending.
    this.orders.push({ column, ascending, nullsFirst: options.nullsFirst ?? !ascending });
    return this;
  }

  limit(count: number): this {
    this.limitN = count;
    return this;
  }

  single(): QueryBuilder<T, R extends readonly (infer E)[] ? E : never> {
    this.cardinality = "one";
    return this as unknown as QueryBuilder<T, R extends readonly (infer E)[] ? E : never>;
  }

  maybeSingle(): QueryBuilder<T, (R extends readonly (infer E)[] ? E : never) | null> {
    this.cardinality = "maybe";
    return this as unknown as QueryBuilder<T, (R extends readonly (infer E)[] ? E : never) | null>;
  }

  // -- filters

  private add(column: string, op: FilterOp, value: unknown, negate = false): this {
    this.filters.push(negate ? { column, op, value, negate } : { column, op, value });
    return this;
  }

  eq<C extends ColumnOf<T>>(column: C, value: NonNullable<Row<T>[C]>): this {
    return this.add(column, "eq", value);
  }
  neq<C extends ColumnOf<T>>(column: C, value: NonNullable<Row<T>[C]>): this {
    return this.add(column, "neq", value);
  }
  gt<C extends ColumnOf<T>>(column: C, value: NonNullable<Row<T>[C]>): this {
    return this.add(column, "gt", value);
  }
  gte<C extends ColumnOf<T>>(column: C, value: NonNullable<Row<T>[C]>): this {
    return this.add(column, "gte", value);
  }
  lt<C extends ColumnOf<T>>(column: C, value: NonNullable<Row<T>[C]>): this {
    return this.add(column, "lt", value);
  }
  lte<C extends ColumnOf<T>>(column: C, value: NonNullable<Row<T>[C]>): this {
    return this.add(column, "lte", value);
  }
  is(column: ColumnOf<T>, value: null | boolean): this {
    return this.add(column, "is", value);
  }
  in<C extends ColumnOf<T>>(column: C, values: readonly NonNullable<Row<T>[C]>[]): this {
    return this.add(column, "in", [...values]);
  }
  /** Array containment: every element of `values` must be present (AND, not overlap). */
  contains(column: ColumnOf<T>, values: readonly unknown[]): this {
    return this.add(column, "contains", [...values]);
  }
  /**
   * Negated filter. Supports the operators the app uses:
   * `.not("status", "in", "(archived,declined)")`, `.not(col, "is", null)`,
   * `.not(col, "eq" | "neq" | "gt" | "gte" | "lt" | "lte", value)`.
   */
  not(
    column: ColumnOf<T>,
    operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "in",
    value: unknown,
  ): this {
    return this.add(column, operator, operator === "in" ? parseInList(value) : value, true);
  }

  // -- mutation shape

  then<A = DbResponse<R>, B = never>(
    onfulfilled?: ((value: DbResponse<R>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResponse<R>> {
    try {
      const outcome = await this.run();
      return this.finish(outcome) as DbResponse<R>;
    } catch (err) {
      return { data: null, error: toDbError(err), count: null } as DbResponse<R>;
    }
  }

  private finish(outcome: Outcome): DbResponse<unknown> {
    const { rows, count } = outcome;
    if (this.head || (this.mode !== "select" && this.returning === null)) {
      return { data: null, error: null, count };
    }
    if (this.cardinality === "many") return { data: rows, error: null, count };
    if (rows.length === 1) return { data: rows[0]!, error: null, count };
    if (rows.length === 0 && this.cardinality === "maybe")
      return { data: null, error: null, count };
    return {
      data: null,
      error: new DbError(
        "JSON object requested, multiple (or no) rows returned",
        SINGLE_ROW_VIOLATION,
        `The result contains ${rows.length} rows`,
      ),
      count,
    };
  }

  private context(): TriggerContext {
    const from = <U extends TableName>(table: U) => new TableApi<U>(this.backend, table);
    return { from: from as TriggerContext["from"], actorId: this.backend.actorId };
  }

  private async run(): Promise<Outcome> {
    switch (this.mode) {
      case "select":
        return this.runSelect();
      case "insert":
        return this.runInsert();
      case "update":
        return this.runUpdate();
      case "upsert":
        return this.runUpsert();
      case "delete":
        return this.runDelete();
    }
  }

  private async shape(rows: Json[]): Promise<Json[]> {
    if (this.returning === null) return [];
    return shapeRows(this.backend, this.table, rows, parseSelect(this.returning));
  }

  // -- select

  private async runSelect(): Promise<Outcome> {
    const loaded = await fetchLoaded(this.backend, this.table, this.filters);
    const sorted = sortRows(
      loaded.map((l) => l.row),
      this.orders,
    );
    const count = this.wantCount ? sorted.length : null;
    if (this.head) return { rows: [], count: sorted.length };
    const limited = this.limitN === null ? sorted : sorted.slice(0, this.limitN);
    return { rows: await this.shape(limited), count };
  }

  // -- insert

  private async runInsert(): Promise<Outcome> {
    const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Json[];
    const ctx = this.context();
    const ordered: Json[] = [];
    const batch: WriteOp[] = [];
    const attempts = RETRY_ON_CONFLICT.has(this.table) ? MAX_INSERT_ATTEMPTS : 1;

    for (const item of items) {
      for (let attempt = 0; attempt < attempts; attempt++) {
        const row = buildInsertRow(this.table, item ?? {});
        await TRIGGERS[this.table]?.beforeInsert?.(ctx, row, attempt);
        await this.assertSoftUnique(row, ordered);
        const id = assignId(this.table, row);

        if (!DOC_KEY[this.table]) {
          batch.push({ type: "set", table: this.table, id, data: serialize(row) });
        } else {
          // Natural-key tables: the document ID is the unique constraint.
          try {
            await this.backend.transact(this.table, id, (current) => {
              if (current) {
                throw new DbError(
                  `duplicate key value violates unique constraint on "${this.table}"`,
                  UNIQUE_VIOLATION,
                  `Key (${id}) already exists.`,
                );
              }
              return { write: { type: "set", data: serialize(row) }, result: undefined };
            });
          } catch (err) {
            if (toDbError(err).code === UNIQUE_VIOLATION && attempt < attempts - 1) continue;
            throw err;
          }
        }
        ordered.push(row);
        break;
      }
    }

    if (batch.length) await this.backend.write(batch);
    for (const row of ordered) await TRIGGERS[this.table]?.afterInsert?.(ctx, row);
    return { rows: await this.shape(ordered), count: null };
  }

  /** Port of `opportunities_unique_name_type` (lower(btrim(name)), type). */
  private async assertSoftUnique(row: Json, pending: readonly Json[]): Promise<void> {
    if (this.table !== "opportunities") return;
    const norm = (r: Json) =>
      `${String(r["name"] ?? "")
        .trim()
        .toLowerCase()}\u0000${String(r["type"])}`;
    const key = norm(row);
    const clash =
      pending.some((p) => norm(p) === key) ||
      (
        await fetchLoaded(this.backend, this.table, [
          { column: "type", op: "eq", value: row["type"] },
        ])
      ).some((l) => norm(l.row) === key);
    if (clash) {
      throw new DbError(
        'duplicate key value violates unique constraint "opportunities_unique_name_type"',
        UNIQUE_VIOLATION,
        `An opportunity named "${String(row["name"])}" of type "${String(row["type"])}" already exists.`,
      );
    }
  }

  // -- update

  private patchFrom(payload: unknown): Json {
    const patch = serialize((payload ?? {}) as Json);
    delete patch["id"];
    assertKnownColumns(this.table, patch);
    // The original BEFORE UPDATE trigger stamped every update.
    if (hasColumn(this.table, "updated_at")) patch["updated_at"] = new Date().toISOString();
    return patch;
  }

  private async runUpdate(): Promise<Outcome> {
    const patch = this.patchFrom(this.payload);
    const ctx = this.context();
    const filters = scoped(this.backend, this.table, this.filters);
    const pinned = pinnedIds(this.table, filters);
    const changed: { old: Json; next: Json }[] = [];

    if (pinned && pinned.length === 1) {
      // One known document: compare-and-set, so single-flight claims are atomic.
      const id = pinned[0]!;
      const hit = await this.backend.transact(this.table, id, (current) => {
        if (!current) return { write: null, result: null };
        const old = toRow(this.table, { id, data: current });
        if (!matchesAll(old, filters)) return { write: null, result: null };
        assertKeyUnchanged(this.table, old, patch);
        return {
          write: { type: "update", data: patch },
          result: { old, next: { ...old, ...patch } },
        };
      });
      if (hit) changed.push(hit);
    } else {
      const loaded = await fetchLoaded(this.backend, this.table, this.filters);
      for (const l of loaded) assertKeyUnchanged(this.table, l.row, patch);
      await this.backend.write(
        loaded.map((l) => ({ type: "update", table: this.table, id: l.id, data: patch }) as const),
      );
      for (const l of loaded) changed.push({ old: l.row, next: { ...l.row, ...patch } });
    }

    for (const c of changed) await TRIGGERS[this.table]?.afterUpdate?.(ctx, c.old, c.next);
    return { rows: await this.shape(changed.map((c) => c.next)), count: null };
  }

  // -- delete

  private async runDelete(): Promise<Outcome> {
    const filters = scoped(this.backend, this.table, this.filters);
    const pinned = pinnedIds(this.table, filters);
    let removed: Json[] = [];

    if (pinned && pinned.length === 1) {
      const id = pinned[0]!;
      const old = await this.backend.transact(this.table, id, (current) => {
        if (!current) return { write: null, result: null };
        const row = toRow(this.table, { id, data: current });
        if (!matchesAll(row, filters)) return { write: null, result: null };
        return { write: { type: "delete" }, result: row };
      });
      if (old) removed = [old];
    } else {
      const loaded = await fetchLoaded(this.backend, this.table, this.filters);
      await this.backend.write(
        loaded.map((l) => ({ type: "delete", table: this.table, id: l.id }) as const),
      );
      removed = loaded.map((l) => l.row);
    }
    const ctx = this.context();
    for (const row of removed) await applyReferentialActions(ctx, this.table, row);
    return { rows: await this.shape(removed), count: null };
  }

  // -- upsert

  private async runUpsert(): Promise<Outcome> {
    const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Json[];
    const table = this.table;
    const ctx = this.context();
    const naturalKey = (DOC_KEY[table] as readonly string[] | undefined) ?? ["id"];
    const conflict = this.upsertOptions.onConflict
      ? this.upsertOptions.onConflict.split(",").map((c) => c.trim())
      : naturalKey;
    const ignore = this.upsertOptions.ignoreDuplicates === true;
    const out: Json[] = [];
    const inserted: Json[] = [];
    const updated: { old: Json; next: Json }[] = [];
    const ops: WriteOp[] = [];

    // Rows addressed by the table's own key resolve to one document directly.
    // Anything else (e.g. content_assets.drive_file_id) is looked up by value.
    const direct = sameSet(conflict, naturalKey);
    let existing = new Map<string, Loaded>();
    if (!direct && conflict.length === 1) {
      const column = conflict[0]!;
      const values = [...new Set(items.map((i) => i?.[column]).filter((v) => v != null))];
      const found = await fetchLoaded(this.backend, table, [{ column, op: "in", value: values }]);
      existing = new Map(found.map((l) => [JSON.stringify(l.row[column]), l]));
    }

    for (const item of items) {
      const provided = serialize(item ?? {});
      assertKnownColumns(table, provided);
      const newRow = () => {
        const row = buildInsertRow(table, provided);
        assignId(table, row);
        return row;
      };
      const patch = () => {
        const p = { ...provided };
        delete p["id"];
        if (hasColumn(table, "updated_at")) p["updated_at"] = new Date().toISOString();
        return p;
      };

      if (direct) {
        const key = docIdFromRow(table, provided);
        if (key === null) {
          const row = newRow();
          ops.push({ type: "set", table, id: docIdOf(table, row), data: serialize(row) });
          inserted.push(row);
          out.push(row);
          continue;
        }
        const row = newRow();
        const id = docIdOf(table, row);
        const result = await this.backend.transact<UpsertHit>(
          table,
          id,
          (current): { write: PlannedWrite | null; result: UpsertHit } => {
            if (!current) {
              return {
                write: { type: "set", data: serialize(row) },
                result: { kind: "insert", row },
              };
            }
            const old = toRow(table, { id, data: current });
            if (ignore) return { write: null, result: { kind: "skip", row: old } };
            const p = patch();
            return {
              write: { type: "update", data: p },
              result: { kind: "update", row: { ...old, ...p }, old },
            };
          },
        );
        if (result.kind === "insert") inserted.push(result.row);
        if (result.kind === "update") updated.push({ old: result.old, next: result.row });
        out.push(result.row);
        continue;
      }

      let match: Loaded | undefined;
      if (conflict.length === 1) {
        match = existing.get(JSON.stringify(provided[conflict[0]!]));
      } else if (conflict.every((c) => provided[c] != null)) {
        match = (
          await fetchLoaded(
            this.backend,
            table,
            conflict.map((c) => ({ column: c, op: "eq", value: provided[c] }) as const),
          )
        )[0];
      }
      if (match) {
        if (ignore) {
          out.push(match.row);
        } else {
          const p = patch();
          ops.push({ type: "update", table, id: match.id, data: p });
          updated.push({ old: match.row, next: { ...match.row, ...p } });
          out.push({ ...match.row, ...p });
        }
      } else {
        const row = newRow();
        ops.push({ type: "set", table, id: docIdOf(table, row), data: serialize(row) });
        inserted.push(row);
        out.push(row);
        if (conflict.length === 1 && row[conflict[0]!] != null) {
          existing.set(JSON.stringify(row[conflict[0]!]), { id: docIdOf(table, row), row });
        }
      }
    }

    if (ops.length) await this.backend.write(ops);
    for (const row of inserted) await TRIGGERS[table]?.afterInsert?.(ctx, row);
    for (const u of updated) await TRIGGERS[table]?.afterUpdate?.(ctx, u.old, u.next);
    return { rows: await this.shape(out), count: null };
  }
}

// --------------------------------------------------------------- table API

export class TableApi<T extends TableName> {
  private readonly backend: Backend;
  private readonly table: T;

  constructor(backend: Backend, table: T) {
    this.backend = backend;
    this.table = table;
  }

  select<S extends string = "*">(
    columns?: S,
    options?: SelectOptions & { head?: false },
  ): QueryBuilder<T, SelectResult<T, S>[]>;
  select(
    columns: string | undefined,
    options: SelectOptions & { head: true },
  ): QueryBuilder<T, null>;
  select(
    columns = "*",
    options: SelectOptions & { head?: boolean } = {},
  ): QueryBuilder<T, unknown> {
    const qb = new QueryBuilder<T, unknown>(this.backend, this.table, "select");
    return qb.select(columns, options as SelectOptions & { head: true }) as QueryBuilder<
      T,
      unknown
    >;
  }

  insert(values: InsertRow<T> | InsertRow<T>[]): QueryBuilder<T, null> {
    return new QueryBuilder<T, null>(this.backend, this.table, "insert", values);
  }

  update(values: UpdateRow<T>): QueryBuilder<T, null> {
    return new QueryBuilder<T, null>(this.backend, this.table, "update", values);
  }

  upsert(
    values: InsertRow<T> | InsertRow<T>[],
    options: UpsertOptions = {},
  ): QueryBuilder<T, null> {
    return new QueryBuilder<T, null>(this.backend, this.table, "upsert", values, options);
  }

  delete(): QueryBuilder<T, null> {
    return new QueryBuilder<T, null>(this.backend, this.table, "delete");
  }
}

/** The Supabase-shaped entry point: `db.from("table")`. */
export class DbClient {
  readonly backend: Backend;

  constructor(backend: Backend) {
    this.backend = backend;
  }

  from<T extends TableName>(table: T): TableApi<T> {
    return new TableApi<T>(this.backend, table);
  }
}

/** The data half of a client; server contexts and helpers take one of these. */
export type AppDb = Pick<DbClient, "from">;
