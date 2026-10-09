import type { ActionPlan, AgentContext, CritiqueResult, DesignAction } from "@figma-design-agent/core";
import { guardPlan, validateActionPlan } from "@figma-design-agent/core";
import { structuralCritique } from "./critics.js";
import { config } from "./config.js";
import { chat, extractJson } from "./provider.js";
import { loadSkills } from "./skills.js";
import { rankComponents } from "./retrieval.js";
import { retrieveReviewedExamples } from "./memory.js";
import { buildSystemPrompt, buildCritiquePrompt, buildPlanPrompt, buildRepairPrompt } from "./prompts.js";

const fallbackPlan = (goal: string, context: AgentContext): ActionPlan => {
  const root = context.selectedNode;
  if (!root) return { version: "1", goal, strategy: "No selection available; ask the user to select a frame.", actions: [], decisions: [], assumptions: ["A target frame is required."], stopConditions: ["Stop when no target frame exists."] };
  const lower = goal.toLowerCase();
  const actions: DesignAction[] = [];
  if (lower.includes("mobile") || lower.includes("responsive")) {
    actions.push({ id: "layout-1", action: "set_layout", targetId: root.id, mode: "VERTICAL", gap: 16, padding: { top: 16, right: 20, bottom: 24, left: 20 }, primaryAxisSizingMode: "AUTO", counterAxisSizingMode: "FIXED", description: "Establish a predictable mobile vertical flow." });
    actions.push({ id: "width-1", action: "resize", targetId: root.id, width: 390, height: root.bounds?.height ?? 844, description: "Set a representative mobile viewport width.", dependsOn: ["layout-1"] });
  }
  if (lower.includes("title") || lower.includes("heading")) {
    const titleNode = findFirstText(root);
    if (titleNode) actions.push({ id: "title-1", action: "set_property", targetId: titleNode.id, property: "name", value: titleNode.name, description: "Preserve the title node while the model is unavailable." });
  }
  return { version: "1", goal, strategy: "Deterministic fallback mode. Configure an LLM provider for model-backed planning.", actions, decisions: [], assumptions: ["No model-backed provider was configured."], stopConditions: ["Stop after safe structural edits."] };
};
const findFirstText = (node: AgentContext["selectedNode"]): AgentContext["selectedNode"] => {
  if (!node) return undefined;
  if (node.type === "TEXT") return node;
  for (const child of node.children) { const match = findFirstText(child); if (match) return match; }
  return undefined;
};
export class AgentOrchestrator {
  async plan(goal: string, context: AgentContext): Promise<ActionPlan> {
    let plan: ActionPlan;
    if (config.apiKey && config.model) {
      const [skills, reviewedMemory] = await Promise.all([loadSkills(), retrieveReviewedExamples(goal, context)]);
      plan = extractJson<ActionPlan>((await chat([
        { role: "system", content: buildSystemPrompt(skills) },
        { role: "user", content: buildPlanPrompt(goal, context, rankComponents(goal, context), reviewedMemory) },
      ])).content);
    } else plan = fallbackPlan(goal, context);
    const issues = validateActionPlan(plan, context, config.maxActions);
    const guardErrors = guardPlan(plan, config.maxActions);
    if (guardErrors.length) throw new Error("Action plan guard rejected: " + guardErrors.join("; "));
    if (issues.some((issue) => issue.severity === "error")) throw new Error("Action plan rejected: " + issues.map((issue) => issue.message).join("; "));
    return plan;
  }
  async critique(goal: string, context: AgentContext, screenshotDataUrl?: string): Promise<CritiqueResult> {
    const structural = structuralCritique(context);
    if (!config.apiKey || !config.model) return { passed: structural.passed, score: structural.score,
      issues: [...structural.issues, { severity: "info", code: "HEURISTIC_ONLY", message: "Model-backed visual critique is disabled because no LLM provider is configured." }], decisions: structural.decisions };
    const userContent = screenshotDataUrl
      ? [{ type: "text" as const, text: buildCritiquePrompt(goal, context, screenshotDataUrl) }, { type: "image_url" as const, image_url: { url: screenshotDataUrl } }]
      : buildCritiquePrompt(goal, context);
    const modelCritique = extractJson<CritiqueResult>((await chat([
      { role: "system", content: buildSystemPrompt(await loadSkills()) }, { role: "user", content: userContent as never },
    ])).content);
    const issues = [...structural.issues, ...modelCritique.issues];
    const hasError = issues.some((issue) => issue.severity === "error");
    return { passed: !hasError && modelCritique.passed && structural.passed, score: Math.min(structural.score ?? 100, modelCritique.score ?? 100), issues, decisions: [...structural.decisions, ...modelCritique.decisions] };
  }
  async repair(goal: string, context: AgentContext, critique: CritiqueResult): Promise<ActionPlan> {
    if (!config.apiKey || !config.model) return { version: "1", goal, strategy: "No repair generated because model-backed repair is disabled.", actions: [], decisions: [], assumptions: [], stopConditions: ["Configure an LLM provider to enable repairs."] };
    const plan = extractJson<ActionPlan>((await chat([
      { role: "system", content: buildSystemPrompt(await loadSkills()) }, { role: "user", content: buildRepairPrompt(goal, context, critique) },
    ])).content);
    const issues = validateActionPlan(plan, context, config.maxActions);
    const guardErrors = guardPlan(plan, config.maxActions);
    if (guardErrors.length) throw new Error("Repair plan guard rejected: " + guardErrors.join("; "));
    if (issues.some((issue) => issue.severity === "error")) throw new Error("Repair plan rejected: " + issues.map((issue) => issue.message).join("; "));
    return plan;
  }
}
