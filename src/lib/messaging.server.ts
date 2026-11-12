/** Server-only retrieval of the master messaging document from Google Drive. */

import type { AppDb } from "@/integrations/supabase/firestore/builder";
import {
  MASTER_MESSAGING_DOC_ID,
  MASTER_MESSAGING_DOC_URL,
  MASTER_MESSAGING_TAG,
  parseMessagingSections,
} from "@/lib/messaging";

async function exportDocText(): Promise<string> {
  const { driveClient } = await import("./drive-connection.server");
  const res = await driveClient().fetch(`/files/${MASTER_MESSAGING_DOC_ID}/export`, {
    mimeType: "text/plain",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Could not read the master messaging document [${res.status}]: ${body}`);
  }
  return res.text();
}

export async function pullMasterMessaging(
  db: AppDb,
): Promise<{ sections: number; syncedAt: string }> {
  const text = await exportDocText();
  const sections = parseMessagingSections(text);
  if (!sections.length) {
    throw new Error("The master messaging document came back empty.");
  }

  const syncedAt = new Date().toISOString();

  // Replace the previous pull so removed messaging never lingers as "approved".
  const { error: purgeError } = await db
    .from("content_snippets")
    .delete()
    .contains("tags", [MASTER_MESSAGING_TAG]);
  if (purgeError) throw new Error(purgeError.message);

  const rows = sections.map((s) => ({
    title: s.heading,
    body: s.body,
    category: "boilerplate" as const,
    tags: [MASTER_MESSAGING_TAG, "messaging"],
  }));

  const { error } = await db.from("content_snippets").insert(rows as never);
  if (error) throw new Error(error.message);

  return { sections: rows.length, syncedAt };
}

export { MASTER_MESSAGING_DOC_URL };
