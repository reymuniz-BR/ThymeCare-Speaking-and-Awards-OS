/**
 * Error object returned in `{ error }` (never thrown by the query builder),
 * shaped like PostgREST's so existing call sites keep working
 * (`error.message`, `error.code === "23505"`).
 */
export class DbError extends Error {
  readonly code: string;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(
    message: string,
    code = "",
    details: string | null = null,
    hint: string | null = null,
  ) {
    super(message);
    this.name = "DbError";
    this.code = code;
    this.details = details;
    this.hint = hint;
  }
}

/** Postgres unique_violation, which the digest/claim code keys off. */
export const UNIQUE_VIOLATION = "23505";
/** PostgREST: `.single()` matched zero or several rows. */
export const SINGLE_ROW_VIOLATION = "PGRST116";
/** PostgREST: unknown relationship in an embedded select. */
export const UNKNOWN_RELATIONSHIP = "PGRST200";

/** Normalise anything thrown by a backend into a DbError. */
export function toDbError(err: unknown): DbError {
  if (err instanceof DbError) return err;
  const message = err instanceof Error ? err.message : String(err);
  const rawCode = (err as { code?: unknown } | null)?.code;
  let code =
    typeof rawCode === "string" ? rawCode : typeof rawCode === "number" ? String(rawCode) : "";
  // Firestore ALREADY_EXISTS (admin: numeric 6, web: "already-exists").
  if (code === "6" || code === "already-exists") code = UNIQUE_VIOLATION;
  if (code === "permission-denied" || code === "7") {
    return new DbError(
      `row-level security: ${message}`,
      "42501",
      null,
      "Check firestore.rules and that the signed-in user is an approved team member.",
    );
  }
  return new DbError(message, code);
}
