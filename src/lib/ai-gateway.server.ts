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
 *    GEMINI_API_KEY / GOOGLE_API_KEY when the host provides one) calls the
 *    Gemini API directly.
 * 2. On Cloud Run with no key: Vertex AI in the app's own Google Cloud
 *    project, authenticated as the service's account and billed to that
 *    project's pay-as-you-go billing. No key exists to leak or run dry.
 *    Needs the Vertex AI API enabled and roles/aiplatform.user on the runtime
 *    service account. GEMINI_DISABLE_VERTEX=1 skips this route.
 * 3. Otherwise AI Studio's key proxy on localhost, which injects AI Studio's
 *    own key (and spends AI Studio's prepaid credits). GEMINI_PROXY_URL
 *    overrides the address; GEMINI_DISABLE_PROXY=1 skips it.
 */
type Route = "direct" | "vertex" | "ai-studio-proxy";
type Connection =
  | { route: "direct"; key: string }
  | { route: "vertex"; project: string; location: string }
  | { route: "ai-studio-proxy"; key: string; baseUrl: string };

function envKey(): string | undefined {
  return (
    process.env["GEMINI_SERVER_API_KEY"] ||
    process.env["GEMINI_API_KEY"] ||
    process.env["GOOGLE_API_KEY"] ||
    undefined
  );
}

function vertexWanted(): boolean {
  if (process.env["GEMINI_DISABLE_VERTEX"] === "1") return false;
  return process.env["GEMINI_USE_VERTEX"] === "1" || Boolean(process.env["K_SERVICE"]);
}

let cachedProject: string | null = null;
async function cloudProject(): Promise<string> {
  const fromEnv = process.env["GOOGLE_CLOUD_PROJECT"]?.trim();
  if (fromEnv) return fromEnv;
  if (cachedProject) return cachedProject;
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/project/project-id",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(2000) },
    );
    if (!res.ok) throw new Error(`metadata ${res.status}`);
    cachedProject = (await res.text()).trim();
    return cachedProject;
  } catch (err) {
    console.error("[ai] could not read the Cloud project id", err);
    throw new AIError(
      "AI is not configured: could not find the Google Cloud project for Vertex AI.",
      "not_configured",
    );
  }
}

async function connection(): Promise<Connection> {
  const key = envKey();
  if (key) return { route: "direct", key };
  if (vertexWanted()) {
    return {
      route: "vertex",
      project: await cloudProject(),
      location: process.env["GOOGLE_CLOUD_LOCATION"]?.trim() || "global",
    };
  }
  if (process.env["GEMINI_DISABLE_PROXY"] === "1") {
    throw new AIError(
      "AI is not configured: set the GEMINI_SERVER_API_KEY secret.",
      "not_configured",
    );
  }
  const baseUrl = process.env["GEMINI_PROXY_URL"]?.trim() || "http://127.0.0.1:3001/api-proxy";
  // The proxy replaces this placeholder with the real key.
  return { route: "ai-studio-proxy", key: "ai-studio-proxy", baseUrl };
}

let client: { id: string; ai: GoogleGenAI; route: Route } | null = null;
async function genai(): Promise<{ ai: GoogleGenAI; route: Route }> {
  const c = await connection();
  const id = c.route === "vertex" ? `vertex:${c.project}:${c.location}` : `${c.route}:${c.key}`;
  if (!client || client.id !== id) {
    const ai =
      c.route === "vertex"
        ? new GoogleGenAI({ vertexai: true, project: c.project, location: c.location })
        : new GoogleGenAI({
            apiKey: c.key,
            ...(c.route === "ai-studio-proxy" ? { httpOptions: { baseUrl: c.baseUrl } } : {}),
          });
    client = { id, ai, route: c.route };
  }
  return { ai: client.ai, route: client.route };
}

/** Which route AI calls take, for logs and the settings page. Never the key. */
export function aiRoute(): Route {
  if (envKey()) return "direct";
  if (vertexWanted()) return "vertex";
  return "ai-studio-proxy";
}

/** Short, user-safe description of an SDK error; full detail goes to the log. */
export function describeAIError(err: unknown, model = activeModel()): string {
  const raw = err instanceof Error ? err.message : String(err);
  const status = /"code"\s*:\s*(\d{3})/.exec(raw)?.[1] ?? /\b([45]\d\d)\b/.exec(raw)?.[1];
  if (status === "404") return `the model "${model}" was not found`;
  if (status === "402" || /prepayment credits are depleted/i.test(raw))
    return "the AI credits for this app are used up; an admin needs to add credits or billing in Google AI Studio";
  if (status === "429") return "the AI quota or rate limit was hit; try again in a minute";
  if (status === "401" || status === "403")
    return /aiplatform|Vertex AI API|IAM_PERMISSION_DENIED|SERVICE_DISABLED/i.test(raw)
      ? "Vertex AI is not enabled for this app's Google Cloud project, or the app's service account lacks access"
      : "the AI key was rejected";
  if (/ECONNREFUSED|fetch failed/i.test(raw)) return "the AI proxy could not be reached";
  if (status && status.startsWith("5")) return "the AI service had an outage; try again";
  return raw.slice(0, 200);
}

export async function callAI(
  messages: { role: string; content: string }[],
  schema?: object,
): Promise<unknown> {
  const { ai, route } = await genai();
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
    console.error("[ai] generateContent failed", { model, route, err });
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
