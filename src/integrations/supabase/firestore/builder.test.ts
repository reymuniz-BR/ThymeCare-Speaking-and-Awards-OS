/**
 * Behavioural tests for the Supabase-style builder against an in-memory
 * backend (no Firebase, no network). Run with `npm run test:db`.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { DbClient } from "./builder.ts";
import { MemoryBackend } from "./memory-backend.testing.ts";
import type { TableName } from "./schema.generated.ts";

function fresh() {
  const backend = new MemoryBackend();
  return { backend, db: new DbClient(backend) };
}

async function seedOpps(db: DbClient) {
  const { data, error } = await db
    .from("opportunities")
    .insert([
      { name: "Alpha Awards", type: "award", final_deadline: "2026-03-01", tier: 1 },
      { name: "Beta Summit", type: "speaking", final_deadline: "2026-01-15", tier: 2 },
      { name: "Gamma Prize", type: "award", tier: 3 },
    ])
    .select("id, name");
  assert.equal(error, null);
  return data!;
}

describe("insert", () => {
  it("applies column defaults, nulls and timestamps, and returns rows only when asked", async () => {
    const { db } = fresh();
    const bare = await db.from("opportunities").insert({ name: "X" });
    assert.equal(bare.error, null);
    assert.equal(bare.data, null);

    const { data } = await db.from("opportunities").insert({ name: "Y" }).select().single();
    assert.equal(data?.status, "monitoring");
    assert.equal(data?.tier, 2);
    assert.equal(data?.monitoring_enabled, true);
    assert.deepEqual(data?.tags, []);
    assert.equal(data?.owner_id, null);
    assert.match(String(data?.id), /^[0-9a-f-]{36}$/);
    assert.ok(data?.created_at && data?.updated_at);
  });

  it("rejects unknown columns", async () => {
    const { db } = fresh();
    const { error } = await db.from("speakers").insert({ full_name: "A", nope: 1 } as never);
    assert.equal(error?.code, "PGRST204");
  });

  it("enforces natural-key uniqueness with 23505 (digest claim)", async () => {
    const { db } = fresh();
    const claim = () =>
      db.from("email_digest_log").insert({ digest_key: "weekly-2026-01-05", recipient: "a@x.com" });
    assert.equal((await claim()).error, null);
    assert.equal((await claim()).error?.code, "23505");
    const other = await db
      .from("email_digest_log")
      .insert({ digest_key: "weekly-2026-01-05", recipient: "b@x.com" });
    assert.equal(other.error, null);
  });

  it("enforces the opportunity name+type unique index (case-insensitive)", async () => {
    const { db } = fresh();
    await db.from("opportunities").insert({ name: "Same Name", type: "award" });
    const dup = await db.from("opportunities").insert({ name: " same name ", type: "award" });
    assert.equal(dup.error?.code, "23505");
    const otherType = await db
      .from("opportunities")
      .insert({ name: "Same Name", type: "speaking" });
    assert.equal(otherType.error, null);
  });

  it("numbers answer versions per field", async () => {
    const { db } = fresh();
    const base = { field_id: "f1", submission_id: "s1" };
    await db.from("submission_answer_versions").insert(base);
    await db.from("submission_answer_versions").insert(base);
    await db.from("submission_answer_versions").insert({ ...base, field_id: "f2" });
    const { data } = await db
      .from("submission_answer_versions")
      .select("field_id, version")
      .order("field_id")
      .order("version", { ascending: false });
    assert.deepEqual(data, [
      { field_id: "f1", version: 2 },
      { field_id: "f1", version: 1 },
      { field_id: "f2", version: 1 },
    ]);
  });
});

describe("select, filters, ordering", () => {
  it("supports eq/neq/lt/lte/gt/gte/is/in/not with SQL null semantics", async () => {
    const { db } = fresh();
    await seedOpps(db);
    const names = async (q: PromiseLike<{ data: { name: string }[] | null }>) =>
      ((await q).data ?? []).map((r) => r.name).sort();

    assert.deepEqual(await names(db.from("opportunities").select("name").eq("type", "award")), [
      "Alpha Awards",
      "Gamma Prize",
    ]);
    assert.deepEqual(
      await names(db.from("opportunities").select("name").lt("final_deadline", "2026-02-01")),
      ["Beta Summit"],
    );
    assert.deepEqual(
      await names(db.from("opportunities").select("name").gte("final_deadline", "2026-01-15")),
      ["Alpha Awards", "Beta Summit"],
    );
    assert.deepEqual(
      await names(db.from("opportunities").select("name").is("final_deadline", null)),
      ["Gamma Prize"],
    );
    // neq excludes NULLs, exactly like SQL.
    assert.deepEqual(
      await names(db.from("opportunities").select("name").neq("final_deadline", "2026-03-01")),
      ["Beta Summit"],
    );
    assert.deepEqual(await names(db.from("opportunities").select("name").in("tier", [1, 3])), [
      "Alpha Awards",
      "Gamma Prize",
    ]);
    assert.deepEqual(await names(db.from("opportunities").select("name").in("tier", [])), []);
    assert.deepEqual(
      await names(
        db.from("opportunities").select("name").not("type", "in", "(speaking,conference)"),
      ),
      ["Alpha Awards", "Gamma Prize"],
    );
    assert.deepEqual(
      await names(db.from("opportunities").select("name").not("final_deadline", "is", null)),
      ["Alpha Awards", "Beta Summit"],
    );
  });

  it("orders with Postgres null placement and honours nullsFirst", async () => {
    const { db } = fresh();
    await seedOpps(db);
    const order = async (o: { ascending?: boolean; nullsFirst?: boolean }) =>
      ((await db.from("opportunities").select("name").order("final_deadline", o)).data ?? []).map(
        (r) => r.name,
      );
    assert.deepEqual(await order({ ascending: true }), [
      "Beta Summit",
      "Alpha Awards",
      "Gamma Prize",
    ]);
    assert.deepEqual(await order({ ascending: false }), [
      "Gamma Prize",
      "Alpha Awards",
      "Beta Summit",
    ]);
    assert.deepEqual(await order({ ascending: false, nullsFirst: false }), [
      "Alpha Awards",
      "Beta Summit",
      "Gamma Prize",
    ]);
    assert.deepEqual(await order({ ascending: true, nullsFirst: true }), [
      "Gamma Prize",
      "Beta Summit",
      "Alpha Awards",
    ]);
  });

  it("limits after ordering, and counts with head:true", async () => {
    const { db } = fresh();
    await seedOpps(db);
    const { data } = await db.from("opportunities").select("name").order("name").limit(2);
    assert.deepEqual(
      data?.map((r) => r.name),
      ["Alpha Awards", "Beta Summit"],
    );
    const head = await db
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("type", "award");
    assert.equal(head.data, null);
    assert.equal(head.count, 2);
    const counted = await db.from("opportunities").select("id", { count: "exact" }).limit(1);
    assert.equal(counted.data?.length, 1);
    assert.equal(counted.count, 3);
  });

  it("contains means array containment (AND), not overlap", async () => {
    const { db } = fresh();
    await db.from("content_snippets").insert([
      { title: "a", body: "", tags: ["x", "y"] },
      { title: "b", body: "", tags: ["x"] },
      { title: "c", body: "", tags: ["y", "z"] },
    ]);
    const hit = async (tags: string[]) =>
      ((await db.from("content_snippets").select("title").contains("tags", tags)).data ?? [])
        .map((r) => r.title)
        .sort();
    assert.deepEqual(await hit(["x"]), ["a", "b"]);
    assert.deepEqual(await hit(["x", "y"]), ["a"]);
    assert.deepEqual(await hit(["x", "z"]), []);
  });

  it("slices `in` past 30 values and merges", async () => {
    const { db, backend } = fresh();
    const rows = Array.from({ length: 75 }, (_, i) => ({
      title: `t${i}`,
      body: "",
      category: "bio" as const,
    }));
    await db.from("content_snippets").insert(rows);
    const all = (await db.from("content_snippets").select("title")).data!;
    const { data } = await db
      .from("content_snippets")
      .select("title")
      .in(
        "title",
        all.map((r) => r.title),
      );
    assert.equal(data?.length, 75);
    assert.ok(backend.lists.some((q) => q.in && q.in.values.length === 15));
  });

  it("single() / maybeSingle() return errors, never throw", async () => {
    const { db } = fresh();
    await seedOpps(db);
    const none = await db.from("opportunities").select("*").eq("name", "nope").single();
    assert.equal(none.error?.code, "PGRST116");
    assert.equal(none.data, null);
    const many = await db.from("opportunities").select("*").eq("type", "award").maybeSingle();
    assert.equal(many.error?.code, "PGRST116");
    const absent = await db.from("opportunities").select("*").eq("name", "nope").maybeSingle();
    assert.equal(absent.error, null);
    assert.equal(absent.data, null);
    const one = await db.from("opportunities").select("name").eq("name", "Beta Summit").single();
    assert.deepEqual(one.data, { name: "Beta Summit" });
  });

  it("projects only the selected columns", async () => {
    const { db } = fresh();
    await db.from("job_secrets").insert({ name: "calendar-feed", secret: "s3cret" });
    const { data } = await db
      .from("job_secrets")
      .select("name")
      .eq("name", "calendar-feed")
      .single();
    assert.deepEqual(data, { name: "calendar-feed" });
  });
});

describe("embedded relations", () => {
  async function graph(db: DbClient) {
    const opp = (
      await db
        .from("opportunities")
        .insert({ name: "Conf", type: "speaking" })
        .select("id")
        .single()
    ).data!;
    const sub = (
      await db
        .from("submissions")
        .insert({ opportunity_id: opp.id, title: "Talk" })
        .select("id")
        .single()
    ).data!;
    const f1 = (
      await db
        .from("submission_fields")
        .insert({ submission_id: sub.id, prompt: "Q1" })
        .select("id")
        .single()
    ).data!;
    await db.from("submission_fields").insert({ submission_id: sub.id, prompt: "Q2" });
    return { opp, sub, f1 };
  }

  it("resolves to-one and nested to-one embeds (rel(cols), a(b(...)))", async () => {
    const { db } = fresh();
    const { f1 } = await graph(db);
    const { data } = await db
      .from("submission_fields")
      .select("id, prompt, submissions(title, opportunities(name, type))")
      .eq("id", f1.id)
      .maybeSingle();
    assert.deepEqual(data, {
      id: f1.id,
      prompt: "Q1",
      submissions: { title: "Talk", opportunities: { name: "Conf", type: "speaking" } },
    });
  });

  it("resolves to-many embeds alongside *", async () => {
    const { db } = fresh();
    const { opp, sub } = await graph(db);
    const { data } = await db
      .from("opportunities")
      .select("*, opportunity_dates(*), submissions(id, title)")
      .eq("id", opp.id)
      .single();
    assert.equal(data?.name, "Conf");
    assert.deepEqual(data?.opportunity_dates, []);
    assert.deepEqual(data?.submissions, [{ id: sub.id, title: "Talk" }]);

    const withFields = await db
      .from("submissions")
      .select("*, opportunities(id, name, type, url, application_url), submission_fields(*)")
      .eq("id", sub.id)
      .single();
    assert.equal(withFields.data?.submission_fields.length, 2);
    assert.equal(withFields.data?.opportunities?.name, "Conf");
  });

  it("resolves aliased FK joins (profiles:actor_id, owner:follow_up_owner_id)", async () => {
    const { db } = fresh();
    await db.from("profiles").insert({ id: "u1", full_name: "Ada" });
    const opp = (await db.from("opportunities").insert({ name: "O" }).select("id").single()).data!;
    await db.from("activity_log").insert({
      action: "x",
      entity_type: "opportunity",
      actor_id: "u1",
      opportunity_id: opp.id,
    });
    const { data } = await db
      .from("activity_log")
      .select("*, profiles:actor_id(full_name), opportunities:opportunity_id(name)")
      .eq("action", "x");
    assert.equal(data?.[0]?.profiles?.full_name, "Ada");
    assert.equal(data?.[0]?.opportunities?.name, "O");

    await db.from("brief_items").insert({
      week_start: "2026-01-05",
      item_key: "k",
      section: "s",
      follow_up_owner_id: "u1",
    });
    const brief = await db
      .from("brief_items")
      .select("*, owner:follow_up_owner_id(full_name), reviewer:reviewed_by(full_name)")
      .eq("week_start", "2026-01-05");
    assert.equal(brief.data?.[0]?.owner?.full_name, "Ada");
    assert.equal(brief.data?.[0]?.reviewer, null);
  });

  it("fails loudly on unknown relations", async () => {
    const { db } = fresh();
    await db.from("speakers").insert({ full_name: "A" });
    const { error } = await db.from("speakers").select("id, nope(id)" as "id");
    assert.equal(error?.code, "PGRST200");
  });
});

describe("update / delete / upsert", () => {
  it("updates by filter, stamps updated_at, returns rows with select()", async () => {
    const { db } = fresh();
    await seedOpps(db);
    const { data, error } = await db
      .from("opportunities")
      .update({ priority: "high" })
      .eq("type", "award")
      .select("name, priority");
    assert.equal(error, null);
    assert.equal(data?.length, 2);
    assert.ok(data?.every((r) => r.priority === "high"));
    const miss = await db
      .from("opportunities")
      .update({ priority: "low" })
      .eq("id", "does-not-exist");
    assert.equal(miss.error, null);
  });

  it("single-flight claim: update..lt..select only lands once per window", async () => {
    const { db } = fresh();
    const claim = async (cutoff: string, now: string) => {
      const { data } = await db
        .from("webhook_runs")
        .update({ last_run_at: now })
        .eq("name", "job")
        .lt("last_run_at", cutoff)
        .select("name");
      if (data && data.length) return "claimed";
      const { error } = await db.from("webhook_runs").insert({ name: "job", last_run_at: now });
      return error ? (error.code === "23505" ? "busy" : "error") : "claimed";
    };
    assert.equal(await claim("2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z"), "claimed"); // first ever
    assert.equal(await claim("2026-01-02T00:00:00.000Z", "2026-01-08T01:00:00.000Z"), "busy"); // inside window
    assert.equal(await claim("2026-01-09T00:00:00.000Z", "2026-01-15T00:00:00.000Z"), "claimed"); // window over
  });

  it("upserts on natural keys: onConflict name / week_start,item_key / drive_file_id", async () => {
    const { db } = fresh();
    await db
      .from("webhook_runs")
      .upsert({ name: "paused", last_run_at: "t1" }, { onConflict: "name" });
    await db
      .from("webhook_runs")
      .upsert({ name: "paused", last_run_at: "t2" }, { onConflict: "name" });
    const runs = await db.from("webhook_runs").select("*");
    assert.equal(runs.data?.length, 1);
    assert.equal(runs.data?.[0]?.last_run_at, "t2");

    const item = { week_start: "2026-01-05", item_key: "a", section: "s" };
    await db
      .from("brief_items")
      .upsert({ ...item, title: "one" }, { onConflict: "week_start,item_key" });
    await db
      .from("brief_items")
      .upsert({ ...item, title: "two" }, { onConflict: "week_start,item_key" });
    const briefs = await db.from("brief_items").select("*");
    assert.equal(briefs.data?.length, 1);
    assert.equal(briefs.data?.[0]?.title, "two");

    await db.from("content_assets").upsert(
      [
        { name: "A", drive_file_id: "d1" },
        { name: "B", drive_file_id: "d2" },
      ],
      { onConflict: "drive_file_id" },
    );
    await db.from("content_assets").upsert(
      [
        { name: "A2", drive_file_id: "d1" },
        { name: "C", drive_file_id: "d3" },
      ],
      { onConflict: "drive_file_id" },
    );
    const assets = await db
      .from("content_assets")
      .select("name, drive_file_id")
      .order("drive_file_id");
    assert.deepEqual(assets.data, [
      { name: "A2", drive_file_id: "d1" },
      { name: "B", drive_file_id: "d2" },
      { name: "C", drive_file_id: "d3" },
    ]);

    const brief = await db
      .from("submission_briefs")
      .upsert({ submission_id: "s1" }, { onConflict: "submission_id" })
      .select()
      .single();
    assert.equal(brief.error, null);
    assert.equal(brief.data?.submission_id, "s1");
  });

  it("deletes by filter (`lt` / `is null`, as the Drive purge does)", async () => {
    const { db } = fresh();
    await db
      .from("content_assets")
      .insert([
        { name: "old", last_synced_at: "2026-01-01T00:00:00.000Z" },
        { name: "new", last_synced_at: "2026-02-01T00:00:00.000Z" },
        { name: "never" },
      ]);
    await db.from("content_assets").delete().lt("last_synced_at", "2026-01-15T00:00:00.000Z");
    await db.from("content_assets").delete().is("last_synced_at", null);
    const { data } = await db.from("content_assets").select("name");
    assert.deepEqual(data, [{ name: "new" }]);
  });

  it("cascades deletes like the foreign keys did", async () => {
    const { db, backend } = fresh();
    const opp = (await db.from("opportunities").insert({ name: "O" }).select("id").single()).data!;
    const sub = (
      await db
        .from("submissions")
        .insert({ opportunity_id: opp.id, title: "S" })
        .select("id")
        .single()
    ).data!;
    const f = (
      await db
        .from("submission_fields")
        .insert({ submission_id: sub.id, prompt: "Q" })
        .select("id")
        .single()
    ).data!;
    await db.from("submission_answer_versions").insert({ field_id: f.id, submission_id: sub.id });
    await db.from("submissions").delete().eq("id", sub.id);
    assert.equal(backend.docs("submissions").length, 0);
    assert.equal(backend.docs("submission_fields").length, 0);
    assert.equal(backend.docs("submission_answer_versions").length, 0);
    assert.equal(backend.docs("opportunities").length, 1);
  });
});

describe("natural keys", () => {
  it("refuses to edit the columns a document ID is derived from", async () => {
    const { db } = fresh();
    await db.from("taxonomy_options").insert({ kind: "priority", value: "p1", label: "P1" });
    const rename = await db.from("taxonomy_options").update({ label: "Urgent" }).eq("value", "p1");
    assert.equal(rename.error, null);
    const rekey = await db.from("taxonomy_options").update({ value: "p2" }).eq("value", "p1");
    assert.equal(rekey.error?.code, "23000");
  });
});

describe("every embedded select in the app resolves", () => {
  // Scan the source for `.from("t").select("...")` and run each against an empty
  // store: an unresolvable relation fails with PGRST200 even with zero rows.
  const root = fileURLToPath(new URL("../../../", import.meta.url)); // src/
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.(test|check|generated)\./.test(name))
        files.push(full);
    }
  };
  walk(root);

  const selects: { table: string; select: string; file: string }[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\.from\("(\w+)"\)\s*\.select\(\s*"([^"]+)"/g)) {
      selects.push({ table: m[1]!, select: m[2]!, file });
    }
  }

  it("found the app's relation selects", () => {
    assert.ok(
      selects.filter((s) => s.select.includes("(")).length >= 10,
      "scan found too few selects",
    );
  });

  it("resolves all of them", async () => {
    const { db } = fresh();
    for (const { table, select, file } of selects) {
      const { error } = await (
        db.from(table as "speakers") as unknown as {
          select(cols: string): PromiseLike<{ error: { message: string } | null }>;
        }
      ).select(select);
      assert.equal(error, null, `${table}.select("${select}") in ${file}: ${error?.message}`);
    }
  });
});

describe("triggers", () => {
  it("syncs opportunity dates from the date columns and logs activity", async () => {
    const { db } = fresh();
    const opp = (
      await db
        .from("opportunities")
        .insert({ name: "O", final_deadline: "2026-05-01", event_date: "2026-09-01" })
        .select("id")
        .single()
    ).data!;
    const dates = async () =>
      (
        await db
          .from("opportunity_dates")
          .select("kind, date, note")
          .eq("opportunity_id", opp.id)
          .order("kind")
      ).data;
    assert.deepEqual(await dates(), [
      { kind: "deadline", date: "2026-05-01", note: "auto" },
      { kind: "event_start", date: "2026-09-01", note: "auto" },
    ]);
    await db
      .from("opportunities")
      .update({ final_deadline: "2026-06-01", event_date: null })
      .eq("id", opp.id);
    assert.deepEqual(await dates(), [{ kind: "deadline", date: "2026-06-01", note: "auto" }]);

    const actions = (await db.from("activity_log").select("action")).data!.map((r) => r.action);
    assert.ok(actions.includes("created"));
    assert.ok(actions.includes("date_added"));
    assert.ok(actions.includes("date_changed"));

    await db.from("opportunities").update({ status: "submitted" }).eq("id", opp.id);
    const status = await db
      .from("activity_log")
      .select("old_value, new_value")
      .eq("action", "status_changed");
    assert.deepEqual(status.data, [{ old_value: "monitoring", new_value: "submitted" }]);
  });
});

describe("owner scoping (browser RLS emulation)", () => {
  it("only ever reads and writes the signed-in user's private rows", async () => {
    const { db, backend } = fresh();
    backend.scopeToOwner = true;
    backend.actorId = "u1";
    await db.from("saved_views").insert({ name: "mine", user_id: "u1" });
    backend.actorId = "u2";
    await db.from("saved_views").insert({ name: "theirs", user_id: "u2" });

    backend.actorId = "u1";
    const before = backend.lists.length;
    assert.deepEqual((await db.from("saved_views").select("name")).data, [{ name: "mine" }]);
    // The owner filter is pushed down, which is what firestore.rules requires of a list query.
    assert.ok(
      backend.lists
        .slice(before)
        .every((q) => q.eq.some(([c, v]) => c === "user_id" && v === "u1")),
    );
    const theirs = backend.docs("saved_views").find((d) => d.data["name"] === "theirs")!;
    await db.from("saved_views").delete().eq("id", theirs.id);
    assert.equal(backend.docs("saved_views").length, 2, "cannot delete another user's view");
  });

  it("allowed_emails use the lowercase email as the document ID", async () => {
    const { db, backend } = fresh();
    await db.from("allowed_emails").insert({ email: "  Ada@Example.COM ", note: "n" });
    assert.deepEqual(
      backend.docs("allowed_emails").map((d) => d.id),
      ["ada@example.com"],
    );
    const dup = await db.from("allowed_emails").insert({ email: "ada@example.com" });
    assert.equal(dup.error?.code, "23505");
    await db.from("allowed_emails").delete().eq("id", "ada@example.com");
    assert.equal(backend.docs("allowed_emails").length, 0);
  });
});
