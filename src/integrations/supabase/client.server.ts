// Server-side data client: the same Supabase-style builder as ./client.ts, but
// running over firebase-admin Firestore (Application Default Credentials on
// Cloud Run). It BYPASSES firestore.rules, so use it only after the request has
// been authorised (auth-middleware.ts for server functions, a verified secret
// for hooks). Never import this from browser code.
import { adminDb } from "@/lib/firebase-admin";
import { DbClient, type AppDb } from "./firestore/builder";
import { createAdminBackend } from "./firestore/admin-backend";
import type { TableName } from "./firestore/schema.generated";

const database = new DbClient(createAdminBackend(adminDb));

export const supabaseAdmin: AppDb = {
  from<T extends TableName>(table: T) {
    return database.from(table);
  },
};

export { adminDb };
