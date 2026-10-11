export const config={
  port:Number(process.env.PORT??8787),
  apiKey:process.env.GEMINI_API_KEY??"",
  model:process.env.GEMINI_MODEL??"gemini-2.5-flash-lite",
  fallbackModels:(process.env.GEMINI_FALLBACK_MODELS??"gemini-3-flash-preview,gemini-2.5-flash").split(",").map(v=>v.trim()).filter(Boolean),
  temperature:Number(process.env.LLM_TEMPERATURE??0.1),
  maxTokens:Number(process.env.LLM_MAX_TOKENS??6000),
  retries:Number(process.env.LLM_RETRIES??1),
  retryBaseMs:Number(process.env.LLM_RETRY_BASE_MS??1200),
  maxActions:Number(process.env.MAX_ACTIONS_PER_PLAN??80),
  maxRepairLoops:Number(process.env.MAX_REPAIR_LOOPS??2)
};
