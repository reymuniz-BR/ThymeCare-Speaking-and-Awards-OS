import { createServerFn } from "@tanstack/react-start";
import { requireManagerAuth } from "@/integrations/supabase/auth-middleware";
import type { Cursor } from "@/lib/drive-cursor.server";

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

function resolveDriveRequest(
  path: string,
  params: URLSearchParams = new URLSearchParams(),
): { url: string; headers: Record<string, string> } {
  const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];

  params.set("supportsAllDrives", "true");

  if (driveKey && (!lovableKey || driveKey.startsWith("ya29.") || driveKey.startsWith("Bearer "))) {
    if (driveKey.startsWith("ya29.") || driveKey.startsWith("Bearer ")) {
      const token = driveKey.replace(/^Bearer\s+/i, "");
      return {
        url: `${GOOGLE_DRIVE_API}${path}?${params.toString()}`,
        headers: { Authorization: `Bearer ${token}` },
      };
    }
    params.set("key", driveKey);
    return {
      url: `${GOOGLE_DRIVE_API}${path}?${params.toString()}`,
      headers: {},
    };
  }

  if (lovableKey && driveKey) {
    return {
      url: `${GATEWAY_URL}${path}?${params.toString()}`,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": driveKey,
      },
    };
  }

  if (driveKey) {
    params.set("key", driveKey);
    return {
      url: `${GOOGLE_DRIVE_API}${path}?${params.toString()}`,
      headers: {},
    };
  }

  throw new Error(
    "Google Drive is not connected yet. Add GOOGLE_DRIVE_API_KEY in workspace settings.",
  );
}

/** Only this Drive folder (and its subfolders) is indexed into the Content Library. */
const ROOT_FOLDER_ID = "1NYiV7rYlEB2-ccPaFJf8XvPkjP2h-cYc";

const FOLDER_MIME = "application/vnd.google-apps.folder";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
};

/** Document-ish mime types worth indexing for reuse. */
const MIME_QUERY = [
  "application/vnd.google-apps.document",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]
  .map((m) => `mimeType='${m}'`)
  .join(" or ");

function categorize(name: string): string {
  const n = name.toLowerCase();
  if (/(bio|biography|headshot|speaker)/.test(n)) return "bio";
  if (/(boilerplate|messaging|positioning|about us)/.test(n)) return "boilerplate";
  if (
    /(award|submission|application|entry|nomination|abstract|speaking|proposal|draft|response|questionnaire)/.test(
      n,
    )
  )
    return "prior_application";
  if (/(metric|kpi|results|data|impact)/.test(n)) return "metrics";
  if (/(case study|customer story)/.test(n)) return "case_study";
  if (/(press|release|coverage|media)/.test(n)) return "press";
  return "other";
}

/**
 * The page cursor round-trips through the client, so a folder id in the queue
 * is untrusted input. Confirm the folder really sits inside ROOT_FOLDER_ID by
 * walking its parents upward before reading anything from it.
 */
async function assertInsideRoot(folderId: string): Promise<void> {
  if (folderId === ROOT_FOLDER_ID) return;

  let current = folderId;
  for (let depth = 0; depth < 12; depth++) {
    const params = new URLSearchParams({ fields: "id,parents" });
    const req = resolveDriveRequest(`/files/${encodeURIComponent(current)}`, params);
    const res = await fetch(req.url, { headers: req.headers });
    if (!res.ok) {
      throw new Error("That Drive folder could not be verified, so it was not read.");
    }
    const file = (await res.json()) as { parents?: string[] };
    const parents = file.parents ?? [];
    if (parents.includes(ROOT_FOLDER_ID)) return;
    const parent = parents[0];
    if (!parent) break;
    current = parent;
  }
  throw new Error("That Drive folder is outside the Events & Awards folder and was not read.");
}

export type DriveSyncPage = {
  /** Files returned by Drive on this page. */
  scanned: number;
  /** Files written to the library on this page. */
  indexed: number;
  /** Files ignored because they don't look like reusable program material. */
  skipped: number;
  /** Count of indexed files per library category. */
  byCategory: Record<string, number>;
  /** Human-readable problems that did not stop the sync. */
  errors: string[];
  /** Pass back into the next call to continue; null when the scan is complete. */
  nextPageToken: string | null;
};

/**
 * Scan one page of the "Events & Awards" Drive folder (including subfolders)
 * and index reusable material. Nothing outside that folder is read.
 *
 * The sync is paged so the UI can show live progress: call it with a null
 * token, then keep calling with `nextPageToken` until it comes back null.
 */
