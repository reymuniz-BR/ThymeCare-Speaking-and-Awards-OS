# Speaking & Awards Program Management — Architecture Plan

An internal operating system for a healthcare-tech client's speaking opportunities, conferences, awards, and recognition programs. Built for a PR/communications team: dense, status-driven, professional.

## Confirmed decisions

- Sign-in: email/password + Google, accounts managed in the app.
- Google Drive: one shared team Drive connection (agency account).
- Discover: AI-assisted scanning plus manual/URL entry into one review queue.
- Deadline alerts: in-app indicators plus scheduled email digests.

## Sections

- **Dashboard** — deadlines in the next 7/30/90 days, submissions by stage, changes since last visit, unreviewed discoveries, my assignments.
- **Opportunities** — the master database. Dense filterable table (type, tier, status, deadline, owner, audience, cost) plus a detail record with timeline, past history, files, and submissions.
- **Calendar / Deadlines** — month and list views across open dates, deadlines, notification dates, and event dates; per-opportunity milestone tracking.
- **Discover** — review queue of AI-found and manually added candidates with source, relevance rationale, and dedupe check against existing records; promote to Opportunity or dismiss.
- **Submission Workspace** — per-submission editor with the prompt/question set, drafts, word limits, reuse suggestions from prior submissions, reviewers, and status.
- **Content Library** — indexed Drive materials (prior applications, exec bios, boilerplate, metrics, case studies) plus reusable snippets, searchable and insertable into drafts.
- **Activity / Changes** — audit stream of every field change, deadline shift, status move, and system-detected update.

## Data model (Postgres, Lovable Cloud)

Core:

- `organizations` / `profiles` — team members, linked to auth users.
- `user_roles` (separate table, enum `admin | manager | contributor | viewer`) with a `has_role()` security-definer function.
- `opportunities` — name, type (award | speaking | conference | recognition), organizer, url, description, audience, region, tier (1-3), cost, effort, strategic fit score, status (`prospect | tracking | in_progress | submitted | shortlisted | won | lost | declined | archived`), owner, tags, source, `created_from_discovery_id`.
- `opportunity_dates` — typed milestone rows per opportunity (`opens`, `deadline`, `extended_deadline`, `notification`, `event_start`, `event_end`), each with date, confidence, and last-verified timestamp. Typed rows rather than fixed columns so cycle-to-cycle changes are tracked.
- `opportunity_cycles` — yearly recurrence (2025, 2026 editions) so history persists across years.
- `submissions` — one per opportunity cycle: stage (`draft | in_review | approved | submitted | outcome_pending | won | lost`), assignee, reviewer, submitted_at, outcome, outcome_notes.
- `submission_fields` — the individual questions/prompts with answer text, word/char limit, and `reused_from_submission_field_id` for provenance.
- `speakers` — executives/SMEs with bios, topics, availability; `submission_speakers` join.
- `content_assets` — Drive-backed items: drive_file_id, name, mime, folder path, category (bio | boilerplate | prior_application | metrics | case_study | press), extracted text, last_synced_at.
- `content_snippets` — curated reusable blocks tagged by topic, with usage counts.
- `discoveries` — candidate opportunities: source_url, raw_extract, parsed fields, relevance score + rationale, dedupe match, status (`new | reviewed | promoted | dismissed`).
- `activity_log` — actor, entity type/id, action, field, old/new value, timestamp; written by DB triggers on opportunities, dates, and submissions.
- `notifications` — per-user in-app alerts with read state.
- `email_digest_log` — what was sent and when, to avoid duplicates.
- `saved_views` — per-user filter presets on the opportunities table.

Relationships: opportunity 1-N cycles 1-N submissions 1-N fields; opportunity 1-N dates; submission N-N speakers; submission fields reference content snippets/assets for reuse provenance; discoveries promote into opportunities.

Every table gets explicit grants, RLS enabled, and policies scoped to authenticated team members (role-gated writes, admin-only deletes).

## Key workflows

1. **Track** — add or import an opportunity, set milestone dates, assign an owner. Deadline changes are recorded as new date rows and logged.
2. **Watch** — a scheduled job re-checks tracked opportunity URLs, flags date/status drift, writes activity entries and notifications, and sends the email digest of upcoming and changed deadlines.
3. **Discover** — scheduled and on-demand AI search plus URL paste; results are scored, deduped against existing records, and queued for human review before entering the database.
4. **Draft** — open a submission, see each required question, and get suggested passages from prior submissions and Drive assets scored by similarity; insert, edit, and keep provenance so reuse is auditable.
5. **Review & submit** — route to reviewer, approve, mark submitted, then record the outcome, which feeds win-rate reporting on the dashboard.
6. **Sync** — shared Drive folders are indexed into `content_assets` with text extracted for search; re-sync on demand.

## Technical notes

- Lovable Cloud for database, auth, and storage. Email/password plus Google sign-in; protected routes under an authenticated layout.
- All data access through server functions with RLS; no client-side privileged reads.
- Google Drive via the shared workspace Drive connector, called only from server code.
- AI (Lovable AI Gateway) for discovery extraction/scoring, content similarity matching, and draft repurposing suggestions — always surfaced as suggestions a human accepts.
- Scheduled checks and digests via a secured public API route triggered on a schedule.
- Change tracking through database triggers so nothing depends on the UI writing history.
- UI: dense data tables, saved filters, keyboard-friendly navigation, explicit status/urgency color tokens, restrained neutral palette with a single accent — no decorative marketing styling.

## Build order

1. Cloud enablement, auth, schema, RLS, seed reference data.
2. Opportunities database + detail record + activity logging.
3. Dashboard and Calendar/Deadlines.
4. Submission Workspace.
5. Drive connection and Content Library.
6. Discover queue with AI scanning.
7. Deadline watcher job and email digests.
