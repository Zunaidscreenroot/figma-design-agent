import{OpenRouter}from"@openrouter/sdk";
import{config}from"./config.js";

export type ChatMessage=
  |{role:"system"|"user"|"assistant";content:string}
  |{role:"user";content:Array<{type:"text";text:string}|{type:"image_url";image_url:{url:string}}>};

export interface ChatResult{content:string;reasoningTokens?:number;model:string}

const jsonFence=/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/i;
const client=new OpenRouter({apiKey:config.apiKey,appTitle:"Figma Design Agent"});

const normalizeMessages=(messages:ChatMessage[])=>messages.map(message=>{
  if(Array.isArray(message.content)){
    return{role:message.role,content:message.content.map(part=>part.type==="text"?{text:part.text,type:"text" as const}:{type:"image_url" as const,image_url:{url:part.image_url.url}})};
  }
  return{role:message.role,content:message.content};
});

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

const isRetryable=(error:unknown)=>{
  const status=(error as any)?.statusCode??(error as any)?.status??(error as any)?.error?.code;
  return status===429||status===408||status===500||status===502||status===503||status===504;
};

const models=()=>Array.from(new Set([
  config.model,
  ...config.fallbackModels
].filter(Boolean)));

const sendStreaming=async(model:string,messages:ChatMessage[])=>{
  const stream=await client.chat.send({
    chatRequest:{
      model,
      messages:normalizeMessages(messages) as any,
      stream:true,
      temperature:config.temperature,
      max_tokens:config.maxTokens
    }
  });

  let content="";
  let reasoningTokens:number|undefined;
  for await(const chunk of stream){
    const delta=chunk.choices[0]?.delta?.content;
    if(typeof delta==="string")content+=delta;
    const usage=(chunk as any).usage;
    const value=usage?.completionTokensDetails?.reasoningTokens;
    if(typeof value==="number")reasoningTokens=value;
  }
  if(!content)throw new Error("OpenRouter returned no content.");
  return{content,reasoningTokens,model};
};

export const chat=async(messages:ChatMessage[]):Promise<ChatResult>=>{
  if(!config.apiKey)throw new Error("OPENROUTER_API_KEY is required.");

  let lastError:unknown;
  for(const model of models()){
    for(let attempt=0;attempt<=config.retries;attempt++){
      try{return await sendStreaming(model,messages);}
      catch(error){
        lastError=error;
        if(!isRetryable(error)||attempt===config.retries)break;
        await sleep(config.retryBaseMs*Math.pow(2,attempt));
      }
    }
  }
  throw lastError instanceof Error?lastError:new Error("All configured OpenRouter models failed.");
};

export const extractJson=<T>(text:string):T=>{
  const match=text.match(jsonFence);
  const cleaned=match?.[1]??text;
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start<0||end<start)throw new Error("No JSON object found in model output.");
  return JSON.parse(cleaned.slice(start,end+1)) as T;
};
