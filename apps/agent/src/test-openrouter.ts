import{OpenRouter}from"@openrouter/sdk";

const apiKey=process.env.OPENROUTER_API_KEY;
if(!apiKey)throw new Error("Set OPENROUTER_API_KEY before running this test.");

const models=Array.from(new Set([
  process.env.LLM_MODEL??"qwen/qwen3.8-27b:free",
  ...(process.env.LLM_FALLBACK_MODELS??"openrouter/free,dots-studio/dots3-note-preview:free").split(",").map(v=>v.trim()).filter(Boolean)
]));

const client=new OpenRouter({apiKey});
let lastError:unknown;

for(const model of models){
  try{
    process.stdout.write(`Trying ${model}…\n`);
    const stream=await client.chat.send({
      chatRequest:{
        model,
        messages:[{role:"user",content:"Reply with exactly: Figma agent connection works."}],
        stream:true
      }
    });
    let response="";
    for await(const chunk of stream){
      const content=chunk.choices[0]?.delta?.content;
      if(content){response+=content;process.stdout.write(content);}
      const usage=(chunk as any).usage;
      const reasoningTokens=usage?.completionTokensDetails?.reasoningTokens;
      if(typeof reasoningTokens==="number")process.stderr.write(`\nReasoning tokens: ${reasoningTokens}\n`);
    }
    if(!response.trim())throw new Error("Provider returned empty content.");
    process.stdout.write(`\nConnected using ${model}\n`);
    process.exit(0);
  }catch(error){
    lastError=error;
    const status=(error as any)?.statusCode??(error as any)?.status??"unknown";
    console.error(`Failed with ${model} (status ${status}).`);
  }
}

throw lastError instanceof Error?lastError:new Error("All configured free models failed.");
