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

export interface ChatResult {
  content: string;
  reasoningTokens?: number;
  model: string;
}

const jsonFence = /```(?:json)?\s*([\s\S]*?)\s*```/i;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error: unknown) => {
  const candidate = error as { statusCode?: number; status?: number; code?: number; error?: { code?: number } };
  const status = candidate?.statusCode ?? candidate?.status ?? candidate?.error?.code;
  return status === 429 || status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
};

const models = () => Array.from(new Set([config.model, ...config.fallbackModels].filter(Boolean)));

const sendCompletion = async (model: string, messages: ChatMessage[]): Promise<ChatResult> => {
  const response = await fetch(config.baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + config.apiKey,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:8787",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Figma Design Agent",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 1000);
    const error = new Error("OpenRouter request failed (" + response.status + ") for " + model + ": " + details) as Error & { statusCode: number };
    error.statusCode = response.status;
    throw error;
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    model?: string;
    usage?: { completion_tokens_details?: { reasoning_tokens?: number }; completionTokensDetails?: { reasoningTokens?: number } };
    error?: { message?: string };
  };

  const raw = payload.choices?.[0]?.message?.content;
  const content = typeof raw === "string"
    ? raw
    : Array.isArray(raw)
      ? raw.map((part) => part.text ?? "").join("")
      : "";

  if (!content) {
    throw new Error(payload.error?.message ?? "OpenRouter returned no text content for " + model + ".");
  }

  const reasoningTokens = payload.usage?.completion_tokens_details?.reasoning_tokens
    ?? payload.usage?.completionTokensDetails?.reasoningTokens;

  return {
    content,
    reasoningTokens,
    model: payload.model ?? model,
  };
};

export const chat = async (messages: ChatMessage[]): Promise<ChatResult> => {
  if (!config.apiKey) throw new Error("OPENROUTER_API_KEY is required.");

  let lastError: unknown;
  for (const model of models()) {
    for (let attempt = 0; attempt <= config.retries; attempt++) {
      try {
        return await sendCompletion(model, messages);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === config.retries) break;
        await sleep(config.retryBaseMs * Math.pow(2, attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All configured OpenRouter models failed.");
};

export const extractJson = <T>(text: string): T => {
  const match = text.match(jsonFence);
  const cleaned = match?.[1] ?? text;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object found in model output.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
};
