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

function apiKey(): string {
  const key = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
  if (!key) {
    throw new AIError(
      "AI is not configured: the GEMINI_API_KEY secret is missing.",
      "not_configured",
    );
  }
  return key;
}

let client: { key: string; ai: GoogleGenAI } | null = null;
function genai(): GoogleGenAI {
  const key = apiKey();
  if (!client || client.key !== key) client = { key, ai: new GoogleGenAI({ apiKey: key }) };
  return client.ai;
}

/** Short, user-safe description of an SDK error; full detail goes to the log. */
export function describeAIError(err: unknown, model = activeModel()): string {
  const raw = err instanceof Error ? err.message : String(err);
  const status = /"code"\s*:\s*(\d{3})/.exec(raw)?.[1] ?? /\b([45]\d\d)\b/.exec(raw)?.[1];
  if (status === "404") return `the model "${model}" was not found`;
  if (status === "429") return "the AI quota or rate limit was hit; try again in a minute";
  if (status === "401" || status === "403") return "the AI key was rejected";
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
    console.error("[ai] generateContent failed", { model, err });
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
