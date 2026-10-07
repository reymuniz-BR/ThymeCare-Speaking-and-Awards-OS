/** Server-only retrieval of the master messaging document from Google Drive. */

import {
  MASTER_MESSAGING_DOC_ID,
  MASTER_MESSAGING_DOC_URL,
  MASTER_MESSAGING_TAG,
  parseMessagingSections,
} from "@/lib/messaging";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

async function exportDocText(): Promise<string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error(
      "Google Drive is not connected yet. Connect the team Drive from the project connectors, then sync again.",
    );
  }

  const res = await fetch(
    `${GATEWAY_URL}/files/${MASTER_MESSAGING_DOC_ID}/export?mimeType=text/plain&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
      },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Could not read the master messaging document [${res.status}]: ${body}`);
  }
  return res.text();
}

export async function pullMasterMessaging(): Promise<{ sections: number; syncedAt: string }> {
  const text = await exportDocText();
  const sections = parseMessagingSections(text);
  if (!sections.length) {
    throw new Error("The master messaging document came back empty.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const syncedAt = new Date().toISOString();

  // Replace the previous pull so removed messaging never lingers as "approved".
  const { error: purgeError } = await supabaseAdmin
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

  const { error } = await supabaseAdmin.from("content_snippets").insert(rows as never);
  if (error) throw new Error(error.message);

  return { sections: rows.length, syncedAt };
}

export { MASTER_MESSAGING_DOC_URL };
