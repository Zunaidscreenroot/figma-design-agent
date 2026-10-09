import type { AgentContext, CritiqueResult, DesignNode, ValidationIssue } from "@figma-design-agent/core";
const walk = (node: DesignNode, out: DesignNode[] = []): DesignNode[] => { out.push(node); for (const child of node.children) walk(child, out); return out; };
export const structuralCritique = (context: AgentContext): CritiqueResult => {
  const issues: ValidationIssue[] = []; const root = context.selectedNode;
  if (!root) return { passed: false, score: 0, issues: [{ severity: "error", code: "NO_TARGET", message: "No target frame is available for verification.", suggestedFix: "Select a frame or screen." }], decisions: [] };
  const nodes = walk(root); const seen = new Set<string>(); const duplicateIds = new Set<string>();
  for (const node of nodes) { if (seen.has(node.id)) duplicateIds.add(node.id); seen.add(node.id); }
  if (duplicateIds.size) issues.push({ severity: "error", code: "DUPLICATE_NODE_IDS", message: "Context contains duplicate node IDs." });
  const textNodes = nodes.filter((node) => node.type === "TEXT");
  const placeholderPattern = /\b(lorem ipsum|placeholder text|sample text|title here|description goes here|headline here|text goes here|button label|your title|insert copy)\b/i;
  for (const node of textNodes) {
    const value = (node.text ?? "").trim();
    if (!value) issues.push({ severity: "warning", code: "EMPTY_TEXT", message: "Text node has no visible content.", nodeId: node.id, suggestedFix: "Provide content or remove the node." });
    else if (placeholderPattern.test(value)) issues.push({ severity: "warning", code: "PLACEHOLDER_COPY", message: "Visible UI copy still contains generic placeholder text.", nodeId: node.id, suggestedFix: "Replace it with realistic product-specific content." });
    if (node.style?.fontSize !== undefined && node.style.fontSize < 10) issues.push({ severity: "warning", code: "TINY_TEXT", message: "Text is below 10 px and may be difficult to read.", nodeId: node.id, suggestedFix: "Use a legible type size or document the intentional exception." });
  }
  const genericLayerName = /^(frame|rectangle|group|text|ellipse|line|component)\s+\d+$/i;
  for (const node of nodes) if (node.type !== "TEXT" && genericLayerName.test(node.name.trim())) issues.push({ severity: "warning", code: "GENERIC_LAYER_NAME", message: "A layer still has a generic default name.", nodeId: node.id, suggestedFix: "Rename it for its content or semantic role." });
  const hardcodedLayout = nodes.filter((node) => node.layout?.mode === "NONE" && node.children.length > 4);
  for (const node of hardcodedLayout) issues.push({ severity: "warning", code: "LAYOUT_REVIEW", message: "A container with many children is not using Auto Layout; review whether this is intentional.", nodeId: node.id });
  const width = root.bounds?.width ?? 0;
  if (width > 0 && width < 480 && root.layout?.padding) {
    const padding = root.layout.padding;
    if (padding.left > 32 || padding.right > 32) issues.push({ severity: "warning", code: "MOBILE_PADDING", message: "Horizontal padding is large for a narrow mobile frame.", nodeId: root.id, suggestedFix: "Check project mobile spacing rules." });
  }
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  return { passed: errorCount === 0, score: Math.max(0, 100 - errorCount * 35 - warningCount * 8), issues, decisions: [] };
};
