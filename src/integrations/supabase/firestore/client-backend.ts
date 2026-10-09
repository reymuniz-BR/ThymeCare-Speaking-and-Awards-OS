/**
 * Browser backend: the Firestore web SDK, authenticated as the signed-in user.
 * Everything here is subject to firestore.rules.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
  type Firestore,
  type QueryConstraint,
} from "firebase/firestore";
import type { Backend, Doc, ListQuery, PlannedWrite, StoredDoc, WriteOp } from "./backend.ts";
import type { TableName } from "./schema.generated.ts";

/** Firestore allows 500 writes per batch; stay under it. */
const BATCH_SIZE = 400;

const chunk = <V>(items: readonly V[], size: number): V[][] => {
  const out: V[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export function createClientBackend(db: Firestore, currentUid: () => string | null): Backend {
  return {
    get actorId() {
      return currentUid();
    },
    scopeToOwner: true,

    async getMany(table, ids) {
      const snaps = await Promise.all(ids.map((id) => getDoc(doc(db, table, id))));
      return snaps.flatMap((s) => (s.exists() ? [{ id: s.id, data: s.data() as Doc }] : []));
    },

    async list(table: TableName, q: ListQuery) {
      const constraints: QueryConstraint[] = q.eq.map(([column, value]) =>
        where(column, "==", value),
      );
      // The builder slices `in` to Firestore's 30-value limit before calling.
      if (q.in) constraints.push(where(q.in.column, "in", [...q.in.values]));
      const snap = await getDocs(query(collection(db, table), ...constraints));
      return snap.docs.map((d): StoredDoc => ({ id: d.id, data: d.data() as Doc }));
    },

    async write(ops: readonly WriteOp[]) {
      for (const part of chunk(ops, BATCH_SIZE)) {
        const batch = writeBatch(db);
        for (const op of part) {
          const ref = doc(db, op.table, op.id);
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
      const ref = doc(db, table, id);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const { write, result } = plan(snap.exists() ? (snap.data() as Doc) : null);
        if (write?.type === "set") tx.set(ref, write.data);
        else if (write?.type === "update") tx.update(ref, write.data);
        else if (write?.type === "delete") tx.delete(ref);
        return result;
      });
    },
  };
}
