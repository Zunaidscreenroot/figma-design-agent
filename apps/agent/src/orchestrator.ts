import type {
  ActionPlan,
  AgentContext,
  CritiqueResult,
  DesignAction,
} from "@figma-design-agent/core";
import { guardPlan, validateActionPlan } from "@figma-design-agent/core";
import { structuralCritique } from "./critics.js";
import { config } from "./config.js";
import { chat, extractJson, type ChatMessage } from "./provider.js";
import { loadSkills } from "./skills.js";
import { rankComponents } from "./retrieval.js";
import {
  buildSystemPrompt,
  buildCritiquePrompt,
  buildPlanPrompt,
  buildRepairPrompt,
} from "./prompts.js";
import {
  formatMemoryForPrompt,
  resolveTaskType,
  retrieveDesignMemory,
  type RetrievedMemory,
  type UxTaskType,
} from "./memory.js";

const multimodalContent = (text: string, memory: RetrievedMemory, currentScreenshot?: string) => {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [{ type: "text", text }];

  if (currentScreenshot) {
    parts.push({ type: "text", text: "Current output screenshot. Evaluate this against the task and approved reference examples." });
    parts.push({ type: "image_url", image_url: { url: currentScreenshot } });
  }

  for (const reference of memory.referenceImages) {
    parts.push({
      type: "text",
      text: "Previously accepted visual reference for a related task: " + reference.goal,
    });
    parts.push({ type: "image_url", image_url: { url: reference.url } });
  }

  return parts.length === 1 ? text : parts;
};

const fallbackPlan = (goal: string, context: AgentContext): ActionPlan => {
  const root = context.selectedNode;
  if (!root) {
    return {
      version: "1",
      goal,
      strategy: "No selection available; ask the user to select a frame.",
      actions: [],
      decisions: [],
      assumptions: ["A target frame is required."],
      stopConditions: ["Stop when no target frame exists."],
    };
  }

  const lower = goal.toLowerCase();
  const actions: DesignAction[] = [];

  if (lower.includes("mobile") || lower.includes("responsive")) {
    actions.push({
      id: "layout-1",
      action: "set_layout",
      targetId: root.id,
      mode: "VERTICAL",
      gap: 16,
      padding: { top: 16, right: 20, bottom: 24, left: 20 },
      primaryAxisSizingMode: "AUTO",
      counterAxisSizingMode: "FIXED",
      description: "Establish a predictable mobile vertical flow.",
    });
    actions.push({
      id: "width-1",
      action: "resize",
      targetId: root.id,
      width: 390,
      height: root.bounds?.height ?? 844,
      description: "Set a representative mobile viewport width.",
      dependsOn: ["layout-1"],
    });
  }

  if (lower.includes("title") || lower.includes("heading")) {
    const titleNode = findFirstText(root);
    if (titleNode) {
      actions.push({
        id: "title-1",
        action: "set_property",
        targetId: titleNode.id,
        property: "name",
        value: titleNode.name,
        description: "Preserve the title node while the model is unavailable.",
      });
    }
  }

  return {
    version: "1",
    goal,
    strategy: "Deterministic fallback mode. Configure an LLM provider for model-backed planning.",
    actions,
    decisions: [],
    assumptions: ["No model-backed provider was configured."],
    stopConditions: ["Stop after safe structural edits."],
  };
};

const findFirstText = (
  node: AgentContext["selectedNode"],
): AgentContext["selectedNode"] => {
  if (!node) return undefined;
  if (node.type === "TEXT") return node;
  for (const child of node.children) {
    const match = findFirstText(child);
    if (match) return match;
  }
  return undefined;
};

