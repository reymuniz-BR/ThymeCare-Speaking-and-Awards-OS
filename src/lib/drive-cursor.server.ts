/**
 * Signed page cursor for the Drive library sync (see drive.functions.ts).
 * Erasable TypeScript with explicit `.ts` specifiers so Node can test it directly.
 */
import type { AppDb } from "../integrations/supabase/firestore/builder.ts";

/** Cursor across the folder tree: which folders are still queued, and where we are in the current one. */
export type Cursor = { queue: string[]; pageToken: string | null; startedAt: string };

/** A scan older than this is abandoned rather than allowed to purge. */
const MAX_SCAN_AGE_MS = 6 * 60 * 60 * 1000;

export function freshCursor(rootFolderId: string): Cursor {
  return { queue: [rootFolderId], pageToken: null, startedAt: new Date().toISOString() };
}

const toB64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * The cursor round-trips through the browser, and `startedAt` decides which
 * library rows the final purge deletes, so it is HMAC-signed with a server-only
 * key (job_secrets/drive-cursor, created on first use). A client can neither
 * forge a cursor nor move `startedAt` into the future to wipe the library.
 */
async function signingKey(db: AppDb): Promise<CryptoKey> {
  const read = async () =>
    (await db.from("job_secrets").select("secret").eq("name", "drive-cursor").maybeSingle()).data
      ?.secret;
  let secret = await read();
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    // Create-if-absent: if two requests race, the loser's insert fails and both read the winner's.
    await db.from("job_secrets").insert({ name: "drive-cursor", secret: toB64Url(bytes) });
    secret = await read();
  }
  if (!secret) throw new Error("Could not load the Drive cursor signing key.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function encodeCursor(db: AppDb, c: Cursor): Promise<string> {
  const body = toB64Url(new TextEncoder().encode(JSON.stringify(c)));
  const sig = await crypto.subtle.sign(
    "HMAC",
    await signingKey(db),
    new TextEncoder().encode(body),
  );
  return `${body}.${toB64Url(new Uint8Array(sig))}`;
}

/** Null token starts a fresh scan; anything else must verify or the sync stops. */
export async function decodeCursor(
  db: AppDb,
  token: string | null,
  rootFolderId: string,
): Promise<Cursor> {
  if (!token) return freshCursor(rootFolderId);
  const invalid = () => new Error("That Drive sync cursor is not valid. Start the sync again.");
  const [body, sig] = token.split(".");
  if (!body || !sig) throw invalid();
  const expected = toB64Url(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", await signingKey(db), new TextEncoder().encode(body)),
    ),
  );
  // Both are base64url HMAC outputs of equal length when genuine.
  if (expected.length !== sig.length) throw invalid();
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) throw invalid();

  let parsed: Cursor;
  try {
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    parsed = JSON.parse(json) as Cursor;
  } catch {
    throw invalid();
  }
  const started = Date.parse(parsed.startedAt);
  const age = Date.now() - started;
  if (
    !Array.isArray(parsed.queue) ||
    Number.isNaN(started) ||
    age < -60_000 ||
    age > MAX_SCAN_AGE_MS
  ) {
    throw invalid();
  }
  return parsed;
}
