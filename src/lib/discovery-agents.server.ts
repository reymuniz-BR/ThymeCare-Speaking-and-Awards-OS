/**
 * Discovery research swarm.
 *
 * Instead of one broad AI query, discovery fans the brief out to a team of
 * specialist research subagents that each cover a different slice of the
 * healthcare-technology recognition landscape, then merges their findings.
 * This maximises breadth: each agent only has to be deep in its own lane.
 */

import { callAI } from "@/lib/ai-gateway.server";

export type Candidate = {
  name: string;
  organizer?: string;
  type: string;
  region?: string;
  description: string;
  event_date?: string;
  estimated_deadline?: string;
  application_url?: string;
  source_url?: string;
  categories?: string[];
  relevance_score: number;
  rationale: string;
  confidence?: string;
  agent?: string;
};

const candidateSchema = {
  type: "object",
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Official program or conference name" },
          organizer: {
            type: "string",
            description: "Publication, association or company running it",
          },
          type: { type: "string", enum: ["award", "speaking", "conference", "recognition"] },
          region: { type: "string" },
          description: { type: "string", description: "What the program recognizes or programs" },
          event_date: { type: "string", description: "YYYY-MM-DD if known, else empty" },
          estimated_deadline: {
            type: "string",
            description: "Submission deadline, YYYY-MM-DD if known, else empty",
          },
          application_url: { type: "string", description: "Direct submission / nomination page" },
          source_url: { type: "string", description: "Program or conference homepage" },
          categories: {
            type: "array",
            items: { type: "string" },
            description: "Relevant focus areas from the client's priority list",
          },
          relevance_score: { type: "number", description: "0-100 strategic fit" },
          rationale: { type: "string", description: "Why this may fit this client" },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description: "Confidence that the program exists as described",
          },
        },
        required: ["name", "type", "description", "relevance_score", "rationale", "confidence"],
      },
    },
  },
  required: ["opportunities"],
};

/** The specialist research agents. Each owns one lane of the landscape. */
export const DISCOVERY_AGENTS: { id: string; label: string; beat: string }[] = [
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

async function runAgent(
  agent: { id: string; label: string; beat: string },
  args: { brief: string; focus: string[]; existingNames: string[]; today: string },
): Promise<Candidate[]> {
  const result = (await callAI(
    [
      {
        role: "system",
        content: [
          `You are the "${agent.label}" specialist on a research team supporting a healthcare technology company's PR and communications team.`,
          `Your beat: ${agent.beat}`,
          "Stay inside your beat — teammates cover the other lanes, so do not return generic results outside your specialty.",
          "Only return real programs run by credible organizations. Never invent a program, an organizer or a URL.",
          "If you are unsure a program still runs, still return it but set confidence to low and leave unknown dates empty rather than guessing.",
          "Score relevance 0-100 against the client's focus areas and explain the fit in one specific sentence.",
        ].join(" "),
      },
      {
        role: "user",
        content: `Today is ${args.today}.\n\nSearch brief: ${args.brief}\n\nClient focus areas: ${args.focus.join(
          ", ",
        )}\n\nAlready tracked (do not repeat, including different years of the same program): ${
          args.existingNames.join("; ") || "none"
        }\n\nReturn up to 8 candidates from your beat, most relevant first. Prefer programs with upcoming or recurring deadlines.`,
      },
    ],
    candidateSchema,
  )) as { opportunities?: Candidate[] };

  return (result.opportunities ?? []).map((o) => ({ ...o, agent: agent.label }));
}

/**
 * Runs every specialist agent in parallel and returns the combined candidate
 * pool. A failing agent never fails the whole run.
 */
export async function runDiscoverySwarm(args: {
  brief: string;
  focus: string[];
  existingNames: string[];
}): Promise<{ candidates: Candidate[]; agentsRun: number; agentsFailed: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const settled = await Promise.allSettled(
    DISCOVERY_AGENTS.map((a) => runAgent(a, { ...args, today })),
  );

  const candidates: Candidate[] = [];
  let agentsFailed = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") candidates.push(...r.value);
    else agentsFailed += 1;
  }

  // Every agent failing means the gateway itself is down — surface that.
  if (agentsFailed === settled.length) {
    const first = settled[0];
    const reason =
      first && first.status === "rejected"
        ? String((first.reason as Error)?.message ?? first.reason)
        : "unknown error";
    throw new Error(`Discovery research failed: ${reason}`);
  }

  candidates.sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
  return { candidates, agentsRun: settled.length - agentsFailed, agentsFailed };
}
