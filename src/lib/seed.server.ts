/**
 * One-time server-side seeding. Everything here is idempotent and takes the
 * data client as a parameter, so it runs from the CLI (`npm run seed`, via
 * scripts/seed.mjs) and from tests alike.
 *
 * Kept to erasable TypeScript with explicit `.ts` import specifiers so Node can
 * run it directly, without a bundler.
 */
import type { AppDb } from "../integrations/supabase/firestore/builder.ts";
import taxonomyDefaults from "./taxonomy-defaults.json" with { type: "json" };

const UNIQUE_VIOLATION = "23505";

export type SeedResult = { created: number; existing: number };

/**
 * Status / priority / deadline / recommendation / outcome lists, ported from the
 * original migrations. These used to be substituted into query results when the
 * table was empty (so edits were invisible); now they are real rows, created
 * once and never overwritten, so the Settings page edits what the app uses.
 */
export async function seedTaxonomyDefaults(db: AppDb): Promise<SeedResult> {
  const result: SeedResult = { created: 0, existing: 0 };
  for (const row of taxonomyDefaults) {
    // Document ID = (kind, applies_to, value), so an existing option is a unique
    // violation and is left exactly as the team edited it.
    const { error } = await db.from("taxonomy_options").insert({ ...row, is_active: true });
    if (!error) result.created++;
    else if (error.code === UNIQUE_VIOLATION) result.existing++;
    else throw new Error(`taxonomy seed failed on ${row.kind}/${row.value}: ${error.message}`);
  }
  return result;
}

export type FirstAdmin = {
  uid: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  emailVerified: boolean;
};

/**
 * Bootstrap the first administrator. Replaces the original "first user to sign
 * up becomes admin" trigger, which a client-side equivalent would have turned
 * into "anyone who signs in first owns the workspace".
 *
 * Refuses to run once any admin exists, and requires a verified email (the
 * security rules only honour verified addresses).
 */
export async function seedFirstAdmin(db: AppDb, user: FirstAdmin): Promise<void> {
  const email = user.email.trim().toLowerCase();
  if (!user.emailVerified) {
    throw new Error(`${email} has not verified its email address; rules would ignore it.`);
  }

  const { data: admins, error: lookupError } = await db
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1);
  if (lookupError) throw new Error(lookupError.message);
  if (admins && admins.length > 0) {
    throw new Error(
      "An admin already exists, so this bootstrap is closed. " +
        "Existing admins manage access from Settings > Team access.",
    );
  }

  const created = await db.from("allowed_emails").insert({ email, note: "First administrator" });
  if (created.error && created.error.code !== UNIQUE_VIOLATION) {
    throw new Error(created.error.message);
  }

  const role = await db.from("user_roles").upsert({ user_id: user.uid, role: "admin" });
  if (role.error) throw new Error(role.error.message);

  // The profile row the app creates on first sign-in.
  const profile = await db.from("profiles").upsert({
    id: user.uid,
    email,
    full_name: user.displayName ?? email.split("@")[0] ?? "Admin",
    avatar_url: user.photoURL ?? null,
  });
  if (profile.error) throw new Error(profile.error.message);
}

/** Secrets the scheduled hooks and the calendar feed authenticate with. */
export const JOB_SECRET_NAMES = [
  "discover-daily",
  "email-digest",
  "tracker-weekly",
  "calendar-feed",
] as const;

/**
 * Create any missing per-job secret. Returns only the ones created, so existing
 * secrets are never rotated or re-displayed.
 */
export async function seedJobSecrets(
  db: AppDb,
  makeSecret: () => string,
): Promise<Record<string, string>> {
  const created: Record<string, string> = {};
  for (const name of JOB_SECRET_NAMES) {
    const secret = makeSecret();
    const { error } = await db.from("job_secrets").insert({ name, secret });
    if (!error) created[name] = secret;
    else if (error.code !== UNIQUE_VIOLATION) throw new Error(`${name}: ${error.message}`);
  }
  return created;
}
