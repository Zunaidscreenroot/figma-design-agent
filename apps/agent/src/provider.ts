import{config}from"./config.js";

export type ChatMessage=
  |{role:"system"|"user"|"assistant";content:string}
  |{role:"user";content:Array<{type:"text";text:string}|{type:"image_url";image_url:{url:string}}>};
export interface ChatResult{content:string;reasoningTokens?:number;model:string}
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const models=()=>Array.from(new Set([config.model,...config.fallbackModels].filter(Boolean)));
const retryable=(status:number)=>[408,429,500,502,503,504].includes(status);
function imagePart(url:string){
  const match=url.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s);
  if(match)return{inlineData:{mimeType:match[1],data:match[2]}};
  return null;
}
function convertMessages(messages:ChatMessage[]){
  const system=messages.filter(m=>m.role==="system").map(m=>typeof m.content==="string"?m.content:"").join("\n\n");
  const contents=messages.filter(m=>m.role!=="system").map(m=>({
    role:m.role==="assistant"?"model":"user",
    parts:Array.isArray(m.content)?m.content.map(p=>{
      if(p.type==="text")return{text:p.text};
      return imagePart(p.image_url.url)??{text:"[Image omitted: unsupported image URL format]"};
    }):[{text:m.content}]
  }));
  return{system,contents};
}
async function send(model:string,messages:ChatMessage[]):Promise<ChatResult>{
  const {system,contents}=convertMessages(messages);
  const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
    method:"POST",headers:{"content-type":"application/json","x-goog-api-key":config.apiKey},
    body:JSON.stringify({...(system?{systemInstruction:{parts:[{text:system}]}}:{}),contents,generationConfig:{temperature:config.temperature,maxOutputTokens:config.maxTokens}})
  });
  const payload:any=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(payload?.error?.message??("Gemini request failed (HTTP "+response.status+").")) as Error&{status:number};error.status=response.status;throw error;}
  const content=(payload.candidates?.[0]?.content?.parts??[]).map((p:any)=>p.text??"").join("");
  if(!content)throw new Error("Gemini model "+model+" returned no text content.");
  return{content,model};
}
export const chat=async(messages:ChatMessage[]):Promise<ChatResult>=>{
  if(!config.apiKey)throw new Error("GEMINI_API_KEY is required. Set it in the server/Vercel environment.");
  let lastError:unknown;
  for(const model of models()){
    for(let attempt=0;attempt<=config.retries;attempt++){
      try{return await send(model,messages);}
      catch(error){lastError=error;const status=(error as any)?.status;if((typeof status==="number"&&!retryable(status))||attempt===config.retries)break;await sleep(config.retryBaseMs*Math.pow(2,attempt));}
    }
  }
  throw lastError instanceof Error?lastError:new Error("All configured Gemini models failed.");
};
export const extractJson=<T>(text:string):T=>{
  const cleaned=text.replace(/^\s*```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"");
  const start=cleaned.indexOf("{");const end=cleaned.lastIndexOf("}");
  if(start<0||end<start)throw new Error("No JSON object found in model output.");
  return JSON.parse(cleaned.slice(start,end+1)) as T;
};
