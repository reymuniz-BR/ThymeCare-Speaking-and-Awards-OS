/**
 * Workspace configuration: everything that used to be hard-coded for one
 * client. Phase 1 of multi-client support: one workspace, resolved from
 * defaults, so behaviour is identical. Later phases load it per workspace
 * from Firestore (`workspaces/{id}`) and pass it explicitly.
 */

export type DiscoveryBeat = { id: string; label: string; beat: string };

export type WorkspaceConfig = {
  id: string;
  /**
   * How AI prompts describe the client, as a noun phrase that reads after
   * "a"/"an" is stripped, e.g. "healthcare technology company".
   */
  companyKind: string;
  /** Who is usually an external co-presenter, for the speakers form. */
  partnerExample: string;
  drive: {
    /** Content Library folder (and subfolders). */
    rootFolderId: string;
    /** Google Doc with approved company messaging. */
    messagingDocId: string;
    /** Spreadsheet the tracker sync reads. */
    trackerFileId: string;
  };
  /** Domain-ish suffix for calendar event UIDs. Never change once in use. */
  calendarUidDomain: string;
  discovery: {
    focusAreas: string[];
    beats: DiscoveryBeat[];
    presets: { label: string; brief: string }[];
    weeklyBriefs: string[];
    /** Short description used in the Discover page meta description. */
    domainLabel: string;
  };
};

export const DEFAULT_FOCUS_AREAS: string[] = [
  "healthcare",
  "digital health",
  "health technology",
  "health tech innovation",
  "value-based care",
  "oncology / cancer care",
  "healthcare AI",
  "healthcare leadership",
  "healthcare finance",
  "employer healthcare",
  "health plans / payers",
  "care delivery",
  "startups and growth companies",
  "technology innovation",
  "executive leadership",
];

export const DEFAULT_DISCOVERY_BEATS: DiscoveryBeat[] = [
  {
    id: "awards",
    label: "Awards & rankings",
    beat: "National and industry award programs, best-in-class product awards, innovation awards and company rankings run by established publications, analyst firms and awards bodies (e.g. Fast Company, Fierce, Digital Health, MedTech Breakthrough, Inc., Deloitte).",
  },
  {
    id: "conferences",
    label: "Conferences & calls for speakers",
    beat: "Healthcare, health-tech, payer, provider and oncology conferences with open calls for speakers, panel submissions, abstract deadlines or programming committees (e.g. HLTH, ViVE, HIMSS, AHIP, ASCO-adjacent, NAACOS).",
  },
  {
    id: "executive",
    label: "Executive & leadership recognition",
    beat: "Individual executive honors: leadership lists, women-in-health-IT lists, 40-under-40, chief-officer awards, board and fellowship nominations, and personal recognition programs relevant to senior healthcare leaders.",
  },
  {
    id: "growth",
    label: "Growth, workplace & culture lists",
    beat: "Fast-growth and workplace recognition: Inc. 5000, Deloitte Fast 500, Best Places to Work, Great Place to Work, regional business-journal fastest-growing and top-workplace programs.",
  },
  {
    id: "clinical",
    label: "Clinical, payer & policy programs",
    beat: "Associations, payer/provider bodies, value-based care, oncology care and policy organizations running recognition programs, case-study calls, quality awards and speaking slots at member meetings.",
  },
  {
    id: "regional",
    label: "Regional & niche media",
    beat: "Regional business journals, state healthcare associations, city-level tech and healthcare awards, and niche trade media programs that broader searches usually miss.",
  },
];

const DEFAULT_WORKSPACE: WorkspaceConfig = {
  id: "default",
  companyKind: "healthcare technology company",
  partnerExample: "Partner health plan",
  drive: {
    rootFolderId: "1NYiV7rYlEB2-ccPaFJf8XvPkjP2h-cYc",
    messagingDocId: "1oCDR8IvkKXs4bFU3y0U9eh10VBkXndIabZkaw8pVQ3Q",
    trackerFileId: "1lr4-FbpgLjQOkjtQJz2w1A_qIb-DRdrI",
  },
  calendarUidDomain: "podium-awards-os",
  discovery: {
    focusAreas: DEFAULT_FOCUS_AREAS,
    beats: DEFAULT_DISCOVERY_BEATS,
    presets: [
      {
        label: "Awards & rankings",
        brief:
          "Healthcare, digital health and health technology company awards, innovation awards and industry rankings with submission deadlines in the next 9 months.",
      },
      {
        label: "Calls for speakers",
        brief:
          "Open calls for speakers, speaker nominations and conference programming opportunities at US healthcare, payer, provider and digital health conferences.",
      },
      {
        label: "Executive & leadership lists",
        brief:
          "Executive awards, healthcare leadership lists and 'most influential' rankings recognizing individual healthcare technology executives.",
      },
      {
        label: "Fast-growth lists",
        brief:
          "Fast-growth and high-performing company lists open to venture-backed healthcare technology and value-based care companies.",
      },
      {
        label: "Oncology & value-based care",
        brief:
          "Awards, rankings and speaking opportunities focused on oncology and cancer care, value-based care and employer healthcare innovation.",
      },
    ],
    weeklyBriefs: [
      "Healthcare, digital health and health technology company awards, innovation awards and industry rankings with submission deadlines in the next 9 months.",
      "Open calls for speakers, speaker nominations and conference programming opportunities at US healthcare, payer, provider and digital health conferences.",
      "Executive awards, healthcare leadership lists and 'most influential' rankings recognizing individual healthcare technology executives.",
      "Fast-growth, workplace and high-performing company lists open to venture-backed healthcare technology and value-based care companies.",
      "Awards, rankings and speaking opportunities focused on oncology and cancer care, value-based care and employer healthcare innovation.",
      "Regional business journal, state healthcare association and niche trade-media award and speaking programs relevant to a US healthcare technology company.",
      "Association, payer, provider and policy-body recognition programs, quality awards and member-meeting speaking slots in healthcare.",
    ],
    domainLabel: "healthcare technology",
  },
};

export const DEFAULT_WORKSPACE_ID = DEFAULT_WORKSPACE.id;

/** The active workspace. Phase 1: always the single configured client. */
export function workspaceConfig(): WorkspaceConfig {
  return DEFAULT_WORKSPACE;
}

/** The product itself. Clients are workspaces inside it, never the brand. */
export const PRODUCT = {
  name: "Podium",
  tagline: "Speaking & awards pipeline",
  monogram: "P",
} as const;

/** "Opportunities — Podium" */
export function pageTitle(page: string): string {
  return `${page} — ${PRODUCT.name}`;
}

/** The product name, "Podium". */
export function productName(): string {
  return PRODUCT.name;
}

/** "a healthcare technology company" with the right article. */
export function aCompany(ws: WorkspaceConfig = workspaceConfig()): string {
  return `${/^[aeiou]/i.test(ws.companyKind) ? "an" : "a"} ${ws.companyKind}`;
}

export function messagingDocUrl(ws: WorkspaceConfig = workspaceConfig()): string {
  return `https://docs.google.com/document/d/${ws.drive.messagingDocId}/edit`;
}
