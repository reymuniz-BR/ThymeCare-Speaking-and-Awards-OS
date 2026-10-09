// Server-side seeding for a fresh Firestore database. Uses the Admin SDK with
// Application Default Credentials (Cloud Shell, Cloud Run, or
// `gcloud auth application-default login`), so it bypasses firestore.rules.
// It is never run by the app and nothing here is reachable over HTTP.
//
//   npm run seed -- taxonomy            status/priority/... lists (idempotent)
//   npm run seed -- admin you@co.com    first admin (only while no admin exists;
//                                       the person must have signed in once)
//   npm run seed -- job-secrets         create missing hook/calendar secrets and
//                                       print the new ones ONCE
import { randomBytes } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import config from "../firebase-applet-config.json" with { type: "json" };
import { DbClient } from "../src/integrations/supabase/firestore/builder.ts";
import { createAdminBackend } from "../src/integrations/supabase/firestore/admin-backend.ts";
import { seedFirstAdmin, seedJobSecrets, seedTaxonomyDefaults } from "../src/lib/seed.server.ts";

const [command, arg] = process.argv.slice(2);

if (!getApps().length) initializeApp({ projectId: config.projectId });
const db = new DbClient(createAdminBackend(getFirestore(config.firestoreDatabaseId)));

try {
  switch (command) {
    case "taxonomy": {
      const { created, existing } = await seedTaxonomyDefaults(db);
      console.log(`taxonomy_options: ${created} created, ${existing} already present`);
      break;
    }
    case "admin": {
      if (!arg) throw new Error("Usage: npm run seed -- admin <email>");
      let user;
      try {
        user = await getAuth().getUserByEmail(arg.trim().toLowerCase());
      } catch {
        throw new Error(
          `No Firebase account for ${arg}. Have them open the app and sign in once ` +
            "(they will be turned away, which is expected), then run this again.",
        );
      }
      await seedFirstAdmin(db, {
        uid: user.uid,
        email: user.email ?? arg,
        displayName: user.displayName ?? null,
        photoURL: user.photoURL ?? null,
        emailVerified: user.emailVerified,
      });
      console.log(`${user.email} is now the first admin. They can sign in.`);
      break;
    }
    case "job-secrets": {
      const created = await seedJobSecrets(db, () => randomBytes(32).toString("base64url"));
      const names = Object.keys(created);
      if (!names.length) console.log("All job secrets already exist; nothing created.");
      for (const [name, secret] of Object.entries(created)) {
        console.log(`${name}: ${secret}`);
      }
      if (names.length) console.log("\nStore these now; they are not shown again.");
      break;
    }
    default:
      console.error("Usage: npm run seed -- <taxonomy | admin <email> | job-secrets>");
      process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
