/** Server-only: pull application questions out of a CFP page or pasted text. */

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export type ExtractedQuestion = {
  prompt: string;
  word_limit: number | null;
  char_limit: number | null;
  note: string | null;
};

const schema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      description: "Every distinct question or required narrative field in the application",
      items: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The question exactly as the application words it",
          },
          word_limit: { type: "number", description: "Word limit if stated, otherwise omit" },
          char_limit: { type: "number", description: "Character limit if stated, otherwise omit" },
          note: { type: "string", description: "Short note: required/optional, section, guidance" },
        },
        required: ["prompt"],
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

export async function extractQuestionsFrom(input: {
  url?: string;
  text?: string;
}): Promise<ExtractedQuestion[]> {
  let body = (input.text ?? "").trim();

  if (!body && input.url) {
    const res = await fetch(input.url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ThymeCareProgramMonitor/1.0; +https://lovable.dev) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`That page returned HTTP ${res.status}`);
    body = stripHtml(await res.text());
  }

  body = body.slice(0, 28_000);
  if (body.length < 60) throw new Error("There was not enough text to read questions from.");

  const { callAI } = await import("@/lib/ai-gateway.server");
  const raw = (await callAI(
    [
      {
        role: "system",
        content:
          "You extract the application questions from award and speaking-opportunity submission forms for a healthcare technology company's communications team. Return each question as the application words it. Never invent questions that are not present. Only record a word or character limit when the source states one. Ignore navigation, marketing copy, eligibility prose and fee tables — capture only fields the applicant must write an answer for.",
      },
      { role: "user", content: body },
    ],
    schema as unknown as object,
  )) as { questions?: unknown[] };

  const list = Array.isArray(raw?.questions) ? raw.questions : [];
  return list
    .map((q) => {
      const item = q as Record<string, unknown>;
      const prompt = typeof item["prompt"] === "string" ? item["prompt"].trim().slice(0, 1200) : "";
      return {
        prompt,
        word_limit: num(item["word_limit"]),
        char_limit: num(item["char_limit"]),
        note: typeof item["note"] === "string" ? item["note"].trim().slice(0, 300) : null,
      };
    })
    .filter((q) => q.prompt.length > 5)
    .slice(0, 40);
}
