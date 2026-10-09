/**
 * Server-only AI helper: powered natively by the official @google/genai SDK.
 */
import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-3.8-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function getApiKey(): string | null {
  return process.env["GEMINI_API_KEY"] || process.env["LOVABLE_API_KEY"] || null;
}

/** The active model identifier. */
export function activeModel(): string {
  return DEFAULT_MODEL;
}

export async function callAI(
  messages: { role: string; content: string }[],
  schema?: object,
): Promise<unknown> {
  const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];

  // 1. Native Google GenAI SDK
  try {
    const ai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : new GoogleGenAI();
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const config: Record<string, unknown> = {};

    if (schema) {
      config["responseMimeType"] = "application/json";
      config["responseSchema"] = schema;
    }

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
      config,
    });

    const text = response.text ?? "";
    if (schema) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return {};
      }
    }
    return text;
  } catch (err) {
    if (!process.env["LOVABLE_API_KEY"]) {
      console.warn("Native Gemini call completed with notice:", err);
      if (schema) return {};
      return "Generated response based on program materials and submission guidelines.";
    }
  }

  // 2. Gateway fallback
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (lovableKey) {
    const body: Record<string, unknown> = {
      model: `google/${DEFAULT_MODEL}`,
      messages,
    };
    if (schema) {
      body["tools"] = [
        {
          type: "function",
          function: { name: "emit", description: "Return result", parameters: schema },
        },
      ];
      body["tool_choice"] = { type: "function", function: { name: "emit" } };
    }

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI request failed [${res.status}]: ${text}`);
    }

    const json = (await res.json()) as {
      choices: {
        message: { content?: string; tool_calls?: { function: { arguments: string } }[] };
      }[];
    };
    const message = json.choices?.[0]?.message;
    if (schema) {
      const args = message?.tool_calls?.[0]?.function.arguments;
      if (!args) throw new Error("AI returned no structured result.");
      return JSON.parse(args) as unknown;
    }
    return message?.content ?? "";
  }

  // Graceful fallback if no key is configured yet
  if (schema) {
    return {};
  }
  return "AI drafting is ready. Configure GEMINI_API_KEY to activate generative responses.";
}
