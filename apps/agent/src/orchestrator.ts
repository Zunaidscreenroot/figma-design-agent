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
const resolveTaskType = (explicit: unknown, goal: string): string => {
  const valid = new Set(["polished_screen", "variations", "content_states", "ux_audit", "mobile_conversion", "other"]);
  if (typeof explicit === "string" && valid.has(explicit)) return explicit;
  const value = goal.toLowerCase();
  if (/audit|heuristic|consisten|accessibility|critique|review/.test(value)) return "ux_audit";
  if (/variation|variant|alternate|alternative|options/.test(value)) return "variations";
  if (/content|copy|microcopy|labels|helper text|empty state|error message/.test(value)) return "content_states";
  if (/mobile|responsive|desktop to mobile|small screen/.test(value)) return "mobile_conversion";
  return "polished_screen";
};

const responseText = (messages: ChatMessage[]) => messages.map((message) => {
  if (typeof message.content === "string") return message.role + ": " + message.content;
  return message.role + ": " + message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\\n");
}).join("\\n\\n").slice(0, 18000);

const chatJson = async <T>(messages: ChatMessage[], stage: string): Promise<T> => {
  const initial = await chat(messages);
  try {
    return extractJson<T>(initial.content);
  } catch (initialError) {
    const requestSummary = responseText(messages);
    const recoveryMessages: ChatMessage[] = [
      {
        role: "system",
        content: "You repair model responses for a software agent. Return exactly one valid JSON object only. Do not include markdown fences, analysis, commentary, or <think> tags. Preserve the required schema from the request. Do not invent unknown identifiers or facts.",
      },
      {
        role: "user",
        content:
          "The previous response could not be parsed as a JSON object. Re-issue the response required by the original request below as one valid JSON object. If you cannot satisfy a field, use a safe empty/default value permitted by the schema. Do not explain.\\n\\nOriginal request (text only; attached images omitted):\\n" +
          requestSummary +
          "\\n\\nInvalid prior response:\\n" +
          initial.content.slice(0, 8000),
      },
    ];

    try {
      const recovered = await chat(recoveryMessages);
      try {
        return extractJson<T>(recovered.content);
      } catch (recoveryError) {
        const preview = recovered.content.slice(0, 500).replace(/\\s+/g, " ");
        throw new Error(
          stage + " failed: model " + initial.model + " returned non-JSON output, and recovery model " +
          recovered.model + " also returned non-JSON output. Recovery response preview: " + JSON.stringify(preview),
        );
      }
    } catch (recoveryError) {
      if (recoveryError instanceof Error && recoveryError.message.startsWith(stage + " failed:")) throw recoveryError;
      const preview = initial.content.slice(0, 500).replace(/\\s+/g, " ");
      const detail = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
      throw new Error(
        stage + " failed: model " + initial.model + " returned non-JSON output. First response preview: " +
        JSON.stringify(preview) + ". Recovery attempt failed: " + detail +
        (initialError instanceof Error ? " (parse: " + initialError.message + ")" : ""),
      );
    }
  }
};

const multimodalContent = (text: string, currentScreenshot?: string) => {
  if (!currentScreenshot) return text;
  return [
    { type: "text", text },
    { type: "text", text: "Current output screenshot. Evaluate this against the task and its stated requirements." },
    { type: "image_url", image_url: { url: currentScreenshot } },
  ];
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
    const systemPrompt = buildSystemPrompt(await loadSkills());

    if (config.apiKey && config.model) {
      const prompt = buildPlanPrompt(goal, context, rankComponents(goal, context), taskType);
      plan = await chatJson<ActionPlan>([
        { role: "system", content: systemPrompt },
        { role: "user", content: multimodalContent(prompt) as never },
      ], "Plan generation");
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
  ): Promise<CritiqueResult> {
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
    const userContent = multimodalContent(prompt, screenshotDataUrl);
    const modelCritique = await chatJson<CritiqueResult>([
      { role: "system", content: buildSystemPrompt(await loadSkills()) },
      { role: "user", content: userContent as never },
    ], "Visual critique");
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
  ): Promise<ActionPlan> {
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
    const plan = await chatJson<ActionPlan>([
      { role: "system", content: buildSystemPrompt(await loadSkills()) },
      { role: "user", content: multimodalContent(prompt) as never },
    ], "Design repair");

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
