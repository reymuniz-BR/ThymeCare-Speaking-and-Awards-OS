/** Client approval workflow + program budget maths shared by the grid and dashboard. */
import { bestDeadline, isClosed } from "@/lib/opportunity-view";
import { formatDate } from "@/lib/program";

export const CLIENT_APPROVALS = [
  { value: "needs_approval", label: "Needs approval" },
  { value: "proposed", label: "Proposed to client" },
  { value: "approved", label: "Client approved" },
  { value: "declined", label: "Client declined" },
] as const;

export type ClientApproval = (typeof CLIENT_APPROVALS)[number]["value"];

export const CLIENT_APPROVAL_LABEL: Record<string, string> = Object.fromEntries(
  CLIENT_APPROVALS.map((a) => [a.value, a.label]),
);

export function approvalTone(value: string | null | undefined): "ok" | "info" | "warn" | "danger" {
  switch (value) {
    case "approved":
      return "ok";
    case "proposed":
      return "info";
    case "declined":
      return "danger";
    default:
      return "warn";
  }
}

type BudgetRow = {
  status: string;
  client_approval?: string | null;
};

/** Counts how much of the live program is still waiting on client sign-off. */
export function budgetSummary(rows: BudgetRow[]) {
  const awaiting = rows.filter(
    (r) => (r.client_approval ?? "needs_approval") !== "approved" && !isClosed(r.status),
  );
  return { awaitingCount: awaiting.length };
}


type CsvRow = {
  name: string;
  type: string;
  organizer: string | null;
  status: string;
  application_stage?: string | null;
  client_approval?: string | null;
  tier: number | null;
  owner_name: string | null;
  final_deadline: string | null;
  early_deadline: string | null;
  event_date: string | null;
  url: string | null;
  application_url: string | null;
};

const CSV_HEADERS = [
  "Opportunity",
  "Type",
  "Organization",
  "Status",
  "Application",
  "Client approval",
  "Tier",
  "Owner",
  "Deadline",
  "Event date",
  "Link",
];

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function opportunitiesToCsv(rows: CsvRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.type,
        r.organizer,
        r.status,
        r.application_stage ?? "",
        CLIENT_APPROVAL_LABEL[r.client_approval ?? "needs_approval"] ?? "",
        r.tier ?? "",
        r.owner_name ?? "",
        formatDate(bestDeadline(r)),
        formatDate(r.event_date),
        r.application_url ?? r.url ?? "",
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/** Triggers a browser download of the given CSV text. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
