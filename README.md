# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Access control & bootstrap

Data lives in Firestore (the named database in `firebase-applet-config.json`). Access is an allowlist, enforced by `firestore.rules` and again on the server:

- **Team member**: a signed-in user with a *verified* email that has a document at `allowed_emails/<lowercase email>`. Signing in alone grants nothing.
- **Roles**: `user_roles/<uid>` holds `{ user_id, role }` (`admin`, `manager`, `contributor`, `viewer`). Only admins write `allowed_emails` and `user_roles`; managers and admins delete program data and edit taxonomy.
- **Server-only collections** (clients are denied everything): `job_secrets`, `webhook_runs`, `email_digest_log`, `integration_tokens`.
- **Server code** (server functions, scheduled hooks, scripts) uses firebase-admin through `src/integrations/supabase/client.server.ts`. Server functions require a valid Firebase ID token from an allowlisted, verified user (401/403 otherwise).

The original "first user becomes admin" trigger is deliberately not reproduced in the browser. Seed the first admin from a trusted shell instead (Cloud Shell works; it uses Application Default Credentials against the project in `firebase-applet-config.json`):

```sh
npm run seed -- taxonomy            # status/priority/... option lists (idempotent, never overwrites edits)
npm run seed -- admin you@co.com    # works only while NO admin exists; the person must have signed in once
npm run seed -- job-secrets         # creates any missing hook/calendar secrets and prints the new ones once
```

`admin` needs the person to have opened the app and signed in once with Google (they are turned away, which creates their Firebase account); then it approves their email, grants `admin`, and creates their profile. After that, admins add everyone else under Settings, Team access. Password sign-in only works for accounts that already exist and have a verified email; sign-in never creates an account.

Scheduled hooks (`/api/public/hooks/*`) authenticate with a secret in `x-job-secret` (or `x-monitor-secret`, or a bearer token): the stored per-job secret from `job_secrets/<job>` or `MONITOR_WEBHOOK_SECRET`. With neither configured they return 503; scheduler headers are not credentials. `monitor-weekly` takes the environment secret only. Deploy `firestore.rules` yourself (`firebase deploy --only firestore:rules`); nothing in this repo does it.

## Data layer

`supabase.from(...)` in `src/integrations/supabase/client.ts` (browser) and `supabaseAdmin.from(...)` in `client.server.ts` (server) are one typed, PostgREST-flavoured query builder (`src/integrations/supabase/firestore/`) over two backends: the Firestore web SDK and firebase-admin. Typing comes from `types.ts`; `schema.generated.ts` (regenerate with `npm run gen:schema`) carries the columns and foreign keys the runtime needs for embedded selects. Filtering beyond equality, ordering, limits, joins, column defaults, unique keys, cascades and the old trigger behaviour (answer versions, opportunity date sync, activity log) are implemented in the builder so both backends behave the same. `npm run test:db` runs its tests against an in-memory backend.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
