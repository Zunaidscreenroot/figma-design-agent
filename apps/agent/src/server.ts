import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AgentOrchestrator } from "./orchestrator.js";
import { compileContext } from "./context-compiler.js";
import { config } from "./config.js";
import { isMemoryEnabled, markTaskReady, startTask, submitReview, type ReviewVerdict } from "./memory.js";
const agent = new AgentOrchestrator();
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": config.allowedOrigin,
    "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "GET,POST,OPTIONS", vary: "Origin" });
  res.end(status === 204 ? "" : JSON.stringify(body));
};
const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > 8 * 1024 * 1024) throw new Error("Request body exceeds the 8 MB limit."); chunks.push(buffer); }
  const raw = Buffer.concat(chunks).toString("utf8"); return raw ? JSON.parse(raw) : {};
};
const contextOf = (raw: any) => raw?.project && Array.isArray(raw.selectionIds) ? raw : compileContext(raw).context;
const authorized = (req: IncomingMessage) => !config.apiToken ? !config.production : req.headers.authorization === "Bearer " + config.apiToken;
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { send(res, 204, {}); return; }
  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true, modelConfigured: Boolean(config.apiKey && config.model), memoryConfigured: isMemoryEnabled(), authenticationConfigured: Boolean(config.apiToken), model: config.model || null });
    return;
  }
  if (!authorized(req)) { send(res, 401, { error: "Unauthorized. Configure the agent API token and provide a Bearer token." }); return; }
  try {
    const body = await readBody(req);
    if (req.method === "POST" && req.url === "/tasks/start") {
      const context = contextOf(body.context);
      const taskId = await startTask(String(body.prompt ?? ""), context);
      send(res, 200, { taskId, memoryEnabled: isMemoryEnabled() }); return;
    }
    if (req.method === "POST" && req.url === "/tasks/ready") {
      const saved = await markTaskReady(typeof body.taskId === "string" ? body.taskId : null);
      send(res, 200, { saved, memoryEnabled: isMemoryEnabled() }); return;
    }
    if (req.method === "POST" && req.url === "/reviews") {
      if (body.verdict !== "accepted" && body.verdict !== "needs_changes") { send(res, 400, { error: "verdict must be accepted or needs_changes" }); return; }
      if (body.verdict === "needs_changes" && !String(body.note ?? "").trim()) { send(res, 400, { error: "Add a short note describing what should change." }); return; }
      const result = await submitReview({ taskId: typeof body.taskId === "string" ? body.taskId : null, prompt: String(body.prompt ?? ""),
        context: contextOf(body.context), verdict: body.verdict as ReviewVerdict, note: String(body.note ?? "") });
      send(res, result.saved || !result.memoryEnabled ? 200 : 503, result); return;
    }
    if (req.method === "POST" && req.url === "/plan") { send(res, 200, await agent.plan(body.prompt, contextOf(body.context))); return; }
    if (req.method === "POST" && req.url === "/critique") { send(res, 200, await agent.critique(body.prompt, contextOf(body.context), body.screenshotDataUrl)); return; }
    if (req.method === "POST" && req.url === "/repair") { send(res, 200, await agent.repair(body.prompt, contextOf(body.context), body.critique)); return; }
    send(res, 404, { error: "Not found" });
  } catch (error) { send(res, 500, { error: error instanceof Error ? error.message : "Unknown server error" }); }
});
if (config.production && !config.apiToken) throw new Error("AGENT_API_TOKEN must be configured in production.");
server.listen(config.port, () => console.log("Figma Design Agent API listening on http://localhost:" + config.port));
