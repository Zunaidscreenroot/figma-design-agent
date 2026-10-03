import type { AgentContext, ComponentRef } from "@figma-design-agent/core";

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const overlapScore = (a: string, b: string) => {
  const aa = new Set(tokenize(a));
  const bb = new Set(tokenize(b));
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap++;
  return overlap / new Set([...aa, ...bb]).size;
};

export interface ComponentCandidate {
  component: ComponentRef;
  score: number;
  reasons: string[];
}

export const rankComponents = (
  query: string,
  context: AgentContext,
  limit = 8,
): ComponentCandidate[] => {
  return context.project.components
    .map((component) => {
      const semantic = overlapScore(query, component.name);
      const usage = Math.min((component.usageCount ?? 0) / 20, 1);
      const variantBoost = component.variantProperties ? 0.08 : 0;
      const score = Math.min(semantic * 0.72 + usage * 0.20 + variantBoost, 1);
      const reasons = [];
      if (semantic > 0) reasons.push("name overlap");
      if (usage > 0) reasons.push("existing usage");
      if (variantBoost) reasons.push("variant metadata available");
      return { component, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};
