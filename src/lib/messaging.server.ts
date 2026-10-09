/** Server-only retrieval of the master messaging document from Google Drive. */

import type { AppDb } from "@/integrations/supabase/firestore/builder";
import {
  MASTER_MESSAGING_DOC_ID,
  MASTER_MESSAGING_DOC_URL,
  MASTER_MESSAGING_TAG,
  parseMessagingSections,
} from "@/lib/messaging";

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

async function exportDocText(): Promise<string> {
  const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];

  let url: string;
  let headers: Record<string, string> = {};

  if (driveKey && (!lovableKey || driveKey.startsWith("ya29.") || driveKey.startsWith("Bearer "))) {
    if (driveKey.startsWith("ya29.") || driveKey.startsWith("Bearer ")) {
      const token = driveKey.replace(/^Bearer\s+/i, "");
      url = `${GOOGLE_DRIVE_API}/files/${MASTER_MESSAGING_DOC_ID}/export?mimeType=text/plain&supportsAllDrives=true`;
      headers = { Authorization: `Bearer ${token}` };
    } else {
      url = `${GOOGLE_DRIVE_API}/files/${MASTER_MESSAGING_DOC_ID}/export?mimeType=text/plain&supportsAllDrives=true&key=${driveKey}`;
    }
  } else if (lovableKey && driveKey) {
    url = `${GATEWAY_URL}/files/${MASTER_MESSAGING_DOC_ID}/export?mimeType=text/plain&supportsAllDrives=true`;
    headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": driveKey,
    };
  } else if (driveKey) {
    url = `${GOOGLE_DRIVE_API}/files/${MASTER_MESSAGING_DOC_ID}/export?mimeType=text/plain&supportsAllDrives=true&key=${driveKey}`;
  } else {
    throw new Error(
      "Google Drive is not connected yet. Add GOOGLE_DRIVE_API_KEY in workspace settings.",
    );
  }

  const res = await fetch(url, { headers });
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
