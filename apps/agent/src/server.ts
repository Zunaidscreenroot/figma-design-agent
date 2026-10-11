import{createServer,type IncomingMessage,type ServerResponse}from"node:http";
import{AgentOrchestrator}from"./orchestrator.js";
import{compileContext}from"./context-compiler.js";
import{config}from"./config.js";

const agent=new AgentOrchestrator();
const send=(res:ServerResponse,status:number,body:unknown)=>{
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-headers":"content-type","access-control-allow-methods":"GET,POST,OPTIONS"});
  res.end(JSON.stringify(body));
};
const readBody=async(req:IncomingMessage)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  const raw=Buffer.concat(chunks).toString("utf8");return raw?JSON.parse(raw):{};
};
const contextOf=(raw:any)=>{
  if(raw?.project&&Array.isArray(raw.selectionIds))return raw;
  return compileContext(raw).context;
};
const checkOpenRouter=async(id:string)=>{
  if(!config.openRouterApiKey)return{provider:"OpenRouter",id,status:"unavailable",reason:"OPENROUTER_API_KEY missing"};
  try{
    const response=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"authorization":`Bearer ${config.openRouterApiKey}`,"content-type":"application/json"},body:JSON.stringify({model:id,messages:[{role:"user",content:"Reply with OK only."}],max_tokens:8,stream:false}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)return{provider:"OpenRouter",id,status:response.status===429?"rate_limited":"unavailable",reason:`HTTP ${response.status}`};
    const data:any=await response.json();
    return{provider:"OpenRouter",id,status:data.choices?.[0]?.message?.content?"available":"unavailable",reason:data.choices?.[0]?.message?.content?undefined:"No text response"};
  }catch(e){return{provider:"OpenRouter",id,status:"unavailable",reason:e instanceof Error?e.message:"Request failed"}}
};
const checkGemini=async(id:string)=>{
  if(!config.geminiApiKey)return{provider:"Gemini",id,status:"unavailable",reason:"GEMINI_API_KEY missing"};
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(id)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:"Reply with OK only."}]}],generationConfig:{maxOutputTokens:8}}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)return{provider:"Gemini",id,status:response.status===429?"rate_limited":"unavailable",reason:`HTTP ${response.status}`};
    const data:any=await response.json();
    return{provider:"Gemini",id,status:data.candidates?.[0]?.content?.parts?.some((p:any)=>p.text)?"available":"unavailable",reason:data.candidates?.[0]?.content?.parts?.some((p:any)=>p.text)?undefined:"No text response"};
  }catch(e){return{provider:"Gemini",id,status:"unavailable",reason:e instanceof Error?e.message:"Request failed"}}
};
const listModels=async()=>{
  const jobs:{provider:string;id:string;run:()=>Promise<any>}[]=[];
  for(const id of config.geminiModels)jobs.push({provider:"Gemini",id,run:()=>checkGemini(id)});
  for(const id of config.openRouterModels)jobs.push({provider:"OpenRouter",id,run:()=>checkOpenRouter(id)});
  const results=await Promise.all(jobs.map(async job=>job.run()));
  return{models:results,checkedAt:new Date().toISOString()};
};
const server=createServer(async(req,res)=>{
  if(req.method==="OPTIONS"){send(res,204,{});return;}
  try{
    if(req.method==="GET"&&req.url==="/health"){send(res,200,{ok:true,modelConfigured:Boolean(config.apiKey&&config.model),model:config.model||null});return;}
    if(req.method==="GET"&&req.url==="/models"){send(res,200,await listModels());return;}
    const body=await readBody(req);
    if(req.method==="POST"&&req.url==="/plan"){send(res,200,await agent.plan(body.prompt,contextOf(body.context)));return;}
    if(req.method==="POST"&&req.url==="/critique"){send(res,200,await agent.critique(body.prompt,contextOf(body.context),body.screenshotDataUrl));return;}
    if(req.method==="POST"&&req.url==="/repair"){send(res,200,await agent.repair(body.prompt,contextOf(body.context),body.critique));return;}
    send(res,404,{error:"Not found"});
  }catch(error){send(res,500,{error:error instanceof Error?error.message:"Unknown server error"});}
});
server.listen(config.port,()=>console.log(`Figma Design Agent API listening on port ${config.port}`));
