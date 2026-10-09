import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DbClient } from "../integrations/supabase/firestore/builder.ts";
import { MemoryBackend } from "../integrations/supabase/firestore/memory-backend.testing.ts";
import { seedFirstAdmin, seedJobSecrets, seedTaxonomyDefaults } from "./seed.server.ts";

function fresh() {
  const backend = new MemoryBackend();
  return { backend, db: new DbClient(backend) };
}

describe("seedTaxonomyDefaults", () => {
  it("creates the original option lists once and never overwrites edits", async () => {
    const { db } = fresh();
    const first = await seedTaxonomyDefaults(db);
    assert.equal(first.created, 46);
    assert.equal(first.existing, 0);

    await db
      .from("taxonomy_options")
      .update({ label: "Watching" })
      .eq("kind", "status")
      .eq("applies_to", "speaking")
      .eq("value", "monitoring");

    const second = await seedTaxonomyDefaults(db);
    assert.equal(second.created, 0);
    assert.equal(second.existing, 46);

    const { data } = await db
      .from("taxonomy_options")
      .select("label, tone, is_active")
      .eq("kind", "status")
      .eq("applies_to", "speaking")
      .eq("value", "monitoring")
      .single();
    assert.deepEqual(data, { label: "Watching", tone: "info", is_active: true });
  });
});

describe("seedFirstAdmin", () => {
  const ada = { uid: "uid-ada", email: "Ada@Example.com", displayName: "Ada", emailVerified: true };

  it("approves the email, grants admin, and creates the profile", async () => {
    const { db, backend } = fresh();
    await seedFirstAdmin(db, ada);
    assert.deepEqual(
      backend.docs("allowed_emails").map((d) => d.id),
      ["ada@example.com"],
    );
    const role = backend.docs("user_roles").find((d) => d.id === "uid-ada");
    assert.equal(role?.data["role"], "admin");
    assert.equal(role?.data["user_id"], "uid-ada");
    assert.equal(backend.docs("profiles")[0]?.data["email"], "ada@example.com");
  });

  it("is closed once any admin exists", async () => {
    const { db, backend } = fresh();
    await seedFirstAdmin(db, ada);
    await assert.rejects(
      seedFirstAdmin(db, { uid: "uid-eve", email: "eve@example.com", emailVerified: true }),
      /admin already exists/,
    );
    assert.equal(backend.docs("user_roles").length, 1);
    assert.equal(backend.docs("allowed_emails").length, 1);
  });

  it("refuses an unverified email", async () => {
    const { db, backend } = fresh();
    await assert.rejects(seedFirstAdmin(db, { ...ada, emailVerified: false }), /not verified/);
    assert.equal(backend.docs("user_roles").length, 0);
  });
});

describe("seedJobSecrets", () => {
  it("creates only the missing secrets and reports just those", async () => {
    const { db, backend } = fresh();
    let n = 0;
    const first = await seedJobSecrets(db, () => `secret-${++n}`);
    assert.deepEqual(Object.keys(first).sort(), [
      "calendar-feed",
      "discover-daily",
      "email-digest",
      "tracker-weekly",
    ]);
    const again = await seedJobSecrets(db, () => `secret-${++n}`);
    assert.deepEqual(again, {});
    assert.equal(backend.docs("job_secrets").length, 4);
  });
});
