/**
 * Browser data + auth client, backed by Google Firestore and Firebase Auth.
 *
 * `supabase.from(...)` keeps the Supabase query-builder API the app was written
 * against (see ./firestore/builder.ts for the exact semantics), and every call
 * runs as the signed-in user, so firestore.rules is the access boundary here.
 * Server code uses `./client.server.ts`, which runs the same builder over
 * firebase-admin.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { db, auth, googleAuthProvider } from "@/lib/firebase";
import { DbClient } from "./firestore/builder";
import { createClientBackend } from "./firestore/client-backend";
import type { TableName } from "./firestore/schema.generated";

export { db, auth };

export type { AppDb, DbResponse } from "./firestore/builder";
export { DbError } from "./firestore/errors";

const database = new DbClient(createClientBackend(db, () => auth.currentUser?.uid ?? null));

export const NOT_APPROVED_MESSAGE =
  "This email is not approved for access. Ask an administrator to add it.";

type AppUser = { id: string; email: string; user_metadata: Record<string, unknown> };
type AppSession = { access_token: string; user: { id: string; email: string } };

const toError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));

function toAppUser(u: User): AppUser {
  return {
    id: u.uid,
    email: u.email ?? "",
    user_metadata: {
      full_name: u.displayName ?? u.email?.split("@")[0] ?? "Team Member",
      avatar_url: u.photoURL ?? "",
    },
  };
}

/**
 * Team membership = a verified email that has a document in `allowed_emails`
 * (doc ID = lowercase email). This is the same predicate firestore.rules
 * enforces; checking it here is for UX, not security. Admins manage the list.
 */
const approvalCache = new Map<string, { ok: boolean; at: number }>();

export async function isApprovedMember(user: User | null = auth.currentUser): Promise<boolean> {
  const email = user?.email?.toLowerCase();
  if (!user || !email || !user.emailVerified) return false;
  const hit = approvalCache.get(user.uid);
  if (hit && Date.now() - hit.at < (hit.ok ? 5 * 60_000 : 5_000)) return hit.ok;
  let ok = false;
  try {
    ok = (await getDoc(doc(db, "allowed_emails", email))).exists();
  } catch {
    ok = false;
  }
  approvalCache.set(user.uid, { ok, at: Date.now() });
  return ok;
}

/** First sign-in of an approved member: create their profile row (never overwrite one). */
async function ensureProfile(user: User): Promise<void> {
  const ref = doc(db, "profiles", user.uid);
  if ((await getDoc(ref)).exists()) return;
  const now = new Date().toISOString();
  const email = (user.email ?? "").toLowerCase();
  await setDoc(ref, {
    id: user.uid,
    email,
    full_name: user.displayName ?? email.split("@")[0] ?? "Team Member",
    title: null,
    avatar_url: user.photoURL ?? null,
    created_at: now,
    updated_at: now,
  });
}

class FirebaseAuthAdapter {
  async getUser(): Promise<{ data: { user: AppUser | null }; error: null }> {
    const u = auth.currentUser;
    return { data: { user: u ? toAppUser(u) : null }, error: null };
  }

  async getSession(): Promise<{ data: { session: AppSession | null }; error: null }> {
    const u = auth.currentUser;
    if (!u) return { data: { session: null }, error: null };
    return {
      data: {
        session: { access_token: await u.getIdToken(), user: { id: u.uid, email: u.email ?? "" } },
      },
      error: null,
    };
  }

  /** Sign out again if the account is not on the allowlist. */
  private async requireApproval(user: User): Promise<Error | null> {
    if (await isApprovedMember(user)) return null;
    await firebaseSignOut(auth);
    return new Error(NOT_APPROVED_MESSAGE);
  }

  /**
   * Existing accounts only. This never creates an account: a failed sign-in is
   * a failed sign-in. (Accounts come from Google sign-in or an administrator.)
   */
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const denied = await this.requireApproval(cred.user);
      if (denied) return { data: { user: null }, error: denied };
      return { data: { user: cred.user }, error: null };
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      if (
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-email"
      ) {
        return { data: { user: null }, error: new Error("Invalid email or password.") };
      }
      return { data: { user: null }, error: toError(err) };
    }
  }

  async signInWithOAuth(_options: { provider: "google" }) {
    try {
      const res = await signInWithPopup(auth, googleAuthProvider);
      const denied = await this.requireApproval(res.user);
      if (denied) return { data: null, error: denied };
      return { data: { user: res.user }, error: null };
    } catch (err) {
      return { data: null, error: toError(err) };
    }
  }

  async signOut() {
    try {
      approvalCache.clear();
      await firebaseSignOut(auth);
      return { error: null };
    } catch (err) {
      return { error: toError(err) };
    }
  }

  onAuthStateChange(callback: (event: string, session: AppSession | null) => void) {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (!user || !(await isApprovedMember(user))) {
        // Signed out, or signed in with an account that is not on the allowlist.
        callback("SIGNED_OUT", null);
        return;
      }
      try {
        await ensureProfile(user);
      } catch (err) {
        console.warn("Could not create the profile row:", err);
      }
      callback("SIGNED_IN", {
        access_token: await user.getIdToken(),
        user: { id: user.uid, email: user.email ?? "" },
      });
    });
    return { data: { subscription: { unsubscribe } } };
  }
}

export const supabase = {
  from<T extends TableName>(table: T) {
    return database.from(table);
  },
  auth: new FirebaseAuthAdapter(),
};
