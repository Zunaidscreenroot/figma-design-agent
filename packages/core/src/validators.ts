import type { ActionPlan } from "./actions.js";
import type { AgentContext, ValidationIssue } from "./design-ast.js";

const MAX_ACTIONS = 80;

export const validateActionPlan = (
  plan: ActionPlan,
  context: AgentContext,
  maxActions = MAX_ACTIONS,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (plan.version !== "1") {
    issues.push({
      severity: "error",
      code: "PLAN_VERSION",
      message: "Unsupported action plan version.",
    });
  }

  if (plan.actions.length === 0) {
    issues.push({
      severity: "warning",
      code: "EMPTY_PLAN",
      message: "The plan contains no design actions.",
    });
  }

  if (plan.actions.length > maxActions) {
    issues.push({
      severity: "error",
      code: "ACTION_LIMIT",
      message: `The plan contains ${plan.actions.length} actions; limit is ${maxActions}.`,
    });
  }

  const knownIds = new Set<string>([
    ...context.selectionIds,
    ...context.project.components.map((component) => component.id),
  ]);

  for (const action of plan.actions) {
    if ("targetId" in action && action.targetId && !knownIds.has(action.targetId)) {
      // New nodes may be produced by earlier actions, so this is only a warning.
      issues.push({
        severity: "info",
        code: "FORWARD_NODE_REFERENCE",
        message: `Action ${action.id} references a node that may be created earlier in the plan.`,
        nodeId: action.targetId,
      });
    }
  }

  return issues;
};

export const validateContext = (context: AgentContext): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (context.selectionIds.length === 0) {
    issues.push({
      severity: "warning",
      code: "NO_SELECTION",
      message: "No Figma node is selected.",
      suggestedFix: "Select a frame or screen before running a targeted editing task.",
    });
  }

  if (context.project.components.length === 0) {
    issues.push({
      severity: "info",
      code: "NO_COMPONENTS",
      message: "No components were discovered in the supplied context.",
    });
  }

  if (context.project.tokens.length === 0) {
    issues.push({
      severity: "info",
      code: "NO_TOKENS",
      message: "No variables/tokens were discovered in the supplied context.",
    });
  }

  return issues;
};
