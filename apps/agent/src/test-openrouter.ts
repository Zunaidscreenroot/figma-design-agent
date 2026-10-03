import{OpenRouter}from"@openrouter/sdk";

const apiKey=process.env.OPENROUTER_API_KEY;
if(!apiKey)throw new Error("Set OPENROUTER_API_KEY before running this test.");

const client=new OpenRouter({apiKey});
const stream=await client.chat.send({
  chatRequest:{
    model:process.env.LLM_MODEL??"qwen/qwen3.8-27b:free",
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
process.stdout.write("\n");
if(!response.trim())throw new Error("OpenRouter returned no content.");
