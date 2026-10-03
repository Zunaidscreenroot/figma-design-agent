import type { AgentContext } from "@figma-design-agent/core";

export const SYSTEM_PROMPT = `
You are an evidence-first Figma design agent.

You create and modify editable Figma designs through structured actions.

Rules:
1. Inspect context before planning.
2. Reuse existing components, variables, styles and patterns whenever evidence supports them.
3. Prefer semantic component instances over recreating primitives.
4. Prefer project tokens over hardcoded design values.
5. Make the smallest valid mutation when editing.
6. Never invent component IDs or variable IDs.
7. Treat uncertain assumptions explicitly.
8. Return valid JSON only.
9. Keep plans deterministic, bounded and reversible.
10. Quality is finished only after structural and visual verification.

You are optimizing for:
- UX correctness
- visual hierarchy
- consistency
- responsive behavior
- accessibility
- design-system integrity
- minimal unnecessary change
`;

export const buildPlanPrompt = (goal: string, context: AgentContext) => `
User goal:
${goal}

Current Figma context:
${JSON.stringify(context, null, 2)}

Return an ActionPlan JSON object:
{
  "version": "1",
  "goal": "string",
  "strategy": "string",
  "actions": [],
  "decisions": [
    {
      "decision": "string",
      "confidence": 0.0,
      "evidence": ["string"]
    }
  ],
  "assumptions": ["string"],
  "stopConditions": ["string"]
}

Important:
- Use only IDs present in the context.
- When creating content inside a frame, prefer create_instance if a relevant component exists.
- Use set_component_property for real instance properties such as text, boolean, instance-swap or variant choices when the property definition is supplied.
- Use replace_instance only when an existing instance should become another component; preserve overrides.
- Do not create dozens of primitive nodes when one existing component can satisfy the intent.
- For a mobile conversion, preserve content priority while changing layout behavior.
`;

export const buildCritiquePrompt = (
  goal: string,
  context: AgentContext,
  screenshotDataUrl?: string,
) => `
Evaluate the Figma result against this goal:

${goal}

Context:
${JSON.stringify(context, null, 2)}

Return JSON:
{
  "passed": true,
  "score": 0,
  "issues": [
    {
      "severity": "info|warning|error",
      "code": "string",
      "message": "string",
      "nodeId": "optional",
      "suggestedFix": "optional"
    }
  ],
  "decisions": []
}

Review:
- information hierarchy
- spacing and alignment
- typography scale
- design-system reuse
- component correctness
- responsive behavior
- obvious accessibility issues
- structural integrity

Only report issues supported by the supplied context or screenshot.
${screenshotDataUrl ? "A visual screenshot is supplied separately in the user message." : ""}
`;

export const buildRepairPrompt = (
  goal: string,
  context: AgentContext,
  critique: unknown,
) => `
Repair this Figma design for the user's goal.

Goal:
${goal}

Context:
${JSON.stringify(context, null, 2)}

Critique:
${JSON.stringify(critique, null, 2)}

Return only a valid ActionPlan JSON object.
Change only what is needed to resolve supported issues.
`;
