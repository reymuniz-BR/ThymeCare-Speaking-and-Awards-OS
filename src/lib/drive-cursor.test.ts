import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DbClient } from "../integrations/supabase/firestore/builder.ts";
import { MemoryBackend } from "../integrations/supabase/firestore/memory-backend.testing.ts";
import { decodeCursor, encodeCursor, freshCursor } from "./drive-cursor.server.ts";

const ROOT = "root-folder-id-123456";
const db = () => new DbClient(new MemoryBackend());

describe("drive sync cursor", () => {
  it("round-trips a genuine cursor", async () => {
    const d = db();
    const token = await encodeCursor(d, { ...freshCursor(ROOT), queue: ["leaf-folder-id-123456"] });
    const back = await decodeCursor(d, token, ROOT);
    assert.deepEqual(back.queue, ["leaf-folder-id-123456"]);
  });

  it("rejects a client-edited startedAt (future-dated purge)", async () => {
    const d = db();
    const token = await encodeCursor(d, freshCursor(ROOT));
    const [body, sig] = token.split(".");
    const forged = JSON.parse(atob(body!.replace(/-/g, "+").replace(/_/g, "/")));
    forged.startedAt = new Date(Date.now() + 86_400_000).toISOString();
    const evil = btoa(JSON.stringify(forged))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await assert.rejects(decodeCursor(d, `${evil}.${sig}`, ROOT), /not valid/);
    await assert.rejects(decodeCursor(d, "garbage", ROOT), /not valid/);
  });

  it("rejects a validly signed cursor that is too old", async () => {
    const d = db();
    const old = {
      ...freshCursor(ROOT),
      startedAt: new Date(Date.now() - 7 * 3600_000).toISOString(),
    };
    await assert.rejects(decodeCursor(d, await encodeCursor(d, old), ROOT), /not valid/);
  });

  it("starts a fresh scan on a null token", async () => {
    const c = await decodeCursor(db(), null, ROOT);
    assert.deepEqual(c.queue, [ROOT]);
  });
});
