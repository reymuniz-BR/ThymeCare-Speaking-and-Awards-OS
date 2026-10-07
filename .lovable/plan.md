# Product/UX review — Thyme Care Speaking & Awards OS

A critique of the app as built today, then a prioritized plan. No code changed.

## 1. Information architecture

What works: four tabs (Home, Opportunities, Submissions, Library) plus a persistent global search.

Problems found in the current build:

- Discover is a full 707-line sourcing page but is _not_ a tab — it lives in the overflow "More" menu and as a small brand-rail button. Sourcing is one of the four core jobs and is effectively hidden.
- The overflow menu holds four semi-dead destinations (Calendar, Monitoring log, Change history, Settings) that duplicate data already on Home and the opportunity detail page. Calendar and Monitoring are separate pages the team must remember to visit.
- Two parallel submission surfaces exist: `submissions.tsx` / `submissions_.$id.tsx` and legacy `workspace.tsx` / `workspace_.$id.tsx`. Dead weight and a source of divergent behavior.
- Opportunity detail and Submission detail overlap: both show source material, both can change status, and `syncOpportunityStatus` reconciles them behind the scenes. Users cannot tell which screen is authoritative.

Recommendation: five tabs — Home, Opportunities, Discover, Submissions, Library. Fold Calendar into an Opportunities view toggle (Table / Calendar), fold Monitoring log + Change history into one "Activity" drawer opened from Home and from each opportunity. Delete the `workspace*` routes.

## 2. Home / dashboard

Today: four stat tiles, deadline runway bucketed overdue/7/30/120, active submissions, new discoveries.

Missing for a daily operating view:

- No "what changed since I last looked" — `opportunity_changes` rows pending review and `monitoring_checks` results are not on Home, even though the change-detection engine exists.
- No per-person view. `owner_name` (Hailey / Haley / Cherie) exists but Home is not filterable by owner, so nobody sees "my queue."
- The runway lists deadlines but not whether a submission exists or how far along it is; the true risk signal is "due in 9 days, no draft started."
- Discovery items appear as a flat list with no fit score or one-click Pursue.

Reorder: (1) Needs a decision today — overdue + unreviewed changes + new high-fit discoveries, each with an inline action; (2) Deadline runway with draft-progress state per row; (3) Active submissions with last-touched date; (4) stat tiles demoted to a single compact strip. Add an owner filter (Me / All) persisted per user.

## 3. Opportunities

Strong: dense grid, inline owner and application-stage dropdowns, link autofill, `opportunity_dates` with confidence and multi-cycle support.

Gaps:

- No saved views in the UI even though a `saved_views` table exists. The team re-filters every session.
- No bulk actions (assign owner, set stage, archive) — triaging 53 imported records is row-by-row.
- Deadline column shows one computed `bestDeadline`; early vs final vs extended, and the "TBD/Rolling" records from the import, are not visually distinguished, so 30 "Needs Review" rows look identical to verified ones.
- No sort/group by owner or urgency; no "stale — not verified in 90 days" indicator despite `deadline_verified_at` and `last_verified_at` being stored.

Add: saved views chips, multi-select bulk edit, a verification-age badge, and grouping by urgency band.

## 4. Submissions

Today: a submission is a list of `submission_fields` (prompt + limits), each with an `AnswerDrafter` that can generate a version via Gemini, plus a Strategy Brief panel.

Friction:

- Questions must be typed in one at a time. There is no paste-a-call-for-entries bulk parse, even though `autofill.server.ts` already does URL fetch + structured extraction.
- The right rail lists _all_ snippets unranked and unfiltered — `matchContent` is wired into Discover and the strategy brief, but not into the drafting rail. The strongest asset in the codebase is not used where drafting happens.
- No overall progress (answered / total, words vs limit) at the submission level.
- Stage lives in two places (detail rail and Opportunities grid) with a silent sync.
- No export — the final act of the job (paste into a portal or send a doc) has no support.

## 5. Content recommendations — the biggest gap

Exists today: `content_assets` (Drive-synced, scoped to the Events & Awards folder), `content_snippets`, `proof_points`, `submission_answer_versions` with a `reusable` flag, and `matchContent` scoring assets/snippets/proof points/prior answers with a +weight floor for approved bank entries and bios.

Missing: per-question recommendation. `matchContent` is invoked for a whole discovery/opportunity subject, never for an individual `submission_fields.prompt`. So the drafting rail shows a global snippet list rather than "for _this_ question, here are the three closest prior answers, the on-message proof points, and the exec bio."

