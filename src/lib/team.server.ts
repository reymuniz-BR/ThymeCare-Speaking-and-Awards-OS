import type { AppDb } from "@/integrations/supabase/firestore/builder";

export type TeamRecipient = {
  /** Profile (auth uid) once the person has signed in; null before that. */
  id: string | null;
  email: string;
  full_name: string | null;
};

/**
 * The team, as the security rules define it: every address on the allowlist
 * (`allowed_emails`), matched to a profile when the person has signed in.
 * Replaces "everyone with a user_roles row", which was the original definition
 * of team membership and is now only the privilege tier.
 */
export async function teamRecipients(db: AppDb): Promise<TeamRecipient[]> {
  const { data: allowed, error } = await db.from("allowed_emails").select("email");
  if (error) throw new Error(error.message);
  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id, email, full_name");
  if (profileError) throw new Error(profileError.message);

  const byEmail = new Map(
    (profiles ?? []).filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p] as const),
  );
  return (allowed ?? []).map((a) => {
    const profile = byEmail.get(a.email.toLowerCase());
    return { id: profile?.id ?? null, email: a.email, full_name: profile?.full_name ?? null };
  });
}
