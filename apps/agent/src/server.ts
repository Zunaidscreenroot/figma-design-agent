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

const server=createServer(async(req,res)=>{
  if(req.method==="OPTIONS"){send(res,204,{});return;}
  try{
    if(req.method==="GET"&&req.url==="/health"){send(res,200,{ok:true,modelConfigured:Boolean(config.apiKey&&config.model),model:config.model||null});return;}
    const body=await readBody(req);
    if(req.method==="POST"&&req.url==="/plan"){send(res,200,await agent.plan(body.prompt,contextOf(body.context)));return;}
    if(req.method==="POST"&&req.url==="/critique"){send(res,200,await agent.critique(body.prompt,contextOf(body.context),body.screenshotDataUrl));return;}
    if(req.method==="POST"&&req.url==="/repair"){send(res,200,await agent.repair(body.prompt,contextOf(body.context),body.critique));return;}
    send(res,404,{error:"Not found"});
  }catch(error){send(res,500,{error:error instanceof Error?error.message:"Unknown server error"});}
});
server.listen(config.port,()=>console.log(`Figma Design Agent API listening on http://localhost:${config.port}`));
