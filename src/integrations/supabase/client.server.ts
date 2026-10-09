// Server-side data client: the same Supabase-style builder as ./client.ts, but
// running over firebase-admin Firestore (Application Default Credentials on
// Cloud Run). It BYPASSES firestore.rules, so use it only after the request has
// been authorised (auth-middleware.ts for server functions, a verified secret
// for hooks). Never import this from browser code.
import { adminDb } from "@/lib/firebase-admin";
import { DbClient, type AppDb } from "./firestore/builder";
import { createAdminBackend } from "./firestore/admin-backend";
import type { TableName } from "./firestore/schema.generated";

function clientFor(actorId: string | null): AppDb {
  const database = new DbClient(createAdminBackend(adminDb, actorId));
  return {
    from<T extends TableName>(table: T) {
      return database.from(table);
    },
  };
}

/**
 * Actor-less admin client, for work with no signed-in user: the scheduled hooks
 * and the seed script. Anything running on behalf of a user must use the
 * per-request client from the auth middleware (`context.supabase`) so audit rows
 * carry who did it.
 */
export const supabaseAdmin: AppDb = clientFor(null);

/** Admin client that attributes writes (activity log) to a verified user. */
export function adminClientFor(uid: string): AppDb {
  return clientFor(uid);
}

export { adminDb };