Target workflow inside a submission:

- Each question card gets a Recommended panel: top prior answers (with the opportunity and date they came from), matching proof points, bios when the question asks about a speaker, and Drive source docs — each with a relevance reason and an Insert / Insert as basis action.
- Reuse is recorded: `submission_fields.reused_from_field_id` and `reused_from_asset_id` columns exist and are currently unused — populate them so "what did we reuse" becomes reportable and `usage_count` becomes real.
- Freshness guard: surface `last_verified_at` / `expires_on` on any recommended metric so stale numbers are visibly flagged before they enter a draft.
- Hybrid ranking: keep deterministic keyword scoring for instant results, then optionally re-rank the top ~15 with one model call per question rather than per card.

## 6. Alerts and monitoring

`monitoring_checks` + `opportunity_changes` capture deadline drift with confidence and evidence, and a `notifications` table exists in the database but has zero references in the app code — nothing writes or reads it.

Recommendation: a bell in the brand rail backed by `notifications`, written when a monitoring check produces a change, when a high-fit discovery lands, and when a deadline crosses 14/7/1 days. Each notification deep-links to the record with Accept / Dismiss inline, so the standalone monitoring page becomes an audit log rather than a required stop. Weekly email digest (`email_digest_log` is already modeled) as a later step.

## 7. Visual design

The dark brand rail + tab bar + Panel/StatTile kit reads credibly. Weak points: the deadline runway and submission rail are plain unweighted lists at the same visual level as everything else, so urgency does not read at a glance; status is carried almost entirely by small chips with similar tone treatment; empty states are text-only; long pages have no sticky context.

Direction: keep Deep Forest / Lime, add one urgency ramp (overdue → this week → this month) applied consistently as a left edge marker on rows across Home, Opportunities and Submissions; give tables sticky headers and a sticky record header on detail pages; make chips carry meaning through a fixed tone-per-state map rather than per-screen choices; strengthen empty states with the action that fills them.

## 8. Ideal journeys

- Review a discovery: Home "Needs a decision" → expand card in place → see fit score, rationale, dedupe warning, recommended content → Pursue / Dismiss without leaving Home.
- Decide to pursue: Pursue creates the opportunity with dates and owner in one dialog, records provenance, and offers "start a submission now."
- Draft: open submission → paste the call-for-entries → questions auto-extracted → each question shows ranked prior answers/proof points/bios → insert, edit, finalize → progress bar completes → export.
- Manage to submitted: owner-filtered runway on Home; monitoring changes arrive as notifications with Accept-change; moving stage to Submitted updates the opportunity in one write.

## 9. Priorities

Must-fix

1. Discover promoted to a primary tab; delete the legacy `workspace*` routes.
2. Per-question content recommendations in the drafting rail (`matchContent` per prompt) with insert + provenance capture.
3. Home reordered around "needs a decision today," including unreviewed monitoring changes and draft-started state on the runway.
4. Notification bell backed by the unused `notifications` table.

High-value next 5. Bulk question capture from a pasted/linked call for entries. 6. Saved views + bulk edit + verification-age badges in Opportunities. 7. Owner filter (Me / All) across Home, Opportunities, Submissions. 8. Submission progress + export. 9. Urgency ramp and sticky headers applied consistently.

Nice-to-have 10. Calendar as an Opportunities view toggle; Monitoring + Activity merged into one drawer. 11. Weekly email digest. 12. Model re-rank of top recommendations per question.

## 10. Data-model limitations

Mostly additive; nothing blocking.

- `notifications` exists and is unused — no schema change needed, only writers and a reader.
- `submission_fields.reused_from_field_id` / `reused_from_asset_id` exist and are unused — populate them.
- `saved_views` exists and is unused — needs UI only.
- Missing: a per-field recommendation cache (optional; can be computed client-side at first) and a `last_opened_at` per user for "what changed since I last looked." Both are small additive tables/columns.
- Two status vocabularies (`opportunities.status` / `application_stage` vs `submissions.stage`) are reconciled in app code by `syncOpportunityStatus`. Safest fix is not a schema change but making the opportunity grid display the derived pipeline state from one shared mapping module so the two can never visibly disagree.

New tables would follow the project's standard: grants for `authenticated` and `service_role`, RLS enabled, policies scoped to the team.
