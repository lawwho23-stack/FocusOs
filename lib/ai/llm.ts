import { OpenRouter } from "@openrouter/sdk";

// Shared OpenRouter access for the coach's helper calls (memory extraction,
// chat summaries, embeddings). One key (OPENROUTER_API_KEY) pays for all.

export const DEFAULT_WRITER = "deepseek/deepseek-v4-flash-0731";

export function openRouter() {
  return new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    appTitle: "FocusOS",
  });
}

// One short, non-streamed answer as plain text. No thinking step: these
// helper jobs are small and must stay fast.
export async function askModel(opts: {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
}): Promise<string> {
  const res = await openRouter().chat.send({
    chatRequest: {
      model: process.env.COACH_MODEL || DEFAULT_WRITER,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      ...(opts.json ? { responseFormat: { type: "json_object" as const } } : {}),
      reasoning: { effort: "none" },
      provider: { sort: "throughput" },
      maxTokens: opts.maxTokens ?? 1500,
      temperature: 0.2,
      stream: false,
    },
  });
  if (!("choices" in res)) throw new Error("Unexpected streamed response.");
  const content = res.choices[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : (content ?? [])
          .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
          .join("");
  return text.trim();
}

// Models sometimes wrap JSON in ```json fences or add a sentence around it.
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
