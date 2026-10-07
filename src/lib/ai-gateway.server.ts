/** Server-only AI helper: runs every call through the built-in AI gateway. */

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const GATEWAY_MODEL = "google/gemini-3.6-flash";

function resolveProvider() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this workspace.");
  return { url: GATEWAY, key, model: GATEWAY_MODEL, label: GATEWAY_MODEL };
}

/** The model string used for AI calls. */
export function activeModel(): string {
  return GATEWAY_MODEL;
}

export async function callAI(
  messages: { role: string; content: string }[],
  schema?: object,
): Promise<unknown> {
  const provider = resolveProvider();

  const body: Record<string, unknown> = { model: provider.model, messages };
  if (schema) {
    body["tools"] = [
      {
        type: "function",
        function: { name: "emit", description: "Return result", parameters: schema },
      },
    ];
    body["tool_choice"] = { type: "function", function: { name: "emit" } };
  }

  const res = await fetch(provider.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.key}` },
    body: JSON.stringify(body),
  });

  if (res.status === 401)
    throw new Error("AI request was rejected — check the workspace AI configuration.");
  if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
  if (res.status === 402)
    throw new Error("AI credits exhausted. Add credits in workspace settings to continue.");
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
