/** Team directory helpers — owners are real user accounts from `profiles`. */
import type { ProfileRow } from "@/lib/program";

/** Human label for a teammate: full name, else email, else a generic label. */
export function memberName(p: Pick<ProfileRow, "full_name" | "email">): string {
  return p.full_name?.trim() || p.email?.trim() || "Teammate";
}

/** Selectable owners, alphabetical by display name. */
export function teamMembers(profiles: ProfileRow[]): ProfileRow[] {
  return [...profiles].sort((a, b) => memberName(a).localeCompare(memberName(b)));
}

/** Display the owner of a record, preferring the live profile over the cached name. */
export function ownerLabel(
  ownerId: string | null | undefined,
  profiles: ProfileRow[],
  cachedName?: string | null,
): string {
  const profile = ownerId ? profiles.find((p) => p.id === ownerId) : null;
  return profile ? memberName(profile) : cachedName?.trim() || "Unassigned";
}
