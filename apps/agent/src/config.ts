export const config={
  port:Number(process.env.PORT??8787),
  apiKey:process.env.OPENROUTER_API_KEY??process.env.LLM_API_KEY??"",
  baseUrl:(process.env.LLM_BASE_URL??"https://openrouter.ai/api/v1").replace(/\/$/,""),
  model:process.env.LLM_MODEL??"qwen/qwen3.8-27b:free",
  fallbackModels:(process.env.LLM_FALLBACK_MODELS??"openrouter/free,dots-studio/dots3-note-preview:free").split(",").map(v=>v.trim()).filter(Boolean),
  temperature:Number(process.env.LLM_TEMPERATURE??0.1),
  maxTokens:Number(process.env.LLM_MAX_TOKENS??6000),
  retries:Number(process.env.LLM_RETRIES??1),
  retryBaseMs:Number(process.env.LLM_RETRY_BASE_MS??1200),
  maxActions:Number(process.env.MAX_ACTIONS_PER_PLAN??80),
  maxRepairLoops:Number(process.env.MAX_REPAIR_LOOPS??2)
};