export class AgentOrchestrator {
  async plan(goal: string, context: AgentContext, requestedTaskType?: string): Promise<ActionPlan> {
    let plan: ActionPlan;
    const taskType = resolveTaskType(requestedTaskType, goal);
    const memory = await retrieveDesignMemory(goal, taskType, config.projectKey);
    const systemPrompt = buildSystemPrompt(await loadSkills(), formatMemoryForPrompt(memory));

    if (config.apiKey && config.model) {
      const prompt = buildPlanPrompt(goal, context, rankComponents(goal, context), taskType);
      plan = extractJson<ActionPlan>(
        (await chat([
          { role: "system", content: systemPrompt },
          { role: "user", content: multimodalContent(prompt, memory) as never },
        ])).content,
      );
    } else {
      plan = fallbackPlan(goal, context);
    }

    const issues = validateActionPlan(plan, context, config.maxActions);
    const guardErrors = guardPlan(plan, config.maxActions);
    if (guardErrors.length) {
      throw new Error("Action plan guard rejected: " + guardErrors.join("; "));
    }
    if (issues.some((issue) => issue.severity === "error")) {
      throw new Error("Action plan rejected: " + issues.map((issue) => issue.message).join("; "));
    }

    return plan;
  }

  async critique(
    goal: string,
    context: AgentContext,
    screenshotDataUrl?: string,
    requestedTaskType?: string,
  ): Promise<CritiqueResult> {
    const taskType: UxTaskType = resolveTaskType(requestedTaskType, goal);
    const memory = await retrieveDesignMemory(goal, taskType, config.projectKey);
    const structural = structuralCritique(context);
    if (!config.apiKey || !config.model) {
      return {
        passed: structural.passed,
        score: structural.score,
        issues: [
          ...structural.issues,
          {
            severity: "info",
            code: "HEURISTIC_ONLY",
            message: "Model-backed visual critique is disabled because no LLM provider is configured.",
          },
        ],
        decisions: structural.decisions,
      };
    }

    const prompt = buildCritiquePrompt(goal, context, screenshotDataUrl);
    const userContent = multimodalContent(prompt, memory, screenshotDataUrl);
    const modelCritique = extractJson<CritiqueResult>(
      (await chat([
        { role: "system", content: buildSystemPrompt(await loadSkills(), formatMemoryForPrompt(memory)) },
        { role: "user", content: userContent as never },
      ])).content,
    );
    const issues = [...structural.issues, ...modelCritique.issues];
    const hasError = issues.some((issue) => issue.severity === "error");
    return {
      passed: !hasError && modelCritique.passed && structural.passed,
      score: Math.min(structural.score ?? 100, modelCritique.score ?? 100),
      issues,
      decisions: [...structural.decisions, ...modelCritique.decisions],
    };
  }

  async repair(
    goal: string,
    context: AgentContext,
    critique: CritiqueResult,
    requestedTaskType?: string,
  ): Promise<ActionPlan> {
    const taskType: UxTaskType = resolveTaskType(requestedTaskType, goal);
    const memory = await retrieveDesignMemory(goal, taskType, config.projectKey);
    if (!config.apiKey || !config.model) {
      return {
        version: "1",
        goal,
        strategy: "No repair generated because model-backed repair is disabled.",
        actions: [],
        decisions: [],
        assumptions: [],
        stopConditions: ["Configure an LLM provider to enable repairs."],
      };
    }

    const prompt = buildRepairPrompt(goal, context, critique);
    const plan = extractJson<ActionPlan>(
      (await chat([
        { role: "system", content: buildSystemPrompt(await loadSkills(), formatMemoryForPrompt(memory)) },
        { role: "user", content: multimodalContent(prompt, memory) as never },
      ])).content,
    );

    const issues = validateActionPlan(plan, context, config.maxActions);
    const guardErrors = guardPlan(plan, config.maxActions);
    if (guardErrors.length) {
      throw new Error("Repair plan guard rejected: " + guardErrors.join("; "));
    }
    if (issues.some((issue) => issue.severity === "error")) {
      throw new Error("Repair plan rejected: " + issues.map((issue) => issue.message).join("; "));
    }

    return plan;
  }
}
