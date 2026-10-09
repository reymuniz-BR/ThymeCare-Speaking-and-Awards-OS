/**
 * In-memory Backend for tests (no Firebase, no network). Enforces the same
 * constraints the real one does that matter to the builder: `in` takes at most
 * 30 values, `update` needs an existing document.
 */
import type { Backend, Doc, ListQuery, PlannedWrite, StoredDoc, WriteOp } from "./backend.ts";
import type { TableName } from "./schema.generated.ts";

export class MemoryBackend implements Backend {
  readonly store = new Map<string, Map<string, Doc>>();
  readonly lists: ListQuery[] = [];
  scopeToOwner = false;
  actorId: string | null = null;

  private coll(table: string) {
    let c = this.store.get(table);
    if (!c) this.store.set(table, (c = new Map()));
    return c;
  }
  docs(table: TableName) {
    return [...this.coll(table).entries()].map(([id, data]) => ({ id, data }));
  }

  async getMany(table: TableName, ids: readonly string[]) {
    return ids.flatMap((id) => {
      const data = this.coll(table).get(id);
      return data ? [{ id, data: structuredClone(data) }] : [];
    });
  }

  async list(table: TableName, q: ListQuery): Promise<StoredDoc[]> {
    this.lists.push(q);
    if (q.in && q.in.values.length > 30) throw new Error("Firestore: max 30 values in `in`");
    return this.docs(table)
      .filter(({ data }) => q.eq.every(([c, v]) => data[c] === v))
      .filter(({ data }) => !q.in || q.in.values.includes(data[q.in.column]))
      .map(({ id, data }) => ({ id, data: structuredClone(data) }));
  }

  async write(ops: readonly WriteOp[]) {
    for (const op of ops) {
      const c = this.coll(op.table);
      if (op.type === "set") c.set(op.id, structuredClone(op.data));
      else if (op.type === "delete") c.delete(op.id);
      else {
        const cur = c.get(op.id);
        if (!cur) throw new Error(`NOT_FOUND: ${op.table}/${op.id}`);
        c.set(op.id, { ...cur, ...structuredClone(op.data) });
      }
    }
  }

  async transact<R>(
    table: TableName,
    id: string,
    plan: (current: Doc | null) => { write: PlannedWrite | null; result: R },
  ) {
    const c = this.coll(table);
    const cur = c.get(id);
    const { write, result } = plan(cur ? structuredClone(cur) : null);
    if (write?.type === "set") c.set(id, structuredClone(write.data));
    else if (write?.type === "update")
      c.set(id, { ...(cur ?? {}), ...structuredClone(write.data) });
    else if (write?.type === "delete") c.delete(id);
    return result;
  }
}
