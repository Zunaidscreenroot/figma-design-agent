import{OpenRouter}from"@openrouter/sdk";
import{config}from"./config.js";

export type ChatMessage=
  |{role:"system"|"user"|"assistant";content:string}
  |{role:"user";content:Array<{type:"text";text:string}|{type:"image_url";image_url:{url:string}}>};

export interface ChatResult{
  content:string;
  reasoningTokens?:number;
}

const jsonFence=/\\`\\`\\`(?:json)?\\s*([\\s\\S]*?)\\s*\\`\\`\\`/i;

const client=new OpenRouter({
  apiKey:config.apiKey,
  appTitle:"Figma Design Agent"
});

const normalizeMessages=(messages:ChatMessage[])=>
  messages.map(message=>{
    if(Array.isArray(message.content)){
      return{
        role:message.role,
        content:message.content.map(part=>{
          if(part.type==="text")return{text:part.text,type:"text" as const};
          return{type:"image_url" as const,image_url:{url:part.image_url.url}};
        })
      };
    }
    return{role:message.role,content:message.content};
  });

export const chat=async(messages:ChatMessage[]):Promise<ChatResult>=>{
  if(!config.apiKey||!config.model)throw new Error("OPENROUTER_API_KEY and LLM_MODEL are required.");

  const stream=await client.chat.send({
    chatRequest:{
      model:config.model,
      messages:normalizeMessages(messages) as any,
      stream:true,
      temperature:config.temperature,
      max_tokens:config.maxTokens
    }
  });

  let content="";
  let reasoningTokens: number|undefined;

  for await(const chunk of stream){
    const delta=chunk.choices[0]?.delta?.content;
    if(typeof delta==="string")content+=delta;
    const usage=(chunk as any).usage;
    const value=usage?.completionTokensDetails?.reasoningTokens;
    if(typeof value==="number")reasoningTokens=value;
  }

  if(!content)throw new Error("OpenRouter returned no content.");
  return{content,reasoningTokens};
};

export const extractJson=<T>(text:string):T=>{
  const match=text.match(jsonFence);
  const cleaned=match?.[1]??text;
  const start=cleaned.indexOf("{");
  const end=cleaned.lastIndexOf("}");
  if(start<0||end<start)throw new Error("No JSON object found in model output.");
  return JSON.parse(cleaned.slice(start,end+1)) as T;
};
