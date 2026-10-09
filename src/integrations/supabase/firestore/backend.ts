/**
 * The storage seam. The Supabase-style query builder (./builder.ts) is
 * written once against this interface and runs against either:
 *
 *   - the Firestore web SDK, signed in as the user (browser; subject to
 *     firestore.rules), or
 *   - firebase-admin (server routes, hooks, server functions; bypasses rules).
 *
 * Backends are deliberately dumb: documents in, documents out. All filtering
 * beyond equality, ordering, limits, joins, defaults and triggers live in the
 * builder so both sides behave identically.
 */
import type { TableName } from "./schema.generated.ts";

/** Stored document fields. */
export type Doc = Record<string, unknown>;

/** A stored document together with its ID. */
export type StoredDoc = { id: string; data: Doc };

export type WriteOp =
  | { type: "set"; table: TableName; id: string; data: Doc }
  /** Partial update; the document must exist. */
  | { type: "update"; table: TableName; id: string; data: Doc }
  | { type: "delete"; table: TableName; id: string };

export type ListQuery = {
  /** Equality filters (null values are never pushed down). */
  eq: ReadonlyArray<readonly [column: string, value: unknown]>;
  /** At most one `in` filter, already sliced to Firestore's 30-value limit. */
  in?: { column: string; values: readonly unknown[] } | undefined;
};

export interface Backend {
  /** The signed-in user on the browser; null on the server. */
  readonly actorId: string | null;
  /**
   * Browser only. Emulates Postgres RLS for tables that are private to their
   * owner (`user_id = auth.uid()`), because Firestore rules reject, rather
   * than filter, queries that could return someone else's rows.
   */
  readonly scopeToOwner: boolean;

  /** Documents by ID. Missing IDs are omitted. */
  getMany(table: TableName, ids: readonly string[]): Promise<StoredDoc[]>;

  /** Equality-filtered scan (the builder re-checks every filter in memory). */
  list(table: TableName, query: ListQuery): Promise<StoredDoc[]>;

  /** Apply writes. Large batches are chunked; each chunk is atomic. */
  write(ops: readonly WriteOp[]): Promise<void>;

  /**
   * Atomic read-modify-write of one document. `plan` receives the current
   * document (or null) and returns the write to perform plus a result.
   */
  transact<R>(
    table: TableName,
    id: string,
    plan: (current: Doc | null) => { write: PlannedWrite | null; result: R },
  ): Promise<R>;
}

export type PlannedWrite =
  { type: "set"; data: Doc } | { type: "update"; data: Doc } | { type: "delete" };
