/**
 * Reads the client's master "Speaking and Awards Grid" workbook out of Google
 * Drive and turns it into normalised rows the operating system can diff
 * against. The grid is still edited by hand every week, so it stays the source
 * of truth for the fields the team maintains there.
 */
import * as XLSX from "xlsx";

const DRIVE_URL = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

/** The tracker workbook in the shared team Drive. */
export const TRACKER_FILE_ID = "1lr4-FbpgLjQOkjtQJz2w1A_qIb-DRdrI";

export type SheetRow = Record<string, string>;

function driveHeaders(): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error(
      "Google Drive is not connected yet. Connect the team Drive from the project connectors, then sync again.",
    );
  }
  return { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connectionKey };
}

export async function trackerMeta(): Promise<{ name: string; modifiedTime: string }> {
  const res = await fetch(
    `${DRIVE_URL}/files/${TRACKER_FILE_ID}?fields=id,name,modifiedTime&supportsAllDrives=true`,
    { headers: driveHeaders() },
  );
  if (!res.ok) throw new Error(`Drive request failed [${res.status}]: ${await res.text()}`);
  const json = (await res.json()) as { name: string; modifiedTime: string };
  return { name: json.name, modifiedTime: json.modifiedTime };
}

/** Downloads the workbook and returns each tab as header-keyed string rows. */
export async function readTracker(): Promise<
  Array<{ sheet: string; headers: string[]; rows: SheetRow[] }>
> {
  const res = await fetch(
    `${DRIVE_URL}/files/${TRACKER_FILE_ID}?alt=media&supportsAllDrives=true`,
    { headers: driveHeaders() },
  );
  if (!res.ok) throw new Error(`Drive download failed [${res.status}]: ${await res.text()}`);
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  return wb.SheetNames.map((sheet) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet]!, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    });
    // The grid often carries a title banner, so the header row is the first row
    // with several non-empty labelled cells.
    const headerIdx = grid.findIndex(
      (r) => r.filter((c) => String(c ?? "").trim().length > 0).length >= 3,
    );
    if (headerIdx < 0) return { sheet, headers: [], rows: [] };
    const headers = (grid[headerIdx] ?? []).map((c) => String(c ?? "").trim());
    const rows = grid.slice(headerIdx + 1).flatMap((r) => {
      const row: SheetRow = {};
      headers.forEach((h, i) => {
        if (h) row[h] = String(r[i] ?? "").trim();
      });
      return Object.values(row).some((v) => v.length > 0) ? [row] : [];
    });
    return { sheet, headers, rows };
  });
}

/* ------------------------------ Reconciliation ---------------------------- */

/** Cells the team uses to mean "nothing decided yet" — never overwrite with these. */
const EMPTY = /^(|-|—|n\/a|na|tbd|tba|unknown|none)$/i;

