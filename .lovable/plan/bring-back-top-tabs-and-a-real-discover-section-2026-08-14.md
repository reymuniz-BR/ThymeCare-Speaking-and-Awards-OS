# Bring back top tabs and a real Discover section

Two changes: restore the horizontal tab navigation across the top of the app, and put Discover back as one of those tabs so sourcing new opportunities has a proper home again.

## Navigation

Replace the left sidebar with a top bar:

```text
[T] Thyme Care  Speaking & Awards            [Search ⌘K]  [•••]
 Home | Opportunities | Discover | Submissions | Library
```

- Tabs: Home, Opportunities, Discover, Submissions, Library. Active tab gets an underline and stronger text.
- The overflow (•••) menu keeps the occasional views: Calendar, Deadline monitoring log, Change history, Settings, Sign out.
- Page title, subtitle and page-level actions stay in the header row, right below the tab strip, so each page keeps its own controls.
- On narrow screens the same tab strip scrolls horizontally — no separate mobile nav.
- Content widens now that the 56px sidebar is gone; grids get more room.

## Discover tab

Discover becomes a primary destination again, pointing at the existing search/triage page:

- Search area with the focus-area presets and the multi-agent opportunity search.
- Results triage list: each found opportunity shows organizer, type, deadline urgency, relevance and rationale, with Add to program / Dismiss actions and the "Find content" helper.
- Duplicate detection against existing opportunities stays as-is.
- The "Review" tab inside Opportunities stays for items already promoted for a decision, so nothing gets lost; Discover is where new items are sourced.

## Technical notes

- `src/components/app-shell.tsx`: swap the `aside` sidebar for a sticky top header with a tab row; move `/discover` from `MORE` into `NAV`; drop the duplicate mobile nav; keep `GlobalSearch`, `actions`, sign-out and email in the header/overflow.
- `src/routes/_authenticated/discover.tsx` already exists and keeps working — only the nav entry and its label change ("Discover" instead of "Opportunity search").
- No backend, data, auth or Drive changes.
