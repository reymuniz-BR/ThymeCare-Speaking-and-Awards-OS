/**
 * Server backend: firebase-admin Firestore (Application Default Credentials on
 * Cloud Run). It bypasses firestore.rules, so only trusted server code may use
 * it; callers are responsible for authorising the request first.
 */
import type { Firestore, Query } from "firebase-admin/firestore";
import type { Backend, Doc, ListQuery, PlannedWrite, StoredDoc, WriteOp } from "./backend.ts";
import type { TableName } from "./schema.generated.ts";

const BATCH_SIZE = 400;
const GET_ALL_SIZE = 100;

const chunk = <V>(items: readonly V[], size: number): V[][] => {
  const out: V[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export function createAdminBackend(db: Firestore): Backend {
  return {
    actorId: null,
    scopeToOwner: false,

    async getMany(table, ids) {
      const found: StoredDoc[] = [];
      for (const part of chunk(ids, GET_ALL_SIZE)) {
        const snaps = await db.getAll(...part.map((id) => db.collection(table).doc(id)));
        for (const s of snaps) if (s.exists) found.push({ id: s.id, data: s.data() as Doc });
      }
      return found;
    },

    async list(table: TableName, q: ListQuery) {
      let ref: Query = db.collection(table);
      for (const [column, value] of q.eq) ref = ref.where(column, "==", value);
      // The builder slices `in` to Firestore's 30-value limit before calling.
      if (q.in) ref = ref.where(q.in.column, "in", [...q.in.values]);
      const snap = await ref.get();
      return snap.docs.map((d): StoredDoc => ({ id: d.id, data: d.data() as Doc }));
    },

    async write(ops: readonly WriteOp[]) {
      for (const part of chunk(ops, BATCH_SIZE)) {
        const batch = db.batch();
        for (const op of part) {
          const ref = db.collection(op.table).doc(op.id);
          if (op.type === "set") batch.set(ref, op.data);
          else if (op.type === "update") batch.update(ref, op.data);
          else batch.delete(ref);
        }
        await batch.commit();
      }
    },

    transact<R>(
      table: TableName,
      id: string,
      plan: (current: Doc | null) => { write: PlannedWrite | null; result: R },
    ) {
      const ref = db.collection(table).doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const { write, result } = plan(snap.exists ? (snap.data() as Doc) : null);
        if (write?.type === "set") tx.set(ref, write.data);
        else if (write?.type === "update") tx.update(ref, write.data);
        else if (write?.type === "delete") tx.delete(ref);
        return result;
      });
    },
  };
}