export const syncDriveLibrary = createServerFn({ method: "POST" })
  // A finished scan purges library rows it did not see; the original RLS reserved
  // deletes for managers (can_manage), so the whole sync is manager-only.
  .middleware([requireManagerAuth])
  .inputValidator((input: { pageToken?: string | null } | undefined) => ({
    pageToken: input?.pageToken ?? null,
  }))
  .handler(async ({ data, context }): Promise<DriveSyncPage> => {
    if (!process.env["GOOGLE_DRIVE_API_KEY"]) {
      return {
        scanned: 0,
        indexed: 0,
        skipped: 0,
        byCategory: {},
        errors: [
          "Google Drive is not connected yet. Add GOOGLE_DRIVE_API_KEY in workspace settings to enable live Drive sync.",
        ],
        nextPageToken: null,
      };
    }

    const { decodeCursor, encodeCursor } = await import("@/lib/drive-cursor.server");
    const db = context.supabase;
    const cursor = await decodeCursor(db, data.pageToken, ROOT_FOLDER_ID);
    const folderId = cursor.queue[0];
    if (!folderId) {
      return {
        scanned: 0,
        indexed: 0,
        skipped: 0,
        byCategory: {},
        errors: [],
        nextPageToken: null,
      };
    }

    // Drive ids are opaque url-safe strings; anything else came from a tampered cursor.
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId)) {
      throw new Error("That Drive sync cursor is not valid. Start the sync again.");
    }

    // Every folder we are about to read must live inside the configured root,
    // including folders that arrived via the client-supplied page cursor.
    await assertInsideRoot(folderId);

    const params = new URLSearchParams({
      pageSize: "50",
      orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink)",
      // Only children of the current folder: either indexable docs, or subfolders to walk next.
      q: `'${folderId}' in parents and trashed = false and (mimeType='${FOLDER_MIME}' or ${MIME_QUERY})`,
      includeItemsFromAllDrives: "true",
    });
    if (cursor.pageToken) params.set("pageToken", cursor.pageToken);

    const req = resolveDriveRequest("/files", params);
    const res = await fetch(req.url, {
      headers: req.headers,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Drive request failed [${res.status}]: ${body}`);
      throw new Error(`Drive request failed [${res.status}]: ${body}`);
    }

    const payload = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    const entries = payload.files ?? [];
    const subfolders = entries.filter((f) => f.mimeType === FOLDER_MIME);
    const files = entries.filter((f) => f.mimeType !== FOLDER_MIME);
    const errors: string[] = [];
    const byCategory: Record<string, number> = {};

    const rows = files.map((file) => {
      const category = categorize(file.name);
      byCategory[category] = (byCategory[category] ?? 0) + 1;
      return {
        drive_file_id: file.id,
        name: file.name,
        mime_type: file.mimeType,
        web_view_link: file.webViewLink ?? null,
        category,
        last_synced_at: new Date().toISOString(),
      };
    });

    if (rows.length) {
      const { error } = await db
        .from("content_assets")
        .upsert(rows as never, { onConflict: "drive_file_id" });
      if (error) errors.push(`Could not save ${rows.length} files: ${error.message}`);
    }

    // Finish this folder's pages first, then walk into any subfolders found.
    const nextQueue = payload.nextPageToken
      ? [...cursor.queue, ...subfolders.map((f) => f.id)]
      : [...cursor.queue.slice(1), ...subfolders.map((f) => f.id)];
    const next: Cursor = {
      queue: nextQueue,
      pageToken: payload.nextPageToken ?? null,
      startedAt: cursor.startedAt,
    };

    // Scan finished: drop anything in the library that this run did not see,
    // i.e. files that live outside the Events & Awards folder or were removed.
    if (!nextQueue.length) {
      const { error: purgeError } = await db
        .from("content_assets")
        .delete()
        .lt("last_synced_at", cursor.startedAt);
      if (purgeError) errors.push(`Could not remove out-of-scope files: ${purgeError.message}`);
      const { error: nullPurgeError } = await db
        .from("content_assets")
        .delete()
        .is("last_synced_at", null);
      if (nullPurgeError) errors.push(`Could not remove unsynced files: ${nullPurgeError.message}`);
    }

    return {
      scanned: files.length,
      indexed: errors.length ? 0 : rows.length,
      skipped: 0,
      byCategory: errors.length ? {} : byCategory,
      errors,
      nextPageToken: nextQueue.length ? await encodeCursor(db, next) : null,
    };
  });
