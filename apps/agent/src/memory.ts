import { randomUUID } from "node:crypto";
import type { AgentContext, DesignNode } from "@figma-design-agent/core";
import { config } from "./config.js";
export type ReviewVerdict = "accepted" | "needs_changes";
interface ReviewedExample { id: string; prompt: string; verdict: ReviewVerdict; review_note?: string | null; summary?: string | null; created_at?: string; }
export const isMemoryEnabled = () => Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
const projectKeyFor = (context: AgentContext) => (context.project.fileKey || context.project.fileName || "unbound-project").slice(0, 200);

const rest = async <T = unknown>(path: string, method = "GET", body?: unknown, prefer?: string): Promise<T> => {
  if (!isMemoryEnabled()) throw new Error("Supabase memory is not configured.");
  const headers: Record<string, string> = { apikey: config.supabaseServiceRoleKey, Authorization: "Bearer " + config.supabaseServiceRoleKey, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(config.supabaseUrl + "/rest/v1/" + path.replace(/^\/+/, ""), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const content = await response.text();
  if (!response.ok) throw new Error("Supabase memory request failed (" + response.status + "): " + content.slice(0, 300));
  return (content ? JSON.parse(content) : null) as T;
};

const compactNode = (node: DesignNode | undefined, depth: number, budget: { remaining: number }): Record<string, unknown> | null => {
  if (!node || budget.remaining <= 0) return null;
  budget.remaining -= 1;
  const result: Record<string, unknown> = {
    name: node.name, type: node.type, role: node.role, bounds: node.bounds, layout: node.layout, style: node.style, text: node.text,
    component: node.component ? { name: node.component.name, id: node.component.id, variantProperties: node.component.variantProperties } : undefined,
  };
  if (depth < 5 && node.children.length) result.children = node.children.slice(0, 40).map((child) => compactNode(child, depth + 1, budget)).filter(Boolean);
  else if (node.children.length) result.childCount = node.children.length;
  return result;
};

const summarizeContext = (context: AgentContext) => {
  const root = context.selectedNode;
  const nodeNames: string[] = [];
  const componentNames = new Set<string>();
  const walk = (node: DesignNode | undefined) => {
    if (!node || nodeNames.length >= 100) return;
    nodeNames.push(node.name + " (" + node.role + ")");
    if (node.component?.name) componentNames.add(node.component.name);
    for (const child of node.children) walk(child);
  };
  walk(root);
  const dimensions = root?.bounds ? Math.round(root.bounds.width) + "x" + Math.round(root.bounds.height) : "unknown dimensions";
  return [
    "Screen: " + (root?.name ?? "No selected frame"), "Viewport: " + dimensions,
    "Structure: " + nodeNames.slice(0, 45).join(", "),
    "Existing components used: " + Array.from(componentNames).slice(0, 25).join(", "),
    "Available tokens: " + context.project.tokens.slice(0, 35).map((token) => token.name).join(", "),
  ].join("\n");
};

const makeSnapshot = (context: AgentContext) => ({
  fileName: context.project.fileName ?? null,
  viewport: context.viewport ?? null,
  selectedNode: compactNode(context.selectedNode, 0, { remaining: 280 }),
  usedComponents: context.project.components.slice(0, 80).map((component) => ({ id: component.id, name: component.name, type: component.type, variantProperties: component.variantProperties })),
  tokens: context.project.tokens.slice(0, 80).map((token) => ({ id: token.id, name: token.name, type: token.type, value: token.value })),
});

export const startTask = async (prompt: string, context: AgentContext): Promise<string | null> => {
  if (!isMemoryEnabled()) return null;
  const id = randomUUID();
  try {
    await rest("agent_tasks", "POST", {
      id, project_key: projectKeyFor(context), file_key: context.project.fileKey ?? null, file_name: context.project.fileName ?? null,
      prompt: prompt.slice(0, 12000), status: "running",
      input_summary: { selection_ids: context.selectionIds, selected_frame: context.selectedNode?.name ?? null, viewport: context.viewport ?? null },
    }, "return=minimal");
    return id;
  } catch (error) { console.warn("Task memory unavailable; continuing without persistence.", error); return null; }
};

export const markTaskReady = async (taskId: string | null) => {
  if (!taskId || !isMemoryEnabled()) return false;
  try {
    await rest("agent_tasks?id=eq." + encodeURIComponent(taskId), "PATCH", { status: "ready_for_review", ready_at: new Date().toISOString() }, "return=minimal");
    return true;
  } catch (error) { console.warn("Could not update task status in memory.", error); return false; }
};

export const submitReview = async (input: { taskId?: string | null; prompt: string; context: AgentContext; verdict: ReviewVerdict; note?: string }) => {
  if (!isMemoryEnabled()) return { saved: false, memoryEnabled: false, exampleSaved: false };
  const taskId = input.taskId || null;
  const note = (input.note ?? "").trim().slice(0, 4000);
  const projectKey = projectKeyFor(input.context);
  try {
    await rest("agent_reviews", "POST", {
      task_id: taskId, project_key: projectKey, prompt: input.prompt.slice(0, 12000), verdict: input.verdict,
      note, context_snapshot: makeSnapshot(input.context),
    }, "return=minimal");
    let exampleSaved = false;
    if (input.verdict === "accepted" || note.length > 0) {
      await rest("agent_design_examples", "POST", {
        task_id: taskId, project_key: projectKey, prompt: input.prompt.slice(0, 12000),
        verdict: input.verdict, review_note: note, summary: summarizeContext(input.context).slice(0, 6000),
        context_snapshot: makeSnapshot(input.context),
      }, "return=minimal");
      exampleSaved = true;
    }
    if (taskId) await rest("agent_tasks?id=eq." + encodeURIComponent(taskId), "PATCH", {
      status: input.verdict === "accepted" ? "accepted" : "needs_changes", review_note: note, reviewed_at: new Date().toISOString(),
    }, "return=minimal");
    return { saved: true, memoryEnabled: true, exampleSaved };
  } catch (error) {
    console.warn("Could not persist UX review feedback.", error);
    return { saved: false, memoryEnabled: true, exampleSaved: false, error: error instanceof Error ? error.message : "Unknown memory error" };
  }
};

const words = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
const relevance = (prompt: string, example: ReviewedExample) => {
  const queryWords = words(prompt);
  const exampleWords = words([example.prompt, example.summary ?? "", example.review_note ?? ""].join(" "));
  if (!queryWords.size || !exampleWords.size) return example.verdict === "accepted" ? 0.05 : 0;
  let matches = 0;
  for (const word of queryWords) if (exampleWords.has(word)) matches += 1;
  return matches / Math.sqrt(queryWords.size * exampleWords.size) + (example.verdict === "accepted" ? 0.04 : 0.02);
};
export const retrieveReviewedExamples = async (prompt: string, context: AgentContext, limit = 5): Promise<string> => {
  if (!isMemoryEnabled()) return "";
  try {
    const params = new URLSearchParams();
    params.set("select", "id,prompt,verdict,review_note,summary,created_at");
    params.set("project_key", "eq." + projectKeyFor(context));
    params.set("order", "created_at.desc");
    params.set("limit", "50");
    const examples = await rest<ReviewedExample[]>("agent_design_examples?" + params.toString());
    if (!Array.isArray(examples) || examples.length === 0) return "";
    return examples.map((example) => ({ example, score: relevance(prompt, example) }))
      .sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ example }, index) => [
        "Reviewed example " + (index + 1) + " — " + example.verdict.toUpperCase(),
        "Task: " + example.prompt,
        "Screen evidence: " + (example.summary ?? "No screen summary stored."),
        "Human feedback: " + ((example.review_note ?? "").trim() || (example.verdict === "accepted" ? "Accepted; preserve the useful pattern when it fits the current task." : "Rejected; do not repeat without new evidence.")),
      ].join("\n")).join("\n\n---\n\n");
  } catch (error) { console.warn("Design memory retrieval failed; proceeding without it.", error); return ""; }
};
