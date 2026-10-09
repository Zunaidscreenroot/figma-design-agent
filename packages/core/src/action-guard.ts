import type { ActionPlan, DesignAction } from "./actions.js";
const finite = (value: number) => Number.isFinite(value) && Math.abs(value) < 1_000_000;
const ref = (value: string) => value.startsWith("$") ? value.slice(1) : null;
const validColor = (value: string) => /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
export const guardAction = (action: DesignAction): string[] => {
  const issues: string[] = [];
  if (!action.id.trim()) issues.push("action id is required");
  if ("targetId" in action && action.targetId && !action.targetId.trim()) issues.push("targetId is empty");
  if ("width" in action && (!finite(action.width) || action.width <= 0)) issues.push("width must be finite and positive");
  if ("height" in action && (!finite(action.height) || action.height <= 0)) issues.push("height must be finite and positive");
  if ("x" in action && action.x !== undefined && !finite(action.x)) issues.push("x must be finite");
  if ("y" in action && action.y !== undefined && !finite(action.y)) issues.push("y must be finite");
  if ("fill" in action && action.fill && !validColor(action.fill)) issues.push("fill must be a hex color");
  if ("color" in action && action.color && !validColor(action.color)) issues.push("color must be a hex color");
  if (action.action === "set_fill" && action.opacity !== undefined && (!finite(action.opacity) || action.opacity < 0 || action.opacity > 1)) issues.push("opacity must be between 0 and 1");
  if (action.action === "set_stroke" && (!finite(action.weight) || action.weight < 0)) issues.push("stroke weight must be finite and non-negative");
  if (action.action === "set_corner_radius" && (!finite(action.radius) || action.radius < 0)) issues.push("corner radius must be finite and non-negative");
  if (action.action === "create_frame" && action.cornerRadius !== undefined && (!finite(action.cornerRadius) || action.cornerRadius < 0)) issues.push("corner radius must be finite and non-negative");
  if (action.action === "create_rectangle" && action.cornerRadius !== undefined && (!finite(action.cornerRadius) || action.cornerRadius < 0)) issues.push("corner radius must be finite and non-negative");
  if (action.action === "set_text_style" && action.fontSize !== undefined && (!finite(action.fontSize) || action.fontSize <= 0)) issues.push("font size must be finite and positive");
  if (action.action === "create_text" && action.fontSize !== undefined && (!finite(action.fontSize) || action.fontSize <= 0)) issues.push("font size must be finite and positive");
  return issues;
};
export const guardPlan = (plan: ActionPlan, maxActions = 80) => {
  const errors: string[] = [];
  if (plan.actions.length > maxActions) errors.push("too many actions: " + plan.actions.length);
  const ids = new Set(plan.actions.map((action) => action.id));
  if (ids.size !== plan.actions.length) errors.push("action IDs must be unique");
  for (const action of plan.actions) {
    for (const issue of guardAction(action)) errors.push(action.id + ": " + issue);
    if ("targetId" in action) { const target = ref(action.targetId); if (target && !ids.has(target)) errors.push(action.id + ": unknown symbolic target " + action.targetId); }
    if ("parentId" in action && action.parentId) { const parent = ref(action.parentId); if (parent && !ids.has(parent)) errors.push(action.id + ": unknown symbolic parent " + action.parentId); }
    for (const dependency of action.dependsOn ?? []) if (!ids.has(dependency)) errors.push(action.id + ": unknown dependency " + dependency);
  }
  return errors;
};
