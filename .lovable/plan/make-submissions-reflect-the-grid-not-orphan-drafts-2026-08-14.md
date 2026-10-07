# Make Submissions reflect the grid, not orphan drafts

## What's actually happening

There are only four submission records in the whole system, and all four are duplicate drafts for HIMSS Global Health Conference & Exhibition — created by clicking "Start submission" four times on the same opportunity. Nothing else has a submission record yet. Meanwhile the Opportunities grid already tracks real progress in its own status field: Fierce Healthcare Innovation Awards and Fast Company's Most Innovative Companies are "In progress", and eight opportunities are "Submitted" (AI Breakthrough, HLTH, Inc 5000, Modern Healthcare Innovator Awards, and others), plus two "Won".

So the Submissions page and Home's "In progress" section are showing drafting artifacts, not the team's real pipeline.

## The fix

**1. Drive Submissions from opportunity status, not just submission rows.**
The Submissions list becomes the union of:

- opportunities whose grid status is In progress / Submitted / Won / Lost
- any opportunity that has an actual draft submission record

Each opportunity appears exactly once, showing its name, award vs speaking, deadline, and current stage. Opening a row goes to the submission working page; if no submission record exists yet, one is created on open so drafting can start immediately.

**2. Add a Submitted section.**
Three segments on the Submissions page:

- In progress — actively being drafted or reviewed
- Submitted — sent, awaiting outcome
- Decided — won / lost / passed (collapsed by default)

Home's "In progress" section follows the same rule, so Fierce and Fast Company appear there instead of four HIMSS rows.

**3. Clean up the duplicate HIMSS drafts.**
Keep the most recent HIMSS draft (any answers written in the others are preserved by merging non-empty fields into the survivor), delete the three empty duplicates. Nothing else is touched.

**4. Prevent it recurring.**
"Start submission" checks for an existing submission on that opportunity first and opens it rather than creating another. The button reads "Open submission" once one exists.

## Keeping the two statuses in sync

The grid status stays the single source of truth the team edits. When a submission is moved to Submitted or Won on its working page, the opportunity's grid status updates to match, so the two never disagree.

## Technical notes

- Submissions list query joins `opportunities` (status in in_progress / submitted / won / lost) with `submissions`, de-duplicated by opportunity id; same helper feeds Home's In progress block.
- Deduplication is a one-off data cleanup on the four HIMSS rows, merging `submission_fields` answers into the survivor before deleting empties. No schema changes, no destructive migration.
- Stage-to-status mapping added in the shared program helpers so Submissions stages and grid statuses stay aligned in one place.
