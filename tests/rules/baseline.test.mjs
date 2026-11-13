/**
 * Baseline guarantees of firestore.rules (single-tenant). These must keep
 * passing through the tenancy rewrite; the cross-workspace suite is added
 * alongside it. Run: cd tests/rules && npm test
 */
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc } from "firebase/firestore";

let env;
const PROGRAM = [
  "opportunities",
  "opportunity_dates",
  "submissions",
  "submission_fields",
  "speakers",
  "proof_points",
  "content_assets",
  "content_snippets",
  "discoveries",
];

const as = (uid, email, verified = true) =>
  env.authenticatedContext(uid, { email, email_verified: verified }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: {
      rules: readFileSync("../../firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8181,
    },
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const e of ["admin@x.com", "mgr@x.com", "member@x.com"]) {
      await setDoc(doc(db, "allowed_emails", e), { email: e });
    }
    await setDoc(doc(db, "user_roles", "u_admin"), { user_id: "u_admin", role: "admin" });
    await setDoc(doc(db, "user_roles", "u_mgr"), { user_id: "u_mgr", role: "manager" });
    for (const c of PROGRAM) await setDoc(doc(db, c, "seed1"), { name: "seed" });
    await setDoc(doc(db, "integration_tokens", "google_drive"), { refresh_token: "secret" });
    await setDoc(doc(db, "job_secrets", "discover-daily"), { secret: "s" });
  });
});

describe("sign-in gate", () => {
  it("strangers, unverified and signed-out users read nothing", async () => {
    for (const c of PROGRAM) {
      await assertFails(getDoc(doc(as("u_x", "stranger@y.com"), c, "seed1")));
      await assertFails(getDoc(doc(as("u_member", "member@x.com", false), c, "seed1")));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), c, "seed1")));
    }
  });
});

describe("members", () => {
  it("read, create and update program data but cannot delete it", async () => {
    const db = as("u_member", "member@x.com");
    for (const c of PROGRAM) {
      await assertSucceeds(getDoc(doc(db, c, "seed1")));
      await assertSucceeds(getDocs(collection(db, c)));
      await assertSucceeds(setDoc(doc(db, c, "new1"), { name: "n" }));
      await assertFails(deleteDoc(doc(db, c, "seed1")));
    }
  });

  it("cannot grant access or roles", async () => {
    const db = as("u_member", "member@x.com");
    await assertFails(setDoc(doc(db, "allowed_emails", "evil@y.com"), { email: "evil@y.com" }));
    await assertFails(
      setDoc(doc(db, "user_roles", "u_member"), { user_id: "u_member", role: "admin" }),
    );
  });
});

describe("managers", () => {
  it("can delete program data, cannot grant roles", async () => {
    const db = as("u_mgr", "mgr@x.com");
    await assertSucceeds(deleteDoc(doc(db, "opportunities", "seed1")));
    await assertFails(setDoc(doc(db, "user_roles", "u_mgr"), { user_id: "u_mgr", role: "admin" }));
  });
});

describe("admins", () => {
  it("manage the allowlist and roles", async () => {
    const db = as("u_admin", "admin@x.com");
    await assertSucceeds(setDoc(doc(db, "allowed_emails", "new@x.com"), { email: "new@x.com" }));
    await assertSucceeds(
      setDoc(doc(db, "user_roles", "u_member"), { user_id: "u_member", role: "manager" }),
    );
    await assertFails(
      setDoc(doc(db, "user_roles", "u_member"), { user_id: "u_member", role: "god" }),
    );
  });
});

describe("server-only collections", () => {
  it("are closed to every client, admins included", async () => {
    const db = as("u_admin", "admin@x.com");
    await assertFails(getDoc(doc(db, "integration_tokens", "google_drive")));
    await assertFails(getDoc(doc(db, "job_secrets", "discover-daily")));
  });
});