function meaningful(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t && !EMPTY.test(t) ? t : null;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * The grid writes dates in prose ("October 14 - 16, 2026", "March 31"), so take
 * the first date mentioned and report whether the year was explicit.
 */
export function parseGridDate(
  text: string | undefined,
  today = new Date(),
): { date: string | null; confident: boolean } {
  const t = meaningful(text);
  if (!t) return { date: null, confident: false };

  const numeric = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    const [, m, d, y] = numeric;
    const year = Number(y!.length === 2 ? `20${y}` : y);
    const iso = `${year}-${String(Number(m)).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
    return Number.isNaN(Date.parse(iso)) ? { date: null, confident: false } : { date: iso, confident: true };
  }

  const named = t
    .toLowerCase()
    .match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:\s*[–—-]\s*\d{1,2})?(?:,?\s*(\d{4}))?/);
  if (named) {
    const monthIdx = MONTHS.findIndex((m) => m.startsWith(named[1]!.slice(0, 3)));
    if (monthIdx >= 0) {
      const day = Number(named[2]);
      const explicit = named[3] ? Number(named[3]) : null;
      // No year in the cell: assume the next occurrence from today.
      let year = explicit ?? today.getUTCFullYear();
      if (!explicit) {
        const candidate = Date.UTC(year, monthIdx, day);
        if (candidate < today.getTime() - 7 * 864e5) year += 1;
      }
      const iso = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return Number.isNaN(Date.parse(iso)) ? { date: null, confident: false } : { date: iso, confident: Boolean(explicit) };
    }
  }
  return { date: null, confident: false };
}

/**
 * The grid's status column is free text ("Reached out, submitted", "Agenda
 * full/ not accepted"), so match it onto the app's status vocabulary by
 * keyword. Anything unrecognised returns null: the sync leaves the stored
 * status alone and reports the wording for a human to map.
 */
export function mapStatus(raw: string | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return null;
  const rules: Array<[RegExp, string]> = [
    [/\bwon\b|winner|awarded/, "won"],
    [/finalist|shortlist/, "finalist"],
    [/not accepted|agenda full|not selected|rejected|declined by/, "not_selected"],
    [/not moving forward|no longer|not pursuing|\bpass(ed|ing)?\b/, "passed"],
    [/we declined|declin/, "declined"],
    [/client review|with client/, "client_review"],
    [/submitted|applied|entry sent/, "submitted"],
    [/reached out|outreach|contacted/, "reached_out"],
    [/in progress|drafting|writing/, "in_progress"],
    [/planning|intend to submit/, "planning_to_submit"],
    [/deadline passed|closed/, "deadline_passed"],
    [/sponsor/, "sponsoring"],
    [/accepted|speaking confirmed/, "accepted"],
    [/submission[s]? open|call for|open for/, "submission_open"],
    [/not (yet )?(open|live)|opens later/, "not_open_yet"],
    [/(information )?not (yet )?available|unknown|tbd/, "information_not_available"],
    [/evaluat|assess|considering|review/, "evaluating"],
    [/monitor|tracking|upcoming|watch/, "monitoring"],
  ];
  for (const [re, value] of rules) if (re.test(t)) return value;
  return null;
}


export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(20\d{2})\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Loose match so "2026 COA Conference" lines up with "COA Conference". */
function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const at = new Set(a.split(" ").filter((w) => w.length > 2));
  const bt = new Set(b.split(" ").filter((w) => w.length > 2));
  if (!at.size || !bt.size) return false;
  let hit = 0;
  at.forEach((w) => {
    if (bt.has(w)) hit++;
  });
  return hit / Math.min(at.size, bt.size) >= 0.85;
}

export type TrackerChange = {
  name: string;
  opportunityId: string | null;
  action: "created" | "updated" | "unchanged";
  fields: Array<{ field: string; from: string | null; to: string | null }>;
};

export type TrackerSyncResult = {
  file: string;
  modifiedTime: string;
  rowsRead: number;
  created: number;
  updated: number;
  unchanged: number;
  unmatchedInApp: string[];
  /** Sheet status wording the app could not map onto a known status. */
  unmappedStatuses: Array<{ name: string; status: string }>;
  changes: TrackerChange[];
  dryRun: boolean;
};

type Mapped = {
  name: string;
  type: "speaking" | "award";
  rawStatus: string | null;
  values: Record<string, string | null>;
};

/** Turns one grid row into the opportunity fields the sheet owns. */
function mapRow(sheet: string, row: SheetRow): Mapped | null {
  const isAward = /award/i.test(sheet);
  const name = meaningful(row["Event Name"] ?? row["Award Name"] ?? row["Name"]);
  if (!name) return null; // section banner rows carry a status but no name

  const deadline = parseGridDate(row["Submission Deadline"]);
  const event = parseGridDate(row["Event Date"]);
  const publish = parseGridDate(row["Publish Date"] ?? row["Announcement Date"]);

  // Merged cells occasionally shift a row across: never take a date-looking
  // cell as a location.
  const locationRaw = meaningful(row["Location"]);
  const location = locationRaw && !parseGridDate(locationRaw).date ? locationRaw : null;

  const values: Record<string, string | null> = {
    status: mapStatus(row["Status"]),
    description: meaningful(row["About"]),
    notes: meaningful(row["Notes"]),
    location,
    final_deadline: deadline.date,
    event_date: event.date,
    announcement_date: publish.date,
    deadline_type: meaningful(row["Submission Deadline"])
      ? deadline.date
        ? deadline.confident
          ? "confirmed"
          : "estimated"
        : /rolling/i.test(row["Submission Deadline"] ?? "")
          ? "rolling"
          : "tbd"
      : null,
  };
  return { name, type: isAward ? "award" : "speaking", rawStatus: meaningful(row["Status"]), values };
}

/** The same event can appear twice in the grid; keep one row, filling gaps. */
function dedupe(rows: Mapped[]): Mapped[] {
  const out = new Map<string, Mapped>();
  for (const r of rows) {
    const key = `${r.type}:${normaliseName(r.name)}`;
    const prev = out.get(key);
    if (!prev) {
      out.set(key, r);
      continue;
    }
    for (const [field, value] of Object.entries(r.values)) {
      if (value !== null) prev.values[field] = value;
    }
    prev.rawStatus = r.rawStatus ?? prev.rawStatus;
  }
  return [...out.values()];
}


/**
 * Cross-checks the Drive grid against the opportunities table. The grid is the
 * source of truth: any cell with a real value overwrites the stored value, new
 * rows are created, and every field-level change is written to the activity log.
 * Rows only in the app are reported, never deleted.
 */
export async function syncTrackerGrid(opts: { dryRun?: boolean } = {}): Promise<TrackerSyncResult> {
  const dryRun = opts.dryRun ?? false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [meta, sheets] = await Promise.all([trackerMeta(), readTracker()]);

  const raw: Mapped[] = [];
  for (const s of sheets) {
    for (const row of s.rows) {
      const m = mapRow(s.sheet, row);
      if (m) raw.push(m);
    }
  }
  const mapped = dedupe(raw);
  const unmappedStatuses = mapped
    .filter((m) => m.rawStatus && m.values["status"] === null)
    .map((m) => ({ name: m.name, status: m.rawStatus! }));


  const { data: existing, error } = await supabaseAdmin
    .from("opportunities")
    .select(
      "id,name,type,status,description,notes,location,final_deadline,event_date,announcement_date,deadline_type",
    );
  if (error) throw new Error(error.message);

  const rows = (existing ?? []) as Array<Record<string, unknown> & { id: string; name: string }>;
  const index = rows.map((r) => ({ row: r, key: normaliseName(r.name) }));
  const matchedIds = new Set<string>();
  const changes: TrackerChange[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const m of mapped) {
    const key = normaliseName(m.name);
    const hit =
      index.find((i) => i.key === key && !matchedIds.has(i.row.id)) ??
      index.find((i) => similar(i.key, key) && !matchedIds.has(i.row.id));

    if (!hit) {
      const insert: Record<string, unknown> = {
        name: m.name,
        type: m.type,
        source: "tracker_grid",
        tier: 2,
        status: m.values["status"] ?? "monitoring",
        deadline_type: m.values["deadline_type"] ?? "tbd",
      };
      for (const [field, value] of Object.entries(m.values)) {
        if (value !== null) insert[field] = value;
      }
      created++;
      let newId: string | null = null;
      if (!dryRun) {
        const { data: ins, error: insErr } = await supabaseAdmin
          .from("opportunities")
          .insert(insert as never)
          .select("id")
          .single();
        if (insErr) throw new Error(`Could not add "${m.name}": ${insErr.message}`);
        newId = (ins as { id: string }).id;
        await supabaseAdmin.from("activity_log").insert({
          entity_type: "opportunity",
          entity_id: newId,
          opportunity_id: newId,
          action: "tracker_sync_created",
          summary: `Added from the Drive tracker: ${m.name}`,
        } as never);
      }
      changes.push({
        name: m.name,
        opportunityId: newId,
        action: "created",
        fields: Object.entries(m.values)
          .filter(([, v]) => v !== null)
          .map(([field, to]) => ({ field, from: null, to })),
      });
      continue;
    }

    matchedIds.add(hit.row.id);
    const diffs: TrackerChange["fields"] = [];
    const patch: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(m.values)) {
      if (value === null) continue; // blank/TBD in the sheet never clears stored data
      const current = hit.row[field] == null ? null : String(hit.row[field]);
      if (current === value) continue;
      // Notes and description in the app may carry appended history — only
      // replace them when the sheet text is not already contained in them.
      if ((field === "notes" || field === "description") && current && current.includes(value))
        continue;
      diffs.push({ field, from: current, to: value });
      patch[field] = value;
    }

    if (!diffs.length) {
      unchanged++;
      changes.push({ name: m.name, opportunityId: hit.row.id, action: "unchanged", fields: [] });
      continue;
    }

    updated++;
    if (!dryRun) {
      const { error: upErr } = await supabaseAdmin
        .from("opportunities")
        .update(patch as never)
        .eq("id", hit.row.id);
      if (upErr) throw new Error(`Could not update "${m.name}": ${upErr.message}`);
      await supabaseAdmin.from("activity_log").insert(
        diffs.map((d) => ({
          entity_type: "opportunity",
          entity_id: hit.row.id,
          opportunity_id: hit.row.id,
          action: "tracker_sync",
          field: d.field,
          old_value: d.from,
          new_value: d.to,
          summary: `${m.name} — updated from the Drive tracker`,
        })) as never,
      );
    }
    changes.push({ name: m.name, opportunityId: hit.row.id, action: "updated", fields: diffs });
  }

  const unmatchedInApp = rows.filter((r) => !matchedIds.has(r.id)).map((r) => r.name);

  return {
    file: meta.name,
    modifiedTime: meta.modifiedTime,
    rowsRead: mapped.length,
    created,
    updated,
    unchanged,
    unmatchedInApp,
    unmappedStatuses,

    changes,
    dryRun,
  };
}
