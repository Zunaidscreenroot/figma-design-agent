import{createServer,type IncomingMessage,type ServerResponse}from"node:http";
import{AgentOrchestrator}from"./orchestrator.js";
import{compileContext}from"./context-compiler.js";
import{config}from"./config.js";
import{getMemoryStatus,resolveTaskType,saveDesignReview}from"./memory.js";

const agent=new AgentOrchestrator();

const send=(res:ServerResponse,status:number,body:unknown,origin?:string)=>{
  const headers:Record<string,string>={"content-type":"application/json; charset=utf-8","vary":"Origin"};
  if(origin&&config.allowedOrigins.includes(origin)){
    headers["access-control-allow-origin"]=origin;
    headers["access-control-allow-headers"]="content-type";
    headers["access-control-allow-methods"]="GET,POST,OPTIONS";
  }
  res.writeHead(status,headers);
  res.end(status===204?undefined:JSON.stringify(body));
};
const readBody=async(req:IncomingMessage)=>{
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req){
    const part=Buffer.from(chunk);size+=part.length;
    if(size>8*1024*1024)throw new Error("Request body exceeds the 8 MB limit.");
    chunks.push(part);
  }
  const raw=Buffer.concat(chunks).toString("utf8");return raw?JSON.parse(raw):{};
};
const contextOf=(raw:any)=>{
  if(raw?.project&&Array.isArray(raw.selectionIds))return raw;
  if(!raw||typeof raw!=="object")throw new Error("A Figma context is required.");
  return compileContext(raw).context;
};

const server=createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(origin&&!config.allowedOrigins.includes(origin)){
    send(res,403,{error:"This browser origin is not allowed to use the local agent. Configure AGENT_ALLOWED_ORIGINS if this is your Figma client."});
    return;
  }
  if(req.method==="OPTIONS"){
    if(origin&&!config.allowedOrigins.includes(origin)){send(res,403,{error:"Origin not allowed"});return;}
    send(res,204,{},origin);return;
  }
  try{
    if(req.method==="GET"&&req.url==="/health"){
      send(res,200,{ok:true,modelConfigured:Boolean(config.apiKey&&config.model),model:config.model||null,memoryConfigured:getMemoryStatus().configured},origin);
      return;
    }
    if(req.method==="GET"&&req.url==="/memory/status"){
      send(res,200,getMemoryStatus(),origin);
      return;
    }

    const body=await readBody(req);
    if(req.method==="POST"&&req.url==="/plan"){
      send(res,200,await agent.plan(body.prompt,contextOf(body.context),body.taskType),origin);return;
    }
    if(req.method==="POST"&&req.url==="/critique"){
      send(res,200,await agent.critique(body.prompt,contextOf(body.context),body.screenshotDataUrl,body.taskType),origin);return;
    }
    if(req.method==="POST"&&req.url==="/repair"){
      send(res,200,await agent.repair(body.prompt,contextOf(body.context),body.critique,body.taskType),origin);return;
    }
    if(req.method==="POST"&&req.url==="/memory/feedback"){
      const allowed=["accepted","needs_changes","rejected"];
      if(!allowed.includes(body.feedbackType))throw new Error("feedbackType must be accepted, needs_changes or rejected.");
      if(typeof body.prompt!=="string"||!body.prompt.trim())throw new Error("A task prompt is required to save feedback.");
      if(body.feedbackType!=="accepted"&&!(typeof body.feedbackText==="string"&&body.feedbackText.trim())){
        throw new Error("Please describe what should change before submitting this review.");
      }
      const saved=await saveDesignReview({
        goal:body.prompt,
        taskType:resolveTaskType(body.taskType,body.prompt),
        reviewStatus:body.feedbackType,
        feedbackText:typeof body.feedbackText==="string"?body.feedbackText:undefined,
        makeRule:body.makeRule===true,
        projectKey:typeof body.projectKey==="string"?body.projectKey:undefined,
        context:contextOf(body.context),
        critique:body.critique,
        screenshotDataUrl:typeof body.screenshotDataUrl==="string"?body.screenshotDataUrl:undefined
      });
      send(res,201,{ok:true,...saved},origin);return;
    }
    send(res,404,{error:"Not found"},origin);
  }catch(error){
    const message=error instanceof Error?error.message:"Unknown server error";
    const status=message.includes("required")||message.includes("must be")||message.includes("Please describe")||message.includes("limit")?400:500;
    send(res,status,{error:message},origin);
  }
});
server.listen(config.port,config.host,()=>console.log("Figma Design Agent API listening on http://"+config.host+":"+config.port));
