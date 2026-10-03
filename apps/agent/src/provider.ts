import { config } from "./config.js";

export type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

const jsonFence = /\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i;

export const chat = async (messages: ChatMessage[]): Promise<string> => {
  if (!config.apiKey || !config.model) {
    throw new Error("LLM_API_KEY and LLM_MODEL are required for model-backed planning.");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned no message content.");
  return content;
};

export const extractJson = <T>(text: string): T => {
  const match = text.match(jsonFence);
  const cleaned = match?.[1] ?? text;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object found in model output.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
};
