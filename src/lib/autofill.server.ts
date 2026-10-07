/** Server-only: read an opportunity page and extract structured fields. */

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

export type AutofillResult = {
  name: string;
  organizer: string;
  type: "award" | "speaking";
  category: string;
  description: string;
  region: string;
  location: string;
  audience: string;
  application_url: string;
  open_date: string;
  early_deadline: string;
  final_deadline: string;
  event_date: string;
  announcement_date: string;
  deadline_type: "confirmed" | "estimated" | "rolling" | "unknown";
  notes: string;
};

const schema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Official program / award / conference name" },
    organizer: { type: "string", description: "Publisher or organizing body" },
    type: { type: "string", enum: ["award", "speaking"] },
    category: { type: "string", description: "Award category or track, if stated" },
    description: { type: "string", description: "2-3 sentence summary of the program" },
    region: { type: "string" },
    location: { type: "string" },
    audience: { type: "string" },
    application_url: { type: "string", description: "Direct submission/apply URL if stated" },
    open_date: { type: "string", description: "YYYY-MM-DD or empty" },
    early_deadline: { type: "string", description: "YYYY-MM-DD or empty" },
    final_deadline: { type: "string", description: "YYYY-MM-DD or empty" },
    event_date: { type: "string", description: "YYYY-MM-DD or empty" },
    announcement_date: { type: "string", description: "YYYY-MM-DD or empty" },
    deadline_type: { type: "string", enum: ["confirmed", "estimated", "rolling", "unknown"] },
    notes: { type: "string", description: "Fees, eligibility, required materials — short" },
  },
  required: ["name", "type", "deadline_type"],
  additionalProperties: false,
} as const;

const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 2000) : "");

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchPageText(url: string): Promise<string> {
  // 1) Direct fetch with browser-like headers.
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      const text = stripHtml(await res.text()).slice(0, 24_000);
      if (text.length >= 120) return text;
    }
  } catch {
    /* fall through to reader proxy */
  }

  // 2) Many sites block server fetches (403/bot walls) — retry via a text reader proxy.
  try {
    const proxied = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/plain" },
      signal: AbortSignal.timeout(25_000),
    });
    if (proxied.ok) {
      const text = stripHtml(await proxied.text()).slice(0, 24_000);
      if (text.length >= 120) return text;
    }
  } catch {
    /* handled below */
  }

  throw new Error(
    "That page couldn't be read automatically (the site blocks automated access). Paste the details or try the direct application URL.",
  );
}

export async function autofillFromUrl(url: string): Promise<AutofillResult> {
  const text = await fetchPageText(url);

  const { callAI } = await import("@/lib/ai-gateway.server");
  const raw = (await callAI(
    [
      {
        role: "system",
        content:
          "You extract structured details about awards, rankings and speaking/conference opportunities for a healthcare technology company's communications team. Use only facts stated on the page. Never invent or infer dates — leave a date empty unless it is written on the page. Dates must be YYYY-MM-DD. Today is " +
          new Date().toISOString().slice(0, 10) +
          ". Use type 'speaking' for conferences, calls for speakers and panels; 'award' for awards, rankings and recognition lists.",
      },
      { role: "user", content: `Source URL: ${url}\n\nPage content:\n${text}` },
    ],
    schema as unknown as object,
  )) as Record<string, unknown>;

  const type = raw["type"] === "speaking" ? "speaking" : "award";
  const dt = str(raw["deadline_type"]);
  return {
    name: str(raw["name"]),
    organizer: str(raw["organizer"]),
    type,
    category: str(raw["category"]),
    description: str(raw["description"]),
    region: str(raw["region"]),
    location: str(raw["location"]),
    audience: str(raw["audience"]),
    application_url: str(raw["application_url"]),
    open_date: iso(raw["open_date"]),
    early_deadline: iso(raw["early_deadline"]),
    final_deadline: iso(raw["final_deadline"]),
    event_date: iso(raw["event_date"]),
    announcement_date: iso(raw["announcement_date"]),
    deadline_type: (["confirmed", "estimated", "rolling", "unknown"].includes(dt)
      ? dt
      : "estimated") as AutofillResult["deadline_type"],
    notes: str(raw["notes"]),
  };
}
