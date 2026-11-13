/**
 * Server-only AI helper, on the official @google/genai SDK.
 *
 * Every failure throws an AIError with a message safe to show a user. Nothing
 * is stubbed: an empty or placeholder result used to look like "the AI found
 * nothing", which hid a broken model call behind every AI feature.
 */
import { GoogleGenAI } from "@google/genai";

/**
 * `gemini-flash-latest` is Google's maintained alias for the current Flash
 * model, so the app does not break when a dated model id is retired. Pin a
 * specific id with the GEMINI_MODEL secret when a feature needs stability.
 */
const DEFAULT_MODEL = "gemini-flash-latest";

export type AIErrorKind = "not_configured" | "request_failed" | "bad_output";

export class AIError extends Error {
  readonly kind: AIErrorKind;
  constructor(message: string, kind: AIErrorKind) {
    super(message);
    this.name = "AIError";
    this.kind = kind;
  }
}

/** The active model identifier. */
export function activeModel(): string {
  return process.env["GEMINI_MODEL"]?.trim() || DEFAULT_MODEL;
}

/**
 * Where Gemini calls go.
 *
 * 1. A key in the app's own environment (GEMINI_SERVER_API_KEY, or
 *    GEMINI_API_KEY when the host provides it to the server) calls Google
 *    directly.
 * 2. On a Google AI Studio deployment the key lives only in AI Studio's proxy
 *    container, which shares the instance's localhost and injects the key on
 *    /api-proxy/**. The app container never sees it, so with no key we route
 *    through that proxy. GEMINI_PROXY_URL overrides the address.
 */
function connection(): { key: string; baseUrl?: string } {
  const key =
    process.env["GEMINI_SERVER_API_KEY"] ||
    process.env["GEMINI_API_KEY"] ||
    process.env["GOOGLE_API_KEY"];
  if (key) return { key };
  const proxy = process.env["GEMINI_PROXY_URL"]?.trim() || "http://127.0.0.1:3001/api-proxy";
  if (process.env["GEMINI_DISABLE_PROXY"] === "1") {
    throw new AIError(
      "AI is not configured: set the GEMINI_SERVER_API_KEY secret.",
      "not_configured",
    );
  }
  // The proxy replaces this placeholder with the real key.
  return { key: "ai-studio-proxy", baseUrl: proxy };
}

let client: { id: string; ai: GoogleGenAI } | null = null;
function genai(): GoogleGenAI {
  const { key, baseUrl } = connection();
  const id = `${baseUrl ?? "direct"}:${key}`;
  if (!client || client.id !== id) {
    client = {
      id,
      ai: new GoogleGenAI({ apiKey: key, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) }),
    };
  }
  return client.ai;
}

/** Which route AI calls take, for logs and the settings page. Never the key. */
export function aiRoute(): "direct" | "ai-studio-proxy" {
  return connection().baseUrl ? "ai-studio-proxy" : "direct";
}

/** Short, user-safe description of an SDK error; full detail goes to the log. */
export function describeAIError(err: unknown, model = activeModel()): string {
  const raw = err instanceof Error ? err.message : String(err);
  const status = /"code"\s*:\s*(\d{3})/.exec(raw)?.[1] ?? /\b([45]\d\d)\b/.exec(raw)?.[1];
  if (status === "404") return `the model "${model}" was not found`;
  if (status === "429") return "the AI quota or rate limit was hit; try again in a minute";
  if (status === "401" || status === "403") return "the AI key was rejected";
  if (/ECONNREFUSED|fetch failed/i.test(raw)) return "the AI proxy could not be reached";
  if (status && status.startsWith("5")) return "the AI service had an outage; try again";
  return raw.slice(0, 200);
}

export async function callAI(
  messages: { role: string; content: string }[],
  schema?: object,
): Promise<unknown> {
  const ai = genai();
  const model = activeModel();
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const prompt = messages
    .filter((m) => m.role !== "system")
    .map((m) => (m.role === "user" ? m.content : `${m.role}: ${m.content}`))
    .join("\n\n");

  const config: Record<string, unknown> = {};
  if (system) config["systemInstruction"] = system;
  if (schema) {
    config["responseMimeType"] = "application/json";
    // responseJsonSchema takes standard JSON Schema (additionalProperties,
    // enums, etc.); the older responseSchema rejects parts of it.
    config["responseJsonSchema"] = schema;
  }

  let text: string;
  try {
    const response = await ai.models.generateContent({ model, contents: prompt, config });
    text = response.text ?? "";
  } catch (err) {
    console.error("[ai] generateContent failed", { model, route: aiRoute(), err });
    throw new AIError(`AI request failed: ${describeAIError(err, model)}.`, "request_failed");
  }

  if (!schema) {
    if (!text.trim()) throw new AIError("The AI returned an empty response.", "bad_output");
    return text;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.error("[ai] unparseable JSON", { model, text: text.slice(0, 500) });
    throw new AIError("The AI returned a malformed result. Try again.", "bad_output");
  }
}
